const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const feedbackApi = require('../../utils/feedback-api')

const RESOURCE_TYPES = ['试卷', '笔记', '课件', '作业', '教材']
const PLATFORMS = ['百度网盘', '夸克网盘', '阿里云盘', '腾讯微云', '蓝奏云', '123云盘', '其他']
const DRAFT_KEY = 'nkustudy_resource_draft'

Page({
  onLoad(options) {
    reportVisit('/mp/submit-resource')
    this.restoreDraft()
    if (options && options.courseName) {
      this.setData({ 'form.courseName': decodeURIComponent(options.courseName) })
    }
  },
    onShow() { theme.onPageShow() },

  data: {
    form: {
      courseName: '',
      title: '',
      type: '',
      platform: '',
      url: '',
      code: '',
      description: ''
    },
    resourceTypes: RESOURCE_TYPES,
    platforms: PLATFORMS,
    submitting: false
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ ['form.' + field]: event.detail.value })
  },

  onTypeChange(event) {
    this.setData({ 'form.type': this.data.resourceTypes[event.detail.value] })
  },

  onPlatformChange(event) {
    this.setData({ 'form.platform': this.data.platforms[event.detail.value] })
  },

  saveDraft() {
    wx.setStorageSync(DRAFT_KEY, this.data.form)
    wx.showToast({ title: '草稿已保存', icon: 'success' })
  },

  restoreDraft() {
    const draft = wx.getStorageSync(DRAFT_KEY)
    if (draft) this.setData({ form: { ...this.data.form, ...draft } })
  },

  validate() {
    const { form } = this.data
    if (!form.courseName.trim()) { wx.showToast({ title: '请输入课程名称', icon: 'none' }); return false }
    if (!form.title.trim()) { wx.showToast({ title: '请输入资料标题', icon: 'none' }); return false }
    if (!form.type) { wx.showToast({ title: '请选择资料类型', icon: 'none' }); return false }
    if (!form.platform) { wx.showToast({ title: '请选择网盘平台', icon: 'none' }); return false }
    if (!form.url.trim()) { wx.showToast({ title: '请输入分享链接', icon: 'none' }); return false }
    return true
  },

  recordSubmission() {
    const { form } = this.data
    const submissions = wx.getStorageSync('nkustudy_submissions') || []
    submissions.unshift({
      id: 'local-' + Date.now(),
      title: form.title.trim(),
      type: form.type,
      platform: form.platform,
      url: form.url.trim(),
      status: 'pending',
      submitted_at: new Date().toLocaleString('zh-CN')
    })
    wx.setStorageSync('nkustudy_submissions', submissions.slice(0, 50))
  },

  buildFeedbackBody() {
    const { form } = this.data
    const lines = [
      `课程：${form.courseName.trim()}`,
      `资料：${form.title.trim()}`,
      `类型：${form.type}`,
      `平台：${form.platform}`,
      `链接：${form.url.trim()}`
    ]
    if (form.code.trim()) lines.push(`提取码：${form.code.trim()}`)
    if (form.description.trim()) lines.push(`说明：${form.description.trim()}`)
    return {
      title: `[资料投稿] ${form.courseName.trim()} - ${form.title.trim()}`.slice(0, 120),
      content: lines.join('\n'),
      type: 'content',
      resourceRef: form.courseName.trim()
    }
  },

  async submit() {
    if (!this.validate() || this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const response = await feedbackApi.submitFeedback(this.buildFeedbackBody())
      const body = response.data || {}
      if (response.statusCode >= 400 || body.ok === false) {
        throw new Error(body.error || '提交失败，请稍后重试')
      }
      this.recordSubmission()
      wx.removeStorageSync(DRAFT_KEY)
      wx.showModal({
        title: '投稿已提交',
        content: '资料已进入审核队列，管理员通过后会发布到对应课程的资料页，可在「我的-资料投稿」查看进度。',
        showCancel: false,
        success: () => {
          this.setData({ submitting: false })
          wx.navigateTo({ url: '/pages/submission-status/index' })
        }
      })
    } catch (error) {
      // 网络异常时本地暂存草稿内容，避免投稿信息丢失
      wx.showToast({ title: (error.message || '网络异常') + '，请稍后重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})
