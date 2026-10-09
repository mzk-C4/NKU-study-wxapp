const { publicApi } = require('./services/public-api')
const { homeAnnouncementView, announcementText, createAnnouncementReader } = require('./features/home-announcement')

function createApp(api = publicApi) {
  return {
    onHide() {
      this.noticeForeground = false
      this.noticeEpoch = (this.noticeEpoch || 0) + 1
      if (this.noticeRouteTimer) clearTimeout(this.noticeRouteTimer)
      this.noticeRouteTimer = null
    },
    async onShow(options = {}) {
      this.noticeForeground = true
      const epoch = this.noticeEpoch = (this.noticeEpoch || 0) + 1
      if (this.noticeRouteTimer) clearTimeout(this.noticeRouteTimer)
      this.noticeRouteTimer = null
      // Home owns its richer, linked dialog. A warm resume on another page
      // still gets a notice, without forcibly losing that page or its draft.
      const current = () => {
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
        return pages.length ? pages[pages.length - 1].route : ''
      }
      const entry = current() || String(options.path || '').replace(/^\//, '')
      if (!entry || entry === 'pages/home/index' || this.noticeModal) return
      try {
        const home = await api.getHome()
        if (!this.noticeForeground || this.noticeEpoch !== epoch) return
        this.noticeReader = this.noticeReader || createAnnouncementReader(wx)
        const notice = homeAnnouncementView(home.announcement)
        this.presentNoticeWhenReady(notice, epoch, 0)
      } catch (_) {
        if (!this.noticeForeground || this.noticeEpoch !== epoch) return
        this.noticeReader = this.noticeReader || createAnnouncementReader(wx)
        this.presentNoticeWhenReady(homeAnnouncementView(null), epoch, 0)
      }
    },
    presentNoticeWhenReady(notice, epoch, attempts) {
      if (!this.noticeForeground || this.noticeEpoch !== epoch || this.noticeModal) return
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      if (!pages.length) {
        // Cold entry through a shared detail-page link can precede page mount.
        // Bound the retry, cancel on hide, and never poll the network here.
        if (attempts < 20) this.noticeRouteTimer = setTimeout(() => {
          this.noticeRouteTimer = null
          this.presentNoticeWhenReady(notice, epoch, attempts + 1)
        }, 100)
        return
      }
      if (pages[pages.length - 1].route === 'pages/home/index' || !this.noticeReader.isUnread(notice)) return
      this.noticeModal = true
      try {
        wx.showModal({
          title: 'NKUStudy 新公告', content: announcementText(notice).slice(0, 1200),
          confirmText: '查看全文', cancelText: '知道了',
          success: result => {
            if (result.confirm) wx.switchTab({ url: '/pages/home/index' })
            else if (result.cancel) this.noticeReader.dismiss(notice)
          },
          complete: () => { this.noticeModal = false }
        })
      } catch (_) { this.noticeModal = false }
    }
  }
}

App(createApp())
module.exports = { createApp }
