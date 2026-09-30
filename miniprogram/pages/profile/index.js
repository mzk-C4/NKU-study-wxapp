const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi, validateAvatarUrl } = require('../../services/public-api')
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
  let refreshId = 0
  let avatarAttempt = 0
  let draftSession = null
  let uploadedDraft = null
  let unloaded = false
  const sameSession = expected => {
    const current = sessionStore.readSession()
    return Boolean(current && expected && current.token === expected.token && current.user?.id === expected.user?.id)
  }
  const canUploadAvatar = () => typeof api.isAvatarUploadAvailable === 'function' && api.isAvatarUploadAvailable() === true
  return {
    data: {
      user: null,
      userInitial: 'N',
      avatarFailed: false,
      avatarSupported: false,
      avatarSaveAvailable: canUploadAvatar(),
      avatarDraftUrl: '',
      avatarPreviewUrl: '',
      avatarSaving: false,
      avatarErrorText: '',
      isLoggedIn: false,
      history: [],
      phoneVerified: false,
      favorites: [],
      reviews: [],
      favoriteTotal: 0,
      reviewTotal: 0,
      loading: false,
      contentLoading: false,
      contentError: '',
      favoriteLabel: '登录后查看',
      submissionLabel: '前往网站投稿',
      reviewLabel: '登录后查看',
      editingProfile: false,
      nicknameDraft: '',
      profileSaving: false,
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
    onShow() {
      this.setData({ avatarSupported: typeof wx.canIUse === 'function' && wx.canIUse('button.open-type.chooseAvatar') })
      this.refreshLearningProfile(); this.refresh(); theme.onPageShow()
    },
    onUnload() { unloaded = true; refreshId++; avatarAttempt++; draftSession = null; uploadedDraft = null },

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
      refreshId++
      this.discardAvatar()
      this.setData({
          user: null,
          userInitial: 'N',
          avatarFailed: false,
        isLoggedIn: false,
        history, phoneVerified: false,
        favorites: [],
        reviews: [],
        favoriteTotal: 0,
        reviewTotal: 0,
        contentLoading: false,
        contentError: '',
        favoriteLabel: '登录后查看',
        reviewLabel: '登录后查看',
        favoritesVisible: false,
        reviewsVisible: false,
      })
    },

    async refresh() {
      const history = wx.getStorageSync('browse_history') || []
      const stored = sessionStore.readSession()
      if (!stored) {
        this.resetLoggedOut(history)
        return
      }
      if (draftSession && !sameSession(draftSession)) this.discardAvatar()
      if (this.data.avatarSaving || this.data.profileSaving) return
      const generation = ++refreshId
      const storedUser = stored.user || {}
      this.setData({
        user: storedUser,
        avatarFailed: false,
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
        if (unloaded || generation !== refreshId || !sameSession(stored)) return
        sessionStore.updateUser(user)
        this.setData({
          user,
          userInitial: (user.nickname || 'N').slice(0, 1),
          favorites: favoriteResult.items.map(presentFavorite),
          reviews: reviewResult.items.map(presentReview),
          favoriteTotal: favoriteResult.total,
          reviewTotal: reviewResult.total,
          phoneVerified: user.phone_verified === true,
          favoriteLabel: `${favoriteResult.total} 门`,
          reviewLabel: `${reviewResult.total} 条`,
          contentLoading: false
        })
      } catch (error) {
        if (unloaded || generation !== refreshId) return
        const current = sessionStore.readSession()
        if (current && !sameSession(stored)) return
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
      refreshId++
      this.discardAvatar()
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

    openFavorites() {
      if (!this.ensureLoggedIn()) return
      wx.navigateTo({ url: '/pages/favorites/index' })
    },

    openHistoryPage() {
      wx.navigateTo({ url: '/pages/history/index' })
    },

    openMyReviews() {
      if (!this.ensureLoggedIn()) return
      wx.navigateTo({ url: '/pages/my-reviews/index' })
    },

    startEditProfile() {
      if (this.data.avatarSaving) return
      this.setData({ editingProfile: true, nicknameDraft: this.data.user?.nickname || '' })
    },
    avatarUnavailable() {
      if (!this.ensureLoggedIn()) return
      wx.showToast({ title: '当前微信版本不支持选择头像，请更新微信。', icon: 'none' })
    },
    avatarError() {
      if (this.data.avatarPreviewUrl) {
        if (this.data.avatarSaving) { this.setData({ avatarPreviewUrl: '' }); return }
        this.discardAvatar()
        this.setData({ avatarErrorText: '头像预览无法读取，请重新选择。' })
      } else this.setData({ avatarFailed: true })
    },
    discardAvatar() {
      avatarAttempt++
      draftSession = null
      uploadedDraft = null
      this.setData({ avatarDraftUrl: '', avatarPreviewUrl: '', avatarSaving: false, avatarErrorText: '' })
    },
    async chooseAvatar(event) {
      const filePath = event?.detail?.avatarUrl
      // Cancellation and the platform's rejected image have no usable selection.
      if (typeof filePath !== 'string' || !filePath.trim()) return
      if (this.data.avatarSaving || this.data.profileSaving || this.data.loading || this.data.editingProfile) return
      const session = sessionStore.readSession()
      if (!session) {
        this.resetLoggedOut(wx.getStorageSync('browse_history') || [])
        wx.showToast({ title: '请先登录后再选择头像。', icon: 'none' })
        return
      }
      if (!this.ensureLoggedIn()) return
      if (session.user?.id !== this.data.user?.id) { await this.refresh(); return }
      draftSession = session
      uploadedDraft = null
      this.setData({ avatarDraftUrl: filePath, avatarPreviewUrl: filePath, avatarFailed: false, avatarErrorText: '' })
      if (canUploadAvatar()) await this.saveAvatar()
    },
    async saveAvatar() {
      if (!this.data.avatarDraftUrl || this.data.avatarSaving || this.data.profileSaving || this.data.loading) return
      if (!sameSession(draftSession)) {
        this.discardAvatar()
        wx.showToast({ title: '登录状态已变化，请重新选择头像。', icon: 'none' })
        return
      }
      if (!canUploadAvatar()) {
        this.setData({ avatarErrorText: '头像保存功能暂未开放，目前仅可预览。' })
        return
      }
      const session = draftSession
      const previousUser = this.data.user
      const attempt = ++avatarAttempt
      const isCurrent = () => {
        if (unloaded || attempt !== avatarAttempt) return false
        if (!sessionStore.readSession()) {
          this.resetLoggedOut(wx.getStorageSync('browse_history') || [])
          wx.showToast({ title: '登录已失效，请重新登录后选择头像。', icon: 'none' })
          return false
        }
        return sameSession(session)
      }
      refreshId++ // An older GET /me must not overwrite this change.
      this.setData({ avatarSaving: true, avatarPreviewUrl: this.data.avatarDraftUrl, avatarErrorText: '', contentLoading: false })
      let savingProfile = false
      try {
        // A failed profile save can reuse the reviewed upload without consuming another daily slot.
        // Unbound resources expire after 24 hours; keep this cache in memory only.
        if (!uploadedDraft || Date.now() - uploadedDraft.startedAt >= 24 * 60 * 60 * 1000) {
          const startedAt = Date.now()
          const uploaded = await api.uploadAvatar(this.data.avatarDraftUrl)
          if (!isCurrent()) return
          const url = validateAvatarUrl(uploaded?.avatar_url)
          if (!url) throw Object.assign(new Error(), { code: 'INVALID_AVATAR_URL' })
          uploadedDraft = { url, startedAt }
        }
        const avatarUrl = uploadedDraft.url
        savingProfile = true
        const user = await api.updateProfile({ avatar_url: avatarUrl })
        if (!isCurrent()) return
        if (user?.id !== session.user.id || user.avatar_url !== avatarUrl || user.nickname !== previousUser.nickname) {
          throw Object.assign(new Error(), { code: 'INVALID_PROFILE_RESPONSE' })
        }
        const cached = sessionStore.updateUser(user)
        this.discardAvatar()
        this.setData({ user, userInitial: (user.nickname || 'N').slice(0, 1), avatarFailed: false })
        if (cached?.user?.avatar_url !== avatarUrl) {
          this.setData({ avatarErrorText: '头像已保存，但本机暂未记住更新；重新进入后会刷新。' })
        }
        wx.showToast({ title: '头像已保存', icon: 'success' })
      } catch (error) {
        if (unloaded || attempt !== avatarAttempt) return
        const current = sessionStore.readSession()
        if (current && !sameSession(session)) return
        if (!current || error.statusCode === 401 || error.code === 'AUTH_REQUIRED') {
          sessionStore.clearSession()
          this.resetLoggedOut(wx.getStorageSync('browse_history') || [])
          wx.showToast({ title: '登录已失效，请重新登录后选择头像。', icon: 'none' })
          return
        }
        const messages = {
          AVATAR_UPLOAD_UNAVAILABLE: '头像上传暂时不可用，请稍后重试。',
          AVATAR_TOO_LARGE: '请选择不超过 2 MiB、4096×4096 像素的头像。',
          AVATAR_INVALID_IMAGE: '请重新选择有效的 JPEG 或 PNG 头像。',
          AVATAR_CONTENT_REJECTED: '图片未通过安全检查，请重新选择。',
          AVATAR_NOT_OWNED: '头像已失效或无法使用，请重新选择。',
          UPLOAD_DOMAIN_NOT_ALLOWED: '头像上传暂不可用，请联系小程序维护者。'
        }
        if (error.code === 'AVATAR_NOT_OWNED') uploadedDraft = null
        const message = messages[error.code] || (error.statusCode === 429
          ? '头像上传次数已达上限，请稍后再试。'
          : savingProfile ? '未确认头像保存结果，已恢复原显示；可重新进入核对后重试。' : '头像上传失败，原头像未更改，请重试。')
        this.setData({ avatarPreviewUrl: '', avatarFailed: false, avatarErrorText: message })
      } finally {
        if (!unloaded && attempt === avatarAttempt) {
          if (!sameSession(session)) this.discardAvatar()
          else this.setData({ avatarSaving: false })
        }
      }
    },
    closeEditProfile() { if (!this.data.profileSaving) this.setData({ editingProfile: false }) },
    inputNickname(event) { this.setData({ nicknameDraft: event.detail.value }) },
    async saveProfile() {
      if (this.data.profileSaving || this.data.avatarSaving) return
      const nickname = this.data.nicknameDraft.trim().slice(0, 32)
      if (!nickname) {
        wx.showToast({ title: '请输入昵称', icon: 'none' })
        return
      }
      this.setData({ profileSaving: true })
      refreshId++
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

    openSubmit() { wx.navigateTo({ url: '/pages/participate-web/index' }) },
    async onGetPhoneNumber(event) {
      const code = event.detail && event.detail.code
      if (!code) {
        wx.showToast({ title: '未获取到授权，请重试', icon: 'none' })
        return
      }
      try {
        const result = await api.verifyPhone(code)
        this.setData({ phoneVerified: true })
        wx.showToast({ title: `已验证 ${result.phone_masked || ''}`, icon: 'none' })
      } catch (error) {
        wx.showToast({ title: error.message || '验证失败，请重试', icon: 'none' })
      }
    },

    openFeedback() { wx.navigateTo({ url: '/pages/feedback/index' }) },
    openWebsite() { wx.navigateTo({ url: '/pages/donate/index' }) },
    openAbout() { wx.navigateTo({ url: '/pages/about/index' }) },
    noop() {},
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
          refreshId++
          that.discardAvatar()
          try {
            await api.deleteMyAccount()
            sessionStore.clearSession()
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
