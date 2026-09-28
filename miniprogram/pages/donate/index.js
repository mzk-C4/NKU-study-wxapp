const theme = require('../../utils/theme')
const WEBSITE_URL = 'https://nkustudy.top/'

// 保留原路由兼容已有入口；页面仅提供网站链接，不加载支付或资金数据。
Page({
  data: { websiteUrl: WEBSITE_URL, copying: false, copied: false, copyError: '' },
  onShow() { theme.onPageShow() },
  copyWebsite() {
    if (this.data.copying) return
    this.setData({ copying: true, copied: false, copyError: '' })
    wx.setClipboardData({
      data: WEBSITE_URL,
      success: () => this.setData({ copied: true }),
      fail: () => this.setData({ copyError: '复制失败，请重试，或长按链接手动复制。' }),
      complete: () => this.setData({ copying: false })
    })
  }
})
