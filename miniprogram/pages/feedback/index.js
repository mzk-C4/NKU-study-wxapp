const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const feedbackApi = require('../../utils/feedback-api')
const { publicApi } = require('../../services/public-api')

// 后端存 UTC ISO（带 Z）：转成北京时间（UTC+8）并只保留年月日
function beijingDateLabel(value) {
  const date = new Date(value || '')
  if (!value || Number.isNaN(date.getTime())) return ''
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function decodePrefill(value, limit) {
  const text = typeof value === 'string' ? value : ''
  try { return decodeURIComponent(text).slice(0, limit) } catch (_) { return text.slice(0, limit) }
}

function submitFailure(status) {
  if (status === 401) return '请到“我的”重新登录后提交，已填写的内容仍保留在本页。'
  if (status === 403) return '暂时无法提交，请确认账号已完成手机号验证；也可能是反馈提交暂未开放。'
  if (status === 400) return '请检查标题，并补充更完整的反馈内容。'
  if (status === 429) return '提交太频繁，请稍后再试。'
  return '未确认提交成功，内容仍保留。请先查看“我的反馈”，确认没有收到后再重试。'
}

Page({
  data: {
    loading: true, error: '', submitting: false, submitError: '', loggedIn: false,
    feedbacks: [], visibleFeedbacks: [], myFeedbacks: [], searchKeyword: '', title: '', content: '', contact: '',
    type: 'bug', typeOptions: [
      { value: 'bug', label: 'Bug' },
      { value: 'feature', label: '功能改进' },
      { value: 'content', label: '内容问题' },
      { value: 'report', label: '违法有害信息举报' },
      { value: 'complaint', label: '内容投诉' }
    ],
    reportUrl: '',
    reportTarget: '',
    filterStatus: 'all', statusOptions: [
      { value: 'all', label: '全部' },
      { value: 'open', label: '待处理' },
      { value: 'completed', label: '已完成' },
      { value: 'rejected', label: '不予完成' }
    ]
  },
  onLoad(options = {}) {
    const prefillTitle = decodePrefill(options.prefill_title, 120)
    const prefillContent = decodePrefill(options.prefill_content, 2000)
    this.setData({
      ...(prefillTitle ? { title: prefillTitle, type: 'content' } : {}),
      ...(prefillContent ? { content: prefillContent } : {})
    })
    reportVisit('/mp/feedback')
    this.loadFeedback()
  },
  onShow() { theme.onPageShow() },
  onPullDownRefresh() { this.loadFeedback().finally(() => wx.stopPullDownRefresh()) },
  async loadFeedback() {
    this.setData({ loading: true, error: '' })
    try {
      // 已登录时并行拉公开反馈与本人反馈；未登录只拉公开
      const tasks = [feedbackApi.listFeedback()]
      const loggedIn = Boolean(require('../../utils/auth-session').readSession())
      if (loggedIn) tasks.push(publicApi.getMyFeedback({ page: 1, page_size: 100 }).catch(() => ({ items: [] })))
      const [publicResult, myResult] = await Promise.all(tasks)
      const present = item => ({
        ...item,
        ...item,
        reply: String(item.reply || ''),
        repliedAt: item.repliedAt || '',
        createdAtLabel: beijingDateLabel(item.createdAt),
        repliedAtLabel: beijingDateLabel(item.repliedAt),
        statusLabel: { open: '待处理', completed: '已完成', rejected: '不予完成', parked: '搁置' }[item.status] || item.status,
        typeLabel: { bug: 'Bug', feature: '功能改进', content: '内容问题', report: '违法举报', complaint: '内容投诉' }[item.type] || item.type || '反馈'
      })
      const feedbacks = ((publicResult || {}).items || []).map(present)
      const myFeedbacks = loggedIn ? ((myResult || {}).items || []).map(present) : []
      this.setData({ feedbacks, myFeedbacks, loggedIn, loading: false })
      this.applyFilters()
    } catch (error) { this.setData({ loading: false, error: error.message || '加载失败' }) }
  },
  inputSearchKeyword(e) { this.setData({ searchKeyword: e.detail.value }); this.applyFilters() },
  clearSearchKeyword() { this.setData({ searchKeyword: '' }); this.applyFilters() },
  applyFilters() {
    const keyword = String(this.data.searchKeyword || '').trim().toLowerCase()
    const status = this.data.filterStatus
    const list = (this.data.feedbacks || []).filter(item => {
      if (status !== 'all' && item.status !== status) return false
      if (!keyword) return true
      return [item.title, item.content, item.typeLabel, item.reply].filter(Boolean).join(String.fromCharCode(10)).toLowerCase().includes(keyword)
    })
    this.setData({ visibleFeedbacks: list })
  },
  inputTitle(e) { if (!this.data.submitting) this.setData({ title: String(e.detail.value || '').slice(0, 120), submitError: '' }) },
  inputReportUrl(e) { if (!this.data.submitting) this.setData({ reportUrl: String(e.detail.value || '').slice(0, 300), submitError: '' }) },
  inputReportTarget(e) { if (!this.data.submitting) this.setData({ reportTarget: String(e.detail.value || '').slice(0, 120), submitError: '' }) },
  inputContent(e) { if (!this.data.submitting) this.setData({ content: String(e.detail.value || '').slice(0, 2000), submitError: '' }) },
  inputContact(e) { if (!this.data.submitting) this.setData({ contact: String(e.detail.value || '').slice(0, 120), submitError: '' }) },
  chooseType(e) {
    const type = e.currentTarget.dataset.value
    if (!this.data.submitting && this.data.typeOptions.some(option => option.value === type)) this.setData({ type, submitError: '' })
  },
  chooseStatus(e) { this.setData({ filterStatus: e.currentTarget.dataset.value }); this.applyFilters() },
  async submit() {
    const { title, content, contact, type, submitting } = this.data
    if (submitting) return
    if (!title.trim() || !content.trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' }); return
    }
    this.setData({ submitting: true, submitError: '' })
    try {
      const extra = (type === 'report' || type === 'complaint') ? { reportUrl: this.data.reportUrl.trim(), reportTarget: this.data.reportTarget.trim() } : {}
      const res = await feedbackApi.submitFeedback({ title: title.trim(), content: content.trim(), type, contact: contact.trim(), ...extra })
      if (!Number.isInteger(res?.statusCode) || res.statusCode < 200 || res.statusCode >= 300 || res.data?.ok !== true) {
        this.setData({ submitError: submitFailure(res?.statusCode) })
        return
      }
      wx.showToast({ title: '已提交', icon: 'success' })
      this.setData({ title: '', content: '', contact: '', reportUrl: '', reportTarget: '' })
      this.loadFeedback()
    } catch (_) {
      this.setData({ submitError: '网络异常，未确认提交结果。内容仍保留，请先查看“我的反馈”再决定是否重试。' })
    } finally { this.setData({ submitting: false }) }
  }
})

module.exports = { beijingDateLabel }
