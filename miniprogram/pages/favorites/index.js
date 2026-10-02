const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')
const authSession = require('../../utils/auth-session')

function displayDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

Page({
  data: { loading: true, error: '', favorites: [], loggedIn: false },

  onLoad() { reportVisit('/mp/favorites') },
  onShow() { theme.onPageShow(); this.load() },
  onUnload() { this._requestId = (this._requestId || 0) + 1 },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },

  async load() {
    const requestId = this._requestId = (this._requestId || 0) + 1
    const session = authSession.readSession()
    if (!session) {
      this.setData({ loading: false, error: '', favorites: [], loggedIn: false })
      return
    }
    this.setData({ loading: true, error: '', favorites: [], loggedIn: true })
    try {
      const result = await publicApi.getFavorites({ page: 1, page_size: 100 })
      if (requestId !== this._requestId) return
      if (authSession.getToken() !== session.token) return this.load()
      this.setData({
        loading: false,
        favorites: result.items.map(item => ({ ...item, favorited_date: displayDate(item.favorited_at) }))
      })
    } catch (error) {
      if (requestId !== this._requestId) return
      if (authSession.getToken() !== session.token) return this.load()
      this.setData({ loading: false, error: error.message || '收藏加载失败' })
    }
  },

  retry() { this.load() },
  goLogin() { wx.switchTab({ url: '/pages/profile/index' }) },
  browseCourses() { wx.switchTab({ url: '/pages/courses/index' }) },

  openFavorite(event) {
    const id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/course-overview/index?id=${encodeURIComponent(id)}` })
  }
})
