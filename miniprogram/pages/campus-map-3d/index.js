const { registerPage: registerThemedPage } = require('../../utils/theme')
const config = require('../../features/campus-map-3d/config')
const links = require('../../features/campus-map-3d/links')

registerThemedPage({
  data: { available: config.isEnabled(), webVisible: false, failed: false, url: '', fromSelection: false },
  onLoad(options = {}) {
    this._isUnloaded = false
    this._entryId = links.buildingId(options.buildingId)
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    this.setData({ fromSelection: pages.length > 1 && pages[pages.length - 2].route === 'pages/campus-map-select/index' })
    if (config.isEnabled()) this.openWeb()
  },
  onUnload() { this._isUnloaded = true },
  openWeb() {
    if (!config.isEnabled() || this._isUnloaded || this._opening) return
    this._opening = true
    const attempt = this._loadGeneration = (this._loadGeneration || 0) + 1
    this.setData({ attempt, webVisible: false, failed: false }, () => {
      if (this._isUnloaded) return
      // Seed the native map under a standalone shared page, so the system
      // back button also returns to Jinnan without relying on a web overlay.
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      if (pages.length === 1) {
        wx.redirectTo({ url: links.nativePath(this._entryId, true), fail: () => this.webFailed() })
        return
      }
      wx.nextTick(() => {
        if (this._isUnloaded || attempt !== this._loadGeneration) return
        this._opening = false
        this.setData({ url: links.webUrl(this._entryId), webVisible: true })
      })
    })
  },
  webFailed(event) {
    if (this._isUnloaded) return
    const attempt = event && event.currentTarget && event.currentTarget.dataset.attempt
    if (attempt !== undefined && Number(attempt) !== this.data.attempt) return
    this._loadGeneration = (this._loadGeneration || 0) + 1
    this._opening = false
    this.setData({ webVisible: false, failed: true })
  },
  retry() { this.openWeb() },
  returnToMap() {
    if (this._isUnloaded || this._returning) return
    this._returning = true
    const fallback = () => {
      if (this._isUnloaded) return
      wx.redirectTo({ url: links.nativePath(), fail: () => {
        this._returning = false
        if (!this._isUnloaded) wx.showToast({ title: '返回失败，请重试', icon: 'none' })
      } })
    }
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1 && ['pages/campus-map/index', 'pages/campus-map-select/index'].includes(pages[pages.length - 2].route)) {
      wx.navigateBack({ delta: 1, fail: fallback })
    } else fallback()
  },
  onShareAppMessage(options = {}) {
    const id = links.sharedBuildingId(options.webViewUrl, this._entryId)
    return { title: '津南 2D / 3D 校园地图', path: links.pagePath(id) }
  }
})
