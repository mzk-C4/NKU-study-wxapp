const { registerPage: registerThemedPage } = require('../../utils/theme')
const QR_IMAGE = '/assets/home/beta-group.jpg'
registerThemedPage({
  data: { image: QR_IMAGE, error: '' },
  preview() {
    wx.previewImage({ current: QR_IMAGE, urls: [QR_IMAGE], showmenu: true,
      fail: () => this.setData({ error: '暂时无法打开大图，请重试。' }) })
  }
})
