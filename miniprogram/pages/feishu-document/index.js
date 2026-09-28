const theme = require('../../utils/theme')
const DOCUMENT_URL = 'https://nankai.feishu.cn/wiki/O36Dw5fQVibzsnkx4ptcZreDnAf'

Page({
  data: { documentUrl: DOCUMENT_URL, copying: false, copied: false, copyError: '' },
  onShow() { theme.onPageShow() },
  copyLink() {
    if (this.data.copying) return
    this.setData({ copying: true, copied: false, copyError: '' })
    // 固定用户提供的原文地址；不接受页面参数覆盖，不获取或镜像私有正文。
    wx.setClipboardData({
      data: DOCUMENT_URL,
      success: () => this.setData({ copied: true }),
      fail: () => this.setData({ copyError: '复制失败，请重试，或长按上方链接手动复制。' }),
      complete: () => this.setData({ copying: false })
    })
  }
})
