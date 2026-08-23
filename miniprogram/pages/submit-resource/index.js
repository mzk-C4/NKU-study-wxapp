const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')

const RESOURCE_TYPES = ['试卷', '笔记', '课件', '作业', '教材']
const PLATFORMS = ['百度网盘', '夸克网盘', '阿里云盘', '腾讯微云', '蓝奏云', '123云盘', '其他']
const DRAFT_KEY = 'nkustudy_resource_draft'

Page({
  onLoad() {
    reportVisit('/mp/submit-resource')
    this.restoreDraft()
  },

  data: {
      themeClass: '',
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
    if (!form.title.trim()) { wx.showToast({ title: '请输入资料标题', icon: 'none' }); return false }
    if (!form.type) { wx.showToast({ title: '请选择资料类型', icon: 'none' }); return false }
    if (!form.platform) { wx.showToast({ title: '请选择网盘平台', icon: 'none' }); return false }
    if (!form.url.trim()) { wx.showToast({ title: '请输入分享链接', icon: 'none' }); return false }
    return true
  },

  submit() {
    if (!this.validate() || this.data.submitting) return
    this.setData({ submitting: true })

    // 投稿接口尚未开放（issue #11），本地保存并引导到网站
    const submissions = wx.getStorageSync('nkustudy_submissions') || []
    submissions.unshift({
      id: 'local-' + Date.now(),
      title: this.data.form.title.trim(),
      type: this.data.form.type,
      platform: this.data.form.platform,
      url: this.data.form.url.trim(),
      status: 'pending',
      submitted_at: new Date().toLocaleString('zh-CN')
    })
    wx.setStorageSync('nkustudy_submissions', submissions)
    wx.removeStorageSync(DRAFT_KEY)

    wx.showModal({
      title: '投稿已暂存',
      content: '小程序投稿接口尚未开放，已将投稿信息保存在本地。现阶段请通过 NKUStudy 网站提交资料，管理员审核后会发布到小程序。',
      showCancel: false,
      success: () => {
        this.setData({ submitting: false })
        wx.navigateTo({ url: '/pages/submission-status/index' })
      }
    })
  }
})