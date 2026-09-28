const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const feedbackApi = require('../../utils/feedback-api')
const authSession = require('../../utils/auth-session')

const RESOURCE_TYPES = ['试卷', '笔记', '课件', '作业', '教材']
const PLATFORMS = ['百度网盘', '夸克网盘', '阿里云盘', '腾讯微云', '蓝奏云', '123云盘', '其他']
const DRAFT_KEY = 'nkustudy_resource_draft'
const LIMITS = { courseName: 80, title: 100, type: 10, platform: 20, url: 500, code: 20, description: 500 }
function cleanForm(value = {}) {
  return Object.fromEntries(Object.entries(LIMITS).map(([key, limit]) => [key, typeof value[key] === 'string' ? value[key].slice(0, limit) : '']))
}

Page({
  onLoad(options) {
    reportVisit('/mp/submit-resource')
    this.restoreDraft()
    if (options && options.courseName) {
      try { this.setData({ 'form.courseName': decodeURIComponent(options.courseName).slice(0, 80) }) } catch (_) {}
    }
  },
    onShow() { theme.onPageShow(); this.setData({ loggedIn: Boolean(authSession.readSession()) }) },

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
    submitting: false,
    loggedIn: false,
    submitError: '',
    submitted: false
  },

  onInput(event) {
    if (this.data.submitting) return
    const field = event.currentTarget.dataset.field
    if (Object.prototype.hasOwnProperty.call(LIMITS, field)) this.setData({ ['form.' + field]: String(event.detail.value).slice(0, LIMITS[field]), submitError: '', submitted: false })
  },

  onTypeChange(event) {
    if (this.data.submitting) return
    const type = this.data.resourceTypes[Number(event.detail.value)]
    if (type) this.setData({ 'form.type': type, submitted: false })
  },

  onPlatformChange(event) {
    if (this.data.submitting) return
    const platform = this.data.platforms[Number(event.detail.value)]
    if (platform) this.setData({ 'form.platform': platform, submitted: false })
  },

  saveDraft() {
    try { wx.setStorageSync(DRAFT_KEY, cleanForm(this.data.form)); wx.showToast({ title: '草稿已保存', icon: 'success' }); return true }
    catch (_) { wx.showToast({ title: '草稿保存失败，请勿关闭页面', icon: 'none' }); return false }
  },

  restoreDraft() {
    try { const draft = wx.getStorageSync(DRAFT_KEY); if (draft) this.setData({ form: cleanForm(draft) }) } catch (_) {}
  },

  validate() {
    const { form } = this.data
    if (!form.courseName.trim()) { wx.showToast({ title: '请输入课程名称', icon: 'none' }); return false }
    if (!form.title.trim()) { wx.showToast({ title: '请输入资料标题', icon: 'none' }); return false }
    if (!RESOURCE_TYPES.includes(form.type)) { wx.showToast({ title: '请选择资料类型', icon: 'none' }); return false }
    if (!PLATFORMS.includes(form.platform)) { wx.showToast({ title: '请选择网盘平台', icon: 'none' }); return false }
    if (!/^https:\/\/[^\s/@?#]+\.[^\s/@?#]+(?:[/?#][^\s]*)?$/i.test(form.url.trim())) { wx.showToast({ title: '请填写完整的 HTTPS 分享链接', icon: 'none' }); return false }
    return true
  },

  goLogin() { if (!this.data.submitting && this.saveDraft()) wx.switchTab({ url: '/pages/profile/index' }) },
  openFeedback() { wx.navigateTo({ url: '/pages/feedback/index' }) },

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
    if (this.data.submitting) return
    if (!authSession.readSession()) { this.setData({ loggedIn: false, submitError: '请先到“我的”登录，再返回提交。表单内容不会清空。' }); return }
    if (!this.validate()) return
    this.setData({ submitting: true, submitError: '' })
    try {
      const response = await feedbackApi.submitFeedback(this.buildFeedbackBody())
      const body = response.data || {}
      if (response.statusCode === 401) { authSession.clearSession(); this.setData({ loggedIn: false }); throw new Error('登录已过期，请重新登录后提交。') }
      if (response.statusCode === 403) throw new Error('暂时无法投稿，请到“我的”确认手机号已验证；若仍失败，请稍后重试。')
      if (!Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode >= 300 || body.ok !== true) {
        throw new Error(response.statusCode === 429 ? '提交太频繁，请稍后重试。' : '未确认提交成功，请稍后重试。')
      }
      try { wx.removeStorageSync(DRAFT_KEY) } catch (_) {}
      this.setData({ submitted: true, form: cleanForm() })
    } catch (error) {
      let saved = false
      try { wx.setStorageSync(DRAFT_KEY, cleanForm(this.data.form)); saved = true } catch (_) {}
      this.setData({ submitError: (error.message || '网络异常，请稍后重试。') + (saved ? ' 草稿已保存。' : ' 请勿关闭本页，表单仍保留。') })
    } finally { this.setData({ submitting: false }) }
  }
})
