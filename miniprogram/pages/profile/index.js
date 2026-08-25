const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const navigation = require('../../utils/navigation')
const { publicApi } = require('../../services/public-api')
const authSession = require('../../utils/auth-session')
const learningProfile = require('../../utils/learning-profile')

function learningProfileView(profile) {
  const value = profile || learningProfile.emptyProfile()
  return {
    learningProfile: value,
    learningProfileLabel: learningProfile.formatLabel(value),
    learningAdmissionYearLabel: value.admission_year ? `${value.admission_year}级` : '未设置',
    learningMajorLabel: value.major || '未设置',
    hasLearningProfile: Boolean(value.admission_year || value.major)
  }
}

const STATUS_LABELS = { approved: '已公开', pending: '审核中', rejected: '未通过', hidden: '已隐藏', needs_changes: '待修改' }

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
  return { ...item, status, status_label: STATUS_LABELS[status] || '状态未知', status_class: `status--${status}`, created_date: displayDate(item.created_at) }
}

function getWechatLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 10000,
      success(result) { if (result.code) { resolve(result.code) } else { reject(new Error('微信未返回登录凭证，请重试。')) } },
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
      passwordModalVisible: false,
      passwordInput1: '',
      passwordInput2: '',
      passwordSaving: false,
      hasWebPassword: false,
      ...learningProfileView(learningProfile.emptyProfile()),
      editingLearningProfile: false,
      admissionYearInput: '',
      majorInput: '',
      admissionYearError: '',
      majorError: '',
      focusAdmissionYear: false,
      focusMajor: false
    },

    onLoad() { reportVisit('/mp/profile') },
    onShow() { this.refreshLearningProfile(); this.refresh(); theme.onPageShow() },

    refreshLearningProfile() {
      this.setData(learningProfileView(learningProfile.read()))
    },

    editLearningProfile() {
      const profile = learningProfile.read()
      this.setData({
        ...learningProfileView(profile),
        editingLearningProfile: true,
        admissionYearInput: profile.admission_year,
        majorInput: profile.major,
        admissionYearError: '',
        majorError: '',
        focusAdmissionYear: false,
        focusMajor: false
      }, () => this.setData({ focusAdmissionYear: true }))
    },

    inputAdmissionYear(event) {
      this.setData({
        admissionYearInput: String(event && event.detail ? event.detail.value : ''),
        admissionYearError: ''
      })
    },

    inputMajor(event) {
      this.setData({
        majorInput: String(event && event.detail ? event.detail.value : ''),
        majorError: ''
      })
    },

    cancelLearningProfileEdit() {
      const profile = learningProfile.read()
      this.setData({
        ...learningProfileView(profile),
        editingLearningProfile: false,
        admissionYearInput: '',
        majorInput: '',
        admissionYearError: '',
        majorError: '',
        focusAdmissionYear: false,
        focusMajor: false
      })
    },

    saveLearningProfile() {
      const result = learningProfile.save({ admission_year: this.data.admissionYearInput, major: this.data.majorInput })
      if (!result.ok) {
        this.setData({
          admissionYearError: result.field === 'admission_year' ? result.error : '',
          majorError: result.field === 'major' ? result.error : '',
          focusAdmissionYear: result.field === 'admission_year',
          focusMajor: result.field === 'major'
        })
        if (result.field) wx.showToast({ title: '请检查学习信息', icon: 'none' })
        else wx.showModal({ title: '无法保存学习信息', content: result.error, showCancel: false, confirmText: '我知道了' })
        return false
      }
      this.setData({
        ...learningProfileView(result.value),
        editingLearningProfile: false,
        admissionYearInput: '',
        majorInput: '',
        admissionYearError: '',
        majorError: '',
        focusAdmissionYear: false,
        focusMajor: false
      })
      wx.showToast({ title: '学习信息已保存', icon: 'success' })
      return true
    },

    confirmClearLearningProfile() {
      wx.showModal({
        title: '清除本机学习信息？',
        content: '只会清除入学年份和专业，不会删除 AI 会话、课程浏览历史或指南内容。',
        cancelText: '取消',
        confirmText: '清除',
        confirmColor: '#B42318',
        success: result => { if (result && result.confirm) this.clearLearningProfile() }
      })
    },

    clearLearningProfile() {
      const result = learningProfile.clear()
      if (!result.ok) {
        wx.showModal({ title: '无法清除学习信息', content: result.error, showCancel: false, confirmText: '我知道了' })
        return false
      }
      this.setData({
        ...learningProfileView(result.value),
        editingLearningProfile: false,
        admissionYearInput: '',
        majorInput: '',
        admissionYearError: '',
        majorError: '',
        focusAdmissionYear: false,
        focusMajor: false
      })
      wx.showToast({ title: '本机学习信息已清除', icon: 'success' })
      return true
    },

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
    about() { this.setData({ aboutVisible: true, passwordModalVisible: false }) },
    closeAbout() { this.setData({ aboutVisible: false }) },
    noop() {},
    openMyFeedback() { wx.navigateTo({ url: '/pages/feedback/index' }) },
    setWebPassword() {
      this.setData({ aboutVisible: false, passwordModalVisible: true, passwordInput1: '', passwordInput2: '' })
    },
    closePasswordModal() {
      this.setData({ passwordModalVisible: false })
    },
    inputPassword1(e) { this.setData({ passwordInput1: e.detail.value }) },
    inputPassword2(e) { this.setData({ passwordInput2: e.detail.value }) },
    async saveWebPassword() {
      const pw1 = this.data.passwordInput1
      const pw2 = this.data.passwordInput2
      if (pw1.length < 8) { wx.showToast({ title: '密码至少 8 位', icon: 'none' }); return }
      if (pw1 !== pw2) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return }
      this.setData({ passwordSaving: true })
      try {
        await api.setWebPassword(pw1)
        wx.showToast({ title: '密码已设置', icon: 'success' })
        this.setData({ passwordModalVisible: false, passwordSaving: false, hasWebPassword: true })
      } catch (error) {
        wx.showToast({ title: error.message || '设置失败', icon: 'none' })
        this.setData({ passwordSaving: false })
      }
    },
    confirmDeleteAccount() {
      const that = this
      wx.showModal({
        title: '注销账号',
        content: '将删除你的账号绑定关系（收藏、评价绑定、反馈绑定）。\n已发布的评价和反馈内容不会被删除。\n如需彻底删除内容或因黑名单无法注销，请联系管理员。',
        confirmText: '确认注销',
        confirmColor: '#dc2626',
        cancelText: '取消',
        success: async (res) => {
          if (!res.confirm) return
          try {
            await api.deleteMyAccount()
            that.resetLoggedOut(wx.getStorageSync('browse_history') || [])
            wx.showToast({ title: '已注销', icon: 'success' })
          } catch (error) { wx.showToast({ title: error.message || '注销失败', icon: 'none' }) }
        }
      })
    }
  }
}

Page(createProfilePage())

module.exports = { createProfilePage, displayDate, presentFavorite, presentReview, getWechatLoginCode }