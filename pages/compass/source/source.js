/**
 * 来源原文页（HXR-COMPASS）
 * 通过 web-view 打开来源原文；若域名未配置业务域名导致打开失败，
 * 自动回退到「复制安全链接」方案，并给出失败提示。
 */
Page({
  data: {
    url: '',
    title: '来源原文',
    failed: false
  },

  onLoad(options) {
    const url = options.url ? decodeURIComponent(options.url) : ''
    const title = options.title ? decodeURIComponent(options.title) : '来源原文'
    wx.setNavigationBarTitle({ title })
    this.setData({ url, title })
  },

  // web-view 打开失败（如未配置业务域名）
  onWebError() {
    this.setData({ failed: true })
  },

  // 复制安全链接
  onCopy() {
    if (!this.data.url) return
    wx.setClipboardData({
      data: this.data.url,
      success: () => wx.showToast({ title: '安全链接已复制', icon: 'success' })
    })
  }
})
