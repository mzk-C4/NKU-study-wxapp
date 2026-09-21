const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { parseMarkdown } = require('../../utils/markdown')
const { publicApi } = require('../../services/public-api')
const authSession = require('../../utils/auth-session')

// 捐助页：文案/预设金额来自 GET /api/v1/donate（后台"捐助页面管理"可改）。
// 确定后选择/输入金额；支付需商户配置就绪（pay_enabled），未配置时给出友好提示。
Page({
  data: {
    loading: true,
    error: '',
    title: '捐助支持',
    blocks: [],
    amounts: [],
    payEnabled: false,
    pickerVisible: false,
    selectedAmount: 0,
    customAmount: '',
    paying: false
  },

  onLoad() {
    reportVisit('/mp/donate')
    this.loadDonate()
  },
  onShow() { theme.onPageShow() },
  onPullDownRefresh() {
    this.loadDonate().finally(() => wx.stopPullDownRefresh())
  },

  async loadDonate() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await publicApi.getDonate()
      this.setData({
        loading: false,
        title: data.title || '捐助支持',
        blocks: parseMarkdown(String(data.content || '')),
        amounts: Array.isArray(data.amounts) ? data.amounts : [],
        payEnabled: data.pay_enabled === true
      })
      wx.setNavigationBarTitle({ title: data.title || '捐助支持' })
    } catch (error) {
      this.setData({ loading: false, error: error.message || '捐助页加载失败' })
    }
  },

  exit() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/index' }) })
  },

  confirmDonate() {
    if (!this.data.amounts.length && !this.data.payEnabled) {
      // 无预设金额且未开通支付：提示后仍允许进入自定义金额（联系管理员场景）
    }
    this.setData({ pickerVisible: true, selectedAmount: this.data.amounts[0] || 0, customAmount: '' })
  },

  closePicker() {
    if (this.data.paying) return
    this.setData({ pickerVisible: false })
  },

  chooseAmount(event) {
    this.setData({ selectedAmount: Number(event.currentTarget.dataset.value) || 0, customAmount: '' })
  },

  inputCustomAmount(event) {
    const value = String(event.detail.value || '').replace(/[^\d.]/g, '')
    this.setData({ customAmount: value, selectedAmount: 0 })
  },

  currentAmount() {
    const custom = Number(this.data.customAmount)
    if (this.data.selectedAmount > 0) return this.data.selectedAmount
    if (Number.isFinite(custom) && custom >= 1) return Math.round(custom * 100) / 100
    return 0
  },

  async pay() {
    if (this.data.paying) return
    const amount = this.currentAmount()
    if (!amount || amount < 1) {
      wx.showToast({ title: '请选择或输入至少 1 元的金额', icon: 'none' })
      return
    }
    if (!this.data.payEnabled) {
      wx.showModal({
        title: '支付暂未开通',
        content: '微信支付正在接入中，如需捐助可先通过"意见反馈"联系管理员。',
        showCancel: false
      })
      return
    }
    if (!authSession.readSession()) {
      wx.showToast({ title: '请先在"我的"页面登录', icon: 'none' })
      return
    }
    this.setData({ paying: true })
    try {
      const order = await publicApi.createDonateOrder({ amount })
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: order.timeStamp,
          nonceStr: order.nonceStr,
          package: order.package,
          signType: order.signType || 'RSA',
          paySign: order.paySign,
          success: resolve,
          fail: reject
        })
      })
      wx.showToast({ title: '感谢你的支持！', icon: 'success' })
      this.setData({ pickerVisible: false })
    } catch (error) {
      const message = error && error.errMsg && error.errMsg.includes('cancel')
        ? '已取消支付'
        : (error.message || '支付未完成，请稍后重试')
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ paying: false })
    }
  }
})
