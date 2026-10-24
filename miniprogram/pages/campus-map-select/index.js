const { registerPage: registerThemedPage } = require('../../utils/theme')
const config = require('../../features/campus-map-3d/config')
const links = require('../../features/campus-map-3d/links')

registerThemedPage({
  data: { map3dAvailable: false },
  onShow() { this.setData({ map3dAvailable: config.isEnabled() }) },
  onUnload() { this._isUnloaded = true },
  openTencent() { this.openMap('/pages/campus-map/index') },
  openCampus3d() {
    if (!config.isEnabled()) {
      wx.showToast({ title: '校园导览暂未开放', icon: 'none' })
      return
    }
    this.openMap(links.pagePath())
  },
  openMap(url) {
    if (this._opening || this._isUnloaded) return
    this._opening = true
    wx.navigateTo({
      url,
      fail: () => {
        if (!this._isUnloaded) wx.showToast({ title: '打开失败，请重试', icon: 'none' })
      },
      complete: () => { this._opening = false }
    })
  },
  onShareAppMessage() {
    return { title: '校园地图 · 导航与校园导览', path: '/pages/campus-map-select/index' }
  }
})
