const { reportVisit } = require('../../utils/visit-report')
const navigation = require('../../utils/navigation')
const { publicApi } = require('../../services/public-api')
const authSession = require('../../utils/auth-session')

const FEEDBACK_URLS = Object.freeze({
  website: 'https://nkustudy.top/feedback',
  github: 'https://github.com/mzk-C4/NKU-study-wxapp/issues/new/choose'
})

const STATUS_LABELS = {
  approved: '已公开',
  pending: '审核中',
  rejected: '未通过',
  hidden: '已隐藏',
  needs_changes: '待修改'
}

function displayDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function presentFavorite(item) {
  return { ...item, favorited_date: displayDate(item.favorited_at) }
}

function presentReview(item) {
  const status = item.hidden ? 'hidden' : item.status
  return {
    ...item,
    status,
    status_label: STATUS_LABELS[status] || '状态未知',
    status_class: `status--${status}`,
    created_date: displayDate(item.created_at)
  }
}

function getWechatLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 10000,
      success(result) {
        if (result.code) resolve(result.code)
        else reject(new Error('微信未返回登录凭证，请重试。'))
      },
      fail() { reject(new Error('无法获取微信登录凭证，请检查网络后重试。')) }
    })
  })
}

function createProfilePage(api = publicApi, sessionStore = authSession) {
  return {
    data: {
      user: null,
      userInitial: 'N',
      isLoggedIn: false,
      history: [],
      favorites: [],
      reviews: [],
      favoriteTotal: 0,
      reviewTotal: 0,
      loading: false,
      contentLoading: false,
      contentError: '',
      favoriteLabel: '登录后查看',
      submissionLabel: '网站投稿',
      reviewLabel: '登录后查看',
      favoritesVisible: false,
      reviewsVisible: false,
      editingProfile: false,
      nicknameDraft: '',
      profileSaving: false,
      aboutVisible: false,
      feedbackVisible: false,
      feedbackUrls: FEEDBACK_URLS
    },

    onLoad() { reportVisit('/mp/profile') },
    onShow() { this.refresh() },

    resetLoggedOut(history) {
      this.setData({
        user: null,
        userInitial: 'N',
        isLoggedIn: false,
        history,
        favorites: [],
        reviews: [],
        favoriteTotal: 0,
        reviewTotal: 0,
        contentLoading: false,
        contentError: '',
        favoriteLabel: '登录后查看',
        reviewLabel: '登录后查看',
        favoritesVisible: false,
        reviewsVisible: false
      })
    },

    async refresh() {
      const history = wx.getStorageSync('browse_history') || []
      const stored = sessionStore.readSession()
      if (!stored) {
        this.resetLoggedOut(history)
        return
      }
      const storedUser = stored.user || {}
      this.setData({
        user: storedUser,
        userInitial: (storedUser.nickname || 'N').slice(0, 1),
        isLoggedIn: true,
        history,
        contentLoading: true,
        contentError: ''
      })
      try {
        const [user, favoriteResult, reviewResult] = await Promise.all([
          api.getMe(),
          api.getFavorites({ page: 1, page_size: 100 }),
          api.getMyReviews({ page: 1, page_size: 100 })
        ])
        sessionStore.updateUser(user)
        this.setData({
          user,
          userInitial: (user.nickname || 'N').slice(0, 1),
          favorites: favoriteResult.items.map(presentFavorite),
          reviews: reviewResult.items.map(presentReview),
          favoriteTotal: favoriteResult.total,
          reviewTotal: reviewResult.total,
          favoriteLabel: `${favoriteResult.total} 门`,
          reviewLabel: `${reviewResult.total} 条`,
          contentLoading: false
        })
      } catch (error) {
        if (error.statusCode === 401 || error.code === 'AUTH_REQUIRED') {
          sessionStore.clearSession()
          this.resetLoggedOut(history)
          return
        }
        this.setData({ contentLoading: false, contentError: error.message || '个人数据暂时无法加载。' })
      }
    },

    async login() {
      if (this.data.loading) return
      this.setData({ loading: true })
      try {
        const code = await getWechatLoginCode()
        const result = await api.loginWechat(code)
        sessionStore.saveSession(result)
        wx.showToast({ title: '登录成功', icon: 'success' })
        await this.refresh()
      } catch (error) {
        wx.showToast({ title: error.message || '登录失败，请稍后重试。', icon: 'none' })
      } finally {
        this.setData({ loading: false })
      }
    },

    logout() {
      wx.showModal({
        title: '退出登录',
        content: '退出后本机浏览记录仍会保留。',
        success: result => { if (result.confirm) this.confirmLogout() }
      })
    },

    async confirmLogout() {
      if (this.data.loading) return
      this.setData({ loading: true })
      let remoteRevoked = true
      try { await api.logout() } catch (_) { remoteRevoked = false }
      sessionStore.clearSession()
      this.resetLoggedOut(wx.getStorageSync('browse_history') || [])
      this.setData({ loading: false })
      wx.showToast({ title: remoteRevoked ? '已退出登录' : '已清除本机登录状态', icon: 'none' })
    },

    ensureLoggedIn() {
      if (this.data.isLoggedIn) return true
      wx.showToast({ title: '请先使用微信账号登录', icon: 'none' })
      return false
    },

    toggleFavorites() {
      if (!this.ensureLoggedIn()) return
      this.setData({ favoritesVisible: !this.data.favoritesVisible })
    },

    toggleReviews() {
      if (!this.ensureLoggedIn()) return
      this.setData({ reviewsVisible: !this.data.reviewsVisible })
    },

    startEditProfile() {
      this.setData({ editingProfile: true, nicknameDraft: this.data.user?.nickname || '' })
    },
    closeEditProfile() { if (!this.data.profileSaving) this.setData({ editingProfile: false }) },
    inputNickname(event) { this.setData({ nicknameDraft: event.detail.value }) },
    async saveProfile() {
      const nickname = this.data.nicknameDraft.trim().slice(0, 32)
      if (!nickname) {
        wx.showToast({ title: '请输入昵称', icon: 'none' })
        return
      }
      this.setData({ profileSaving: true })
      try {
        const user = await api.updateProfile({ nickname })
        sessionStore.updateUser(user)
        this.setData({ user, userInitial: nickname.slice(0, 1), editingProfile: false })
        wx.showToast({ title: '昵称已更新', icon: 'success' })
      } catch (error) {
        wx.showToast({ title: error.message || '昵称更新失败。', icon: 'none' })
      } finally {
        this.setData({ profileSaving: false })
      }
    },

    openHistory(event) { navigation.openCourse(event.currentTarget.dataset.id) },
    openFavorite(event) { navigation.openCourse(event.currentTarget.dataset.id) },
    openSubmit() { wx.navigateTo({ url: '/pages/participate-web/index' }) },
    feedback() { this.setData({ feedbackVisible: true }) },
    closeFeedback() { this.setData({ feedbackVisible: false }) },
    openFeedbackWebsite() {
      this.setData({ feedbackVisible: false })
      wx.navigateTo({ url: '/pages/feedback-web/index' })
    },
    copyFeedbackLink(event) {
      const url = FEEDBACK_URLS[event.currentTarget.dataset.kind]
      if (!url) return
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '链接已复制', icon: 'success' }),
        fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
      })
    },
    about() { this.setData({ aboutVisible: true }) },
    closeAbout() { this.setData({ aboutVisible: false }) },
    noop() {}
  }
}

Page(createProfilePage())

module.exports = { createProfilePage, displayDate, presentFavorite, presentReview, getWechatLoginCode, FEEDBACK_URLS }
