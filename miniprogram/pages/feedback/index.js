const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { listFeedback, submitFeedback } = require('../../utils/feedback-api')




Page({
  data: {
    loading: true, error: '', submitting: false,
    feedbacks: [], title: '', content: '', contact: '',
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
  onLoad() { reportVisit('/mp/feedback'); this.loadFeedback() },
    onShow() { theme.onPageShow() },
  onPullDownRefresh() { this.loadFeedback().finally(() => wx.stopPullDownRefresh()) },
  async loadFeedback() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await listFeedback()
      const items = ((data || {}).items || []).map(item => ({
        ...item,
        statusLabel: { open: '待处理', completed: '已完成', rejected: '不予完成', parked: '搁置' }[item.status] || item.status,
        typeLabel: { bug: 'Bug', feature: '功能改进', content: '内容问题' }[item.type] || item.type || '反馈'
      }))
      this.setData({ feedbacks: items, loading: false })
    } catch (error) { this.setData({ loading: false, error: error.message || '加载失败' }) }
  },
  inputTitle(e) { this.setData({ title: e.detail.value }) },
  inputContent(e) { this.setData({ content: e.detail.value }) },
  inputContact(e) { this.setData({ contact: e.detail.value }) },
  chooseType(e) { this.setData({ type: e.currentTarget.dataset.value }) },
  chooseStatus(e) { this.setData({ filterStatus: e.currentTarget.dataset.value }) },
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