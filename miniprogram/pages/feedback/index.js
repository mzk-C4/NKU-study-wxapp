const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { listFeedback, submitFeedback } = require('../../utils/feedback-api')
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

Page({
  data: {
    loading: true, error: '', submitting: false,
    feedbacks: [], visibleFeedbacks: [], searchKeyword: '', title: '', content: '', contact: '', mine: false,
    type: 'bug', typeOptions: [
      { value: 'bug', label: 'Bug' },
      { value: 'feature', label: '功能改进' },
      { value: 'content', label: '内容问题' }
    ],
    filterStatus: 'all', statusOptions: [
      { value: 'all', label: '全部' },
      { value: 'open', label: '待处理' },
      { value: 'completed', label: '已完成' },
      { value: 'rejected', label: '不予完成' }
    ]
  },
  onLoad(options = {}) {
    const prefillTitle = decodeURIComponent(String(options.prefill_title || '')).slice(0, 120)
    const prefillContent = decodeURIComponent(String(options.prefill_content || '')).slice(0, 2000)
    this.setData({
      mine: options.mine === '1',
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
      const data = this.data.mine
        ? await publicApi.getMyFeedback({ page: 1, page_size: 100 })
        : await listFeedback()
      const items = ((data || {}).items || []).map(item => ({
        ...item,
        reply: String(item.reply || ''),
        repliedAt: item.repliedAt || '',
        createdAtLabel: beijingDateLabel(item.createdAt),
        repliedAtLabel: beijingDateLabel(item.repliedAt), 
        statusLabel: { open: '待处理', completed: '已完成', rejected: '不予完成', parked: '搁置' }[item.status] || item.status,
        typeLabel: { bug: 'Bug', feature: '功能改进', content: '内容问题' }[item.type] || item.type || '反馈'
      }))
      this.setData({ feedbacks: items, loading: false })
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
  inputTitle(e) { this.setData({ title: e.detail.value }) },
  inputContent(e) { this.setData({ content: e.detail.value }) },
  inputContact(e) { this.setData({ contact: e.detail.value }) },
  chooseType(e) { this.setData({ type: e.currentTarget.dataset.value }) },
  chooseStatus(e) { this.setData({ filterStatus: e.currentTarget.dataset.value }); this.applyFilters() },
  async submit() {
    const { title, content, contact, type, submitting } = this.data
    if (!title.trim() || !content.trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' }); return
    }
    if (submitting) return
    this.setData({ submitting: true })
    try {
      const res = await submitFeedback({ title: title.trim(), content: content.trim(), type, contact: contact.trim() })
      if (res.statusCode >= 400) throw new Error(res.data?.error || '提交失败')
      wx.showToast({ title: '已提交', icon: 'success' })
      this.setData({ title: '', content: '', contact: '', submitting: false })
      this.loadFeedback()
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})

module.exports = { beijingDateLabel }
