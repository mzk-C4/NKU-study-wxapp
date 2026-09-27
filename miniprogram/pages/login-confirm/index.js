const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')
const { authSession } = require('../../services/auth')

// 网页扫码登录确认页：由小程序码 scene=ticket 进入，或手动输入登录码
Page({
  data: {
    ticket: '',
    manualInput: '',
    loggedIn: false,
    phoneVerified: false,
    confirming: false,
    done: false,
    error: ''
  },

  onLoad(options) {
    reportVisit('/mp/login-confirm')
    let ticket = ''
    try {
      const scene = decodeURIComponent(String(options && options.scene || ''))
      // scene 只放票据本身；兼容 t=<ticket> 形态
      ticket = scene.startsWith('t=') ? scene.slice(2) : scene
    } catch (e) { ticket = '' }
    if (!ticket && options && options.ticket) ticket = String(options.ticket)
    this.setData({ ticket })
    this.refreshLoginState()
  },
  onShow() { theme.onPageShow(); this.refreshLoginState() },

  refreshLoginState() {
    const user = authSession.getCachedUser && authSession.getCachedUser()
    const token = authSession.getToken && authSession.getToken()
    this.setData({ loggedIn: Boolean(token), phoneVerified: Boolean(user && user.phone_verified) })
    if (token && !user) {
      publicApi.getMe().then((me) => {
        this.setData({ phoneVerified: Boolean(me && me.phone_verified) })
      }).catch(() => {})
    }
  },

  onManualInput(e) {
    this.setData({ manualInput: e.detail.value, error: '' })
  },

  useManualTicket() {
    const value = this.data.manualInput.trim()
    if (!value) { this.setData({ error: '请输入网页上显示的登录码' }); return }
    this.setData({ ticket: value, done: false, error: '' })
  },

  async ensureLogin() {
    if (authSession.getToken && authSession.getToken()) return true
    try {
      const code = await new Promise((resolve, reject) => {
        wx.login({ timeout: 10000, success: (r) => (r.code ? resolve(r.code) : reject(new Error('no code'))), fail: () => reject(new Error('wx.login failed')) })
      })
      await publicApi.loginWechat(code)
      this.refreshLoginState()
      return true
    } catch (e) {
      this.setData({ error: '登录失败，请在「我的」页先完成微信登录' })
      return false
    }
  },

  async confirmLogin() {
    if (this.data.confirming || this.data.done) return
    const ticket = this.data.ticket || this.data.manualInput.trim()
    if (!ticket) { this.setData({ error: '请输入网页上显示的登录码' }); return }
    if (!(await this.ensureLogin())) return
    this.setData({ confirming: true, error: '' })
    try {
      const result = await publicApi.confirmWebLogin(ticket)
      if (!result || !result.confirmed) throw new Error('确认未生效，请重试')
      this.setData({ done: true, confirming: false, ticket })
    } catch (e) {
      const message = e && (e.message || e.errMsg) || '确认失败'
      this.setData({ confirming: false, error: message.includes('手机号') ? '需先在「我的」页完成手机号验证' : message })
    }
  }
})
