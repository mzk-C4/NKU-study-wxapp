const { reportVisit } = require('../../utils/visit-report')
const navigation = require('../../utils/navigation')
const auth = require('../../services/auth')

Page({
  data: {
    user: null, history: [], loading: false,
    favorites: [], reviews: [], myFeedbacks: [],
    listTab: 'favorites',
    aboutVisible: false, darkMode: false
  },
  onLoad() {
    reportVisit('/mp/profile')
    const mode = wx.getStorageSync('nkustudy_dark_mode') === 'on'
    this.setData({ darkMode: mode })
  },
  onShow() { this.refresh() },
  refresh() {
    this.setData({ history: wx.getStorageSync('browse_history') || [] })
    if (!auth.getToken()) { this.setData({ user: null, favorites: [], reviews: [], myFeedbacks: [] }); return }
    this.loadUserData()
  },
  async loadUserData() {
    this.setData({ loading: true })
    try {
      const [user, favorites, reviews, feedback] = await Promise.all([
        auth.getProfile().catch(() => auth.getCachedUser()),
        auth.authedGet('/me/favorites', { page: 1, page_size: 50 }).catch(() => ({ items: [] })),
        auth.authedGet('/me/reviews', { page: 1, page_size: 50 }).catch(() => ({ items: [] })),
        auth.authedGet('/me/feedback', { page: 1, page_size: 50 }).catch(() => ({ items: [] }))
      ])
      this.setData({ user, favorites: favorites.items || [], reviews: reviews.items || [], myFeedbacks: feedback.items || [], loading: false })
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
    this.setData({ user: null, favorites: [], reviews: [], myFeedbacks: [] })
  },
  editNickname() {
    const that = this
    wx.showModal({
      title: '编辑昵称',
      editable: true,
      placeholderText: this.data.user?.nickname || '输入新昵称',
      success: async (res) => {
        if (!res.confirm || !res.content?.trim()) return
        try {
          const updated = await auth.updateProfile({ nickname: res.content.trim() })
          that.setData({ user: updated })
          wx.showToast({ title: '已更新', icon: 'success' })
        } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
      }
    })
  },
  confirmDeleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '将删除你的账号绑定关系（收藏、评价绑定、反馈绑定）。\n已发布的评价和反馈内容不会被删除。\n如需彻底删除内容或因黑名单无法注销，请联系管理员。',
      confirmText: '确认注销',
      confirmColor: '#dc2626',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await auth.authedPost('/me/delete-account')
          await auth.logout()
          wx.showToast({ title: '已注销', icon: 'success' })
          this.setData({ user: null, favorites: [], reviews: [], myFeedbacks: [] })
        } catch (error) {
          wx.showToast({ title: error.message || '注销失败', icon: 'none' })
        }
      }
    })
  },
  setWebPassword() {
    const that = this
    wx.showModal({
      title: this.data.user?.has_web_password ? '修改网页密码' : '设置网页密码',
      editable: true,
      placeholderText: '密码（8位以上）',
      success: async (res) => {
        if (!res.confirm || !res.content || res.content.length < 8) {
          if (res.confirm) wx.showToast({ title: '密码至少 8 位', icon: 'none' })
          return
        }
        try {
          await auth.authedPost('/me/web-password', { password: res.content })
          wx.showToast({ title: '密码已设置', icon: 'success' })
          that.loadUserData()
        } catch (error) { wx.showToast({ title: error.message || '设置失败', icon: 'none' }) }
      }
    })
  },
  switchList(event) { this.setData({ listTab: event.currentTarget.dataset.tab }) },
  openFavorite(event) { navigation.openCourse(event.currentTarget.dataset.id) },
  openFeedback() { wx.navigateTo({ url: '/pages/feedback/index' }) },
  openHistory(event) { navigation.openCourse(event.currentTarget.dataset.id) },
  toggleDarkMode(event) {
    const mode = event.detail.value
    this.setData({ darkMode: mode })
    wx.setStorageSync('nkustudy_dark_mode', mode ? 'on' : 'off')
  },
  about() { this.setData({ aboutVisible: true }) },
  closeAbout() { this.setData({ aboutVisible: false }) },
  noop() {}
})
