const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const feedbackApi = require('../../utils/feedback-api')
const { publicApi } = require('../../services/public-api')
const authSession = require('../../utils/auth-session')
const drafts = require('../../utils/form-draft')

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
    loading: true, error: '', submitting: false, submitError: '', loggedIn: false, hasDraft: false, draftNotice: '',
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
    this._isUnloaded = false
    this._prefill = { title: prefillTitle, content: prefillContent }
    this.setData({
      ...(prefillTitle ? { title: prefillTitle, type: 'content' } : {}),
      ...(prefillContent ? { content: prefillContent } : {})
    })
    this.startDraft()
    reportVisit('/mp/feedback')
    this.loadFeedback()
  },
  onShow() {
    theme.onPageShow()
    const changedAccount = this._draft && this._draft.account !== drafts.owner(true)
    this.startDraft()
    if (changedAccount) this.loadFeedback()
  },
  onHide() { if (this._draft) this._draft.flush() },
  onUnload() { if (this._draft) this._draft.flush(); this._isUnloaded = true; this._listRequestId = (this._listRequestId || 0) + 1 },
  startDraft() {
    const prefill = this._prefill || { title: '', content: '' }
    const context = prefill.title || prefill.content ? `prefill:${prefill.title}\n${prefill.content}` : 'general'
    if (this._draft && this._draft.account === drafts.owner(true) && this._draft.context === context) return
    if (this._draft) {
      this._draft.flush(); this._draft.stop()
      this.setData({ title: prefill.title, content: prefill.content, contact: '', reportUrl: '', reportTarget: '', type: prefill.title ? 'content' : 'bug', submitError: '', myFeedbacks: [] })
    }
    this._draft = drafts.createFormDraft(this, { kind: 'feedback', context, allowGuest: true })
    this._draft.restore()
  },
  discardDraft() {
    if (this.data.submitting || !this._draft) return
    const draft = this._draft
    wx.showModal({ title: '清除这份反馈草稿？', content: '只清除本机未提交内容，不影响已提交反馈。', success: result => {
      if (!result.confirm || this._isUnloaded || this.data.submitting || draft !== this._draft) return
      if (!draft.clear()) { this.setData({ draftNotice: '清除失败，草稿仍保留，请稍后重试。' }); return }
      this.setData({ title: '', content: '', contact: '', reportUrl: '', reportTarget: '', type: 'bug', submitError: '', hasDraft: false, draftNotice: '已清除本机草稿。' })
    } })
  },
  updateDraftField(patch) {
    if (this.data.submitting) return
    this.setData({ ...patch, submitError: '' })
    if (this._draft) this._draft.changed()
  },
  onPullDownRefresh() { this.loadFeedback().finally(() => wx.stopPullDownRefresh()) },
  async loadFeedback() {
    const requestId = this._listRequestId = (this._listRequestId || 0) + 1
    const token = authSession.getToken()
    this.setData({ loading: true, error: '', myFeedbacks: [] })
    try {
      // 已登录时并行拉公开反馈与本人反馈；未登录只拉公开
      const tasks = [feedbackApi.listFeedback()]
      const loggedIn = Boolean(authSession.readSession())
      if (loggedIn) tasks.push(publicApi.getMyFeedback({ page: 1, page_size: 100 }).catch(() => ({ items: [] })))
      const [publicResult, myResult] = await Promise.all(tasks)
      if (this._isUnloaded || requestId !== this._listRequestId) return
      if (token !== authSession.getToken()) return this.loadFeedback()
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
    } catch (error) {
      if (this._isUnloaded || requestId !== this._listRequestId) return
      if (token !== authSession.getToken()) return this.loadFeedback()
      this.setData({ loading: false, error: error.message || '加载失败' })
    }
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
  inputTitle(e) { this.updateDraftField({ title: String(e.detail.value || '').slice(0, 120) }) },
  inputReportUrl(e) { this.updateDraftField({ reportUrl: String(e.detail.value || '').slice(0, 300) }) },
  inputReportTarget(e) { this.updateDraftField({ reportTarget: String(e.detail.value || '').slice(0, 120) }) },
  inputContent(e) { this.updateDraftField({ content: String(e.detail.value || '').slice(0, 2000) }) },
  inputContact(e) { this.updateDraftField({ contact: String(e.detail.value || '').slice(0, 120) }) },
  chooseType(e) {
    const type = e.currentTarget.dataset.value
    if (this.data.typeOptions.some(option => option.value === type)) this.updateDraftField({ type })
  },
  chooseStatus(e) { this.setData({ filterStatus: e.currentTarget.dataset.value }); this.applyFilters() },
  async submit() {
    const { title, content, contact, type, submitting } = this.data
    if (submitting) return
    if (this._draft && this._draft.account !== drafts.owner(true)) { this.startDraft(); return }
    if (!title.trim() || !content.trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' }); return
    }
    this.setData({ submitting: true, submitError: '' })
    const draft = this._draft
    const token = authSession.getToken()
    if (draft) draft.flush()
    try {
      const extra = (type === 'report' || type === 'complaint') ? { reportUrl: this.data.reportUrl.trim(), reportTarget: this.data.reportTarget.trim() } : {}
      const res = await feedbackApi.submitFeedback({ title: title.trim(), content: content.trim(), type, contact: contact.trim(), ...extra })
      const accepted = Number.isInteger(res?.statusCode) && res.statusCode >= 200 && res.statusCode < 300 && res.data?.ok === true
      const cleared = accepted && (!draft || draft.submitted())
      if (this._isUnloaded || token !== authSession.getToken() || draft !== this._draft) return
      if (!accepted) {
        this.setData({ submitError: submitFailure(res?.statusCode) })
        return
      }
      wx.showToast({ title: '已提交', icon: 'success' })
      this.setData({ title: '', content: '', contact: '', reportUrl: '', reportTarget: '', hasDraft: !cleared,
        draftNotice: cleared ? '提交成功，已清除本机草稿。' : '提交成功，但旧草稿清除失败，请手动清除，勿重复提交。' })
      this.loadFeedback()
    } catch (_) {
      if (this._isUnloaded || token !== authSession.getToken() || draft !== this._draft) return
      this.setData({ submitError: '网络异常，未确认提交结果。内容仍保留，请先查看“我的反馈”再决定是否重试。' })
    } finally { if (!this._isUnloaded) this.setData({ submitting: false }) }
  }
})

module.exports = { beijingDateLabel }
