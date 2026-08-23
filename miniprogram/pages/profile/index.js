const { reportVisit } = require('../../utils/visit-report')
const navigation = require('../../utils/navigation')
const auth = require('../../services/auth')

Page({
  onLoad() {
    reportVisit('/mp/profile');
    const mode = wx.getStorageSync('nkustudy_dark_mode') === 'on';
    this.setData({ darkMode: mode });
  },
  data: {
    user: null,
    history: [],
    loading: false,
    favorites: [],
    reviews: [],
    listTab: 'favorites',
    aboutVisible: false, darkMode: wx.getStorageSync('nkustudy_dark_mode') === 'on'
  },
  onShow() { this.refresh() },
  refresh() {
    this.setData({ history: wx.getStorageSync('browse_history') || [] })
    if (!auth.getToken()) { this.setData({ user: null, favorites: [], reviews: [] }); return }
    this.loadUserData()
  },
  async loadUserData() {
    this.setData({ loading: true })
    try {
      const [user, favorites, reviews] = await Promise.all([
        auth.getProfile().catch(() => auth.getCachedUser()),
        auth.authedGet('/me/favorites', { page: 1, page_size: 50 }).catch(() => ({ items: [] })),
        auth.authedGet('/me/reviews', { page: 1, page_size: 50 }).catch(() => ({ items: [] }))
      ])
      this.setData({ user, favorites: favorites.items || [], reviews: reviews.items || [], loading: false })
    } catch (error) {
      this.setData({ loading: false })
      if (error.code === 'AUTH_REQUIRED') this.setData({ user: null })
    }
  },
  async login() {
    this.setData({ loading: true })
    try {
      const user = await auth.login()
      this.setData({ user, loading: false })
      this.loadUserData()
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '登录失败', icon: 'none' })
    }
  },
  async logout() {
    await auth.logout()
    this.setData({ user: null, favorites: [], reviews: [] })
  },
  switchList(event) { this.setData({ listTab: event.currentTarget.dataset.tab }) },
  openFavorite(event) { navigation.openCourse(event.currentTarget.dataset.id) },
  reviewStatusText(status) { return { pending: '待审', approved: '已通过', hidden: '已隐藏' }[status] || status || '待审' },
  openHistory(event) { navigation.openCourse(event.currentTarget.dataset.id) },
  openSubmit() { wx.navigateTo({ url: '/pages/submit-resource/index' }) },
  feedback() { wx.showModal({ title: '意见反馈', content: '请通过项目 GitHub Issues 或 NKUStudy.top 的反馈入口提交。', showCancel: false }) },
  about() { this.setData({ aboutVisible: true }) },
  closeAbout() { this.setData({ aboutVisible: false }) },
  openFeedback() { wx.navigateTo({ url: '/pages/feedback/index' }) },
  toggleDarkMode(event) {
    const mode = event.detail.value
    this.setData({ darkMode: mode })
    wx.setStorageSync('nkustudy_dark_mode', mode ? 'on' : 'off')
    wx.setNavigationBarColor({
      frontColor: mode ? '#ffffff' : '#000000',
      backgroundColor: mode ? '#1a1a2e' : '#FFFDF8'
    })
    wx.setPageStyle && wx.setPageStyle({ style: mode ? 'dark' : 'light' })
  },
  noop() {}
})
