const api = require('../../utils/request')
const auth = require('../../utils/auth')
const navigation = require('../../utils/navigation')

function labels(user, favorites, submissions, reviews) {
  return {
    contributionCount: submissions.length + reviews.length,
    favoriteLabel: user ? `${favorites.length} 门课程` : '登录后查看',
    submissionLabel: user ? `${submissions.length} 条` : '登录后查看',
    reviewLabel: user ? `${reviews.length} 条` : '登录后查看'
  }
}

Page({
  data: {
    user: null, history: [], favorites: [], submissions: [], reviews: [], loading: false,
    contributionCount: 0, favoriteLabel: '登录后查看', submissionLabel: '登录后查看', reviewLabel: '登录后查看'
  },
  onShow() { this.refresh() },
  refresh() {
    const user = auth.getStoredUser()
    const history = wx.getStorageSync('browse_history') || []
    this.setData({ user, history, ...labels(user, [], [], []) })
    if (user) this.loadMine()
  },
  async login() {
    this.setData({ loading: true })
    try {
      const session = await getApp().ensureLogin()
      this.setData({ user: session.user })
      await this.loadMine()
      wx.showToast({ title: '登录成功' })
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
  async loadMine() {
    try {
      const [favorites, submissions, reviews] = await Promise.all([api.get('/me/favorites'), api.get('/me/submissions'), api.get('/me/reviews')])
      const values = { favorites: favorites.items, submissions: submissions.items, reviews: reviews.items }
      this.setData({ ...values, ...labels(this.data.user, values.favorites, values.submissions, values.reviews) })
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    }
  },
  openHistory(event) { navigation.openCourse(event.currentTarget.dataset.id) },
  openSubmit() {
    if (!this.data.user) return this.login()
    wx.navigateTo({ url: '/pages/submit-resource/index' })
  },
  feedback() { wx.showModal({ title: '意见反馈', content: '请通过项目 GitHub Issues 或 NKUStudy.top 的反馈入口提交。', showCancel: false }) },
  about() { wx.showModal({ title: '关于 NKUStudy', content: '南开学生共建的非官方课程资料与选课参考平台。浏览无需实名。', showCancel: false }) },
  logout() {
    auth.logout()
    getApp().globalData.user = null
    this.setData({ user: null, favorites: [], submissions: [], reviews: [], ...labels(null, [], [], []) })
  }
})
