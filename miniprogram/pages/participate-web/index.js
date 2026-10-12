const { registerPage: registerThemedPage } = require('../../utils/theme')
const { reportVisit } = require('../../utils/visit-report')
const PARTICIPATE_URL = 'https://nkustudy.top/participate/'

registerThemedPage({
  data: { url: PARTICIPATE_URL, failed: false, copyError: '' },
  onLoad() { reportVisit('/mp/participate-web') },
  failed() { this.setData({ failed: true }) },
  retry() { this.setData({ failed: false, copyError: '' }) },
  copyLink() {
    this.setData({ copyError: '' })
    wx.setClipboardData({ data: PARTICIPATE_URL,
      fail: () => this.setData({ copyError: '复制失败，请长按下方网址手动复制。' }) })
  }
})
