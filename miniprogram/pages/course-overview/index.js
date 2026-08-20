const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const { parseMarkdown } = require('../../utils/markdown')
const authSession = require('../../utils/auth-session')

Page({
  data: { id: '', loading: true, error: '', course: null, favorite: false, favoriteLoading: false, favoriteSaving: false, descriptionBlocks: [] },
  onLoad(options) { reportVisit('/mp/course-overview'); this.setData({ id: options.id || '' }); this.loadCourse() },
  onShow() { if (this.data.course) this.loadFavoriteState() },

  async loadCourse() {
    if (!this.data.id) return this.setData({ loading: false, error: '缺少课程编号' })
    this.setData({ loading: true, error: '' })
    try {
      const course = await publicApi.getCourse(this.data.id)
      const history = wx.getStorageSync('browse_history') || []
      const next = [course, ...history.filter(item => item.id !== course.id)].slice(0, 20)
      wx.setStorageSync('browse_history', next)
      this.setData({ course, descriptionBlocks: parseMarkdown(course.description), loading: false })
      wx.setNavigationBarTitle({ title: course.name })
      this.loadFavoriteState()
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },

  async loadFavoriteState() {
    if (!this.data.course || !authSession.readSession()) {
      this.setData({ favorite: false, favoriteLoading: false })
      return
    }
    this.setData({ favoriteLoading: true })
    try {
      const result = await publicApi.getFavorites({ page: 1, page_size: 100 })
      this.setData({ favorite: result.items.some(item => item.course_id === this.data.course.id) })
    } catch (error) {
      if (error.statusCode === 401 || error.code === 'AUTH_REQUIRED') {
        authSession.clearSession()
        this.setData({ favorite: false })
      }
    } finally {
      this.setData({ favoriteLoading: false })
    }
  },

  copyLink(event) {
    const href = event.currentTarget.dataset.href
    if (!href) return
    wx.setClipboardData({
      data: href,
      success() { wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' }) }
    })
  },

  openTab(event) {
    const tab = event.currentTarget.dataset.tab
    if (tab === 'resources') wx.redirectTo({ url: `/pages/course-resources/index?id=${this.data.id}` })
    if (tab === 'reviews') wx.redirectTo({ url: `/pages/course-reviews/index?id=${this.data.id}` })
  },

  async toggleFavorite() {
    if (this.data.favoriteSaving || !this.data.course) return
    if (!authSession.readSession()) {
      wx.showModal({
        title: '登录后收藏',
        content: '使用微信账号登录后，可在不同设备同步收藏课程。',
        confirmText: '去登录',
        success(result) { if (result.confirm) wx.switchTab({ url: '/pages/profile/index' }) }
      })
      return
    }
    const nextFavorite = !this.data.favorite
    this.setData({ favoriteSaving: true })
    try {
      if (nextFavorite) await publicApi.addFavorite(this.data.course.id)
      else await publicApi.removeFavorite(this.data.course.id)
      this.setData({ favorite: nextFavorite })
      wx.showToast({ title: nextFavorite ? '已收藏' : '已取消收藏', icon: 'success' })
    } catch (error) {
      if (error.statusCode === 401 || error.code === 'AUTH_REQUIRED') {
        authSession.clearSession()
        this.setData({ favorite: false })
        wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
      } else {
        wx.showToast({ title: error.message || '收藏操作失败。', icon: 'none' })
      }
    } finally {
      this.setData({ favoriteSaving: false })
    }
  }
})