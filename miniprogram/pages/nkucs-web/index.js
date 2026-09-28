const { NKUCS_URL } = require('../../features/home-announcement')
Page({
  data: { url: NKUCS_URL, failed: false, copyError: '' },
  failed() { this.setData({ failed: true }) },
  retry() { this.setData({ failed: false }) },
  copyLink() { wx.setClipboardData({ data: NKUCS_URL,
    fail: () => this.setData({ copyError: '复制失败，请长按下方网址手动复制。' }) }) }
})
