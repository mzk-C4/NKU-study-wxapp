const navigation = require('../../utils/navigation')

const STORAGE_KEY = 'nkustudy_guide_assistant_local_state'
const MAX_QUESTION_LENGTH = 1000
const LOCAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function boundedQuestion(value) {
  return String(value == null ? '' : value).trim().slice(0, MAX_QUESTION_LENGTH)
}

function decodeQuestion(value) {
  const source = String(value == null ? '' : value)
  try {
    return boundedQuestion(decodeURIComponent(source))
  } catch (_) {
    return boundedQuestion(source)
  }
}

function getStatusBarHeight() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (Number.isFinite(Number(info.statusBarHeight))) return Number(info.statusBarHeight)
    }
    if (typeof wx.getSystemInfoSync === 'function') {
      const info = wx.getSystemInfoSync()
      if (Number.isFinite(Number(info.statusBarHeight))) return Number(info.statusBarHeight)
    }
  } catch (_) {
    // 使用稳定默认值；布局不会因系统信息读取失败而阻塞。
  }
  return 20
}

function readLocalState() {
  try {
    if (typeof wx.getStorageSync !== 'function') return null
    const value = wx.getStorageSync(STORAGE_KEY)
    if (!value || typeof value !== 'object') return null
    const updatedAt = Number(value.updatedAt)
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > LOCAL_RETENTION_MS) return null
    return {
      lastQuestion: boundedQuestion(value.lastQuestion),
      draft: boundedQuestion(value.draft)
    }
  } catch (_) {
    return null
  }
}

function saveLocalState(lastQuestion, draft) {
  try {
    if (typeof wx.setStorageSync !== 'function') return
    wx.setStorageSync(STORAGE_KEY, {
      lastQuestion: boundedQuestion(lastQuestion),
      draft: boundedQuestion(draft),
      updatedAt: Date.now()
    })
  } catch (_) {
    // 本机保存失败不影响断网恢复入口。
  }
}

function getNetworkType() {
  return new Promise(resolve => {
    if (typeof wx.getNetworkType !== 'function') {
      resolve('unknown')
      return
    }
    wx.getNetworkType({
      success(result) {
        resolve(String(result && result.networkType || 'unknown'))
      },
      fail() {
        resolve('unknown')
      }
    })
  })
}

function hasConnection(networkType) {
  return Boolean(networkType && networkType !== 'none' && networkType !== 'unknown')
}

Page({
  data: {
    statusBarHeight: 20,
    lastQuestion: '',
    draft: '',
    canSend: false,
    focusInput: false,
    previewMode: false,
    networkError: false,
    networkConnected: true,
    retrying: false,
    networkHint: '请检查网络或重试'
  },

  async onLoad(options = {}) {
    this._isUnloaded = false
    this._networkListener = this.handleNetworkChange.bind(this)
    const stored = readLocalState() || {}
    const optionQuestion = decodeQuestion(options.question)
    const previewMode = options.preview === 'network-error'
    const lastQuestion = optionQuestion || stored.lastQuestion || ''
    const draft = optionQuestion ? '' : stored.draft || ''
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      lastQuestion,
      draft,
      previewMode,
      canSend: Boolean(boundedQuestion(draft))
    })
    if (previewMode) {
      this.setData({
        networkConnected: false,
        networkError: true,
        retrying: false,
        networkHint: '请检查网络或重试'
      })
      return
    }
    if (typeof wx.onNetworkStatusChange === 'function') {
      wx.onNetworkStatusChange(this._networkListener)
    }
    await this.refreshNetworkState()
  },

  onUnload() {
    this._isUnloaded = true
    saveLocalState(this.data.lastQuestion, this.data.draft)
    if (this._networkListener && typeof wx.offNetworkStatusChange === 'function') {
      wx.offNetworkStatusChange(this._networkListener)
    }
  },

  handleNetworkChange(result = {}) {
    if (this._isUnloaded) return
    const connected = result.isConnected === true || hasConnection(result.networkType)
    if (!connected) {
      this.setData({
        networkConnected: false,
        networkError: true,
        retrying: false,
        networkHint: '请检查网络或重试'
      })
      return
    }
    this.setData({
      networkConnected: true,
      networkHint: this.data.networkError ? '网络已恢复，可以重新尝试' : ''
    })
  },

  async refreshNetworkState() {
    const networkType = await getNetworkType()
    if (this._isUnloaded) return false
    const connected = hasConnection(networkType)
    this.setData({
      networkConnected: connected,
      networkError: !connected,
      retrying: false,
      networkHint: connected ? '' : '请检查网络或重试'
    })
    return connected
  },

  inputQuestion(event) {
    if (this._isUnloaded) return
    const draft = String(event && event.detail ? event.detail.value : '').slice(0, MAX_QUESTION_LENGTH)
    this.setData({ draft, canSend: Boolean(boundedQuestion(draft)), focusInput: false })
    saveLocalState(this.data.lastQuestion, draft)
  },

  async sendQuestion() {
    if (this._isUnloaded) return false
    const question = boundedQuestion(this.data.draft)
    if (!question) return false
    const networkType = await getNetworkType()
    if (this._isUnloaded) return false
    if (!hasConnection(networkType)) {
      this.setData({
        lastQuestion: question,
        draft: '',
        canSend: false,
        focusInput: false,
        networkConnected: false,
        networkError: true,
        retrying: false,
        networkHint: '请检查网络或重试'
      })
      saveLocalState(question, '')
      return true
    }
    wx.showToast({ title: 'AI问答正在建设中', icon: 'none' })
    return false
  },

  async retryNetwork() {
    if (this._isUnloaded || this.data.retrying) return false
    this.setData({ previewMode: false, retrying: true, networkHint: '正在检查网络...' })
    const networkType = await getNetworkType()
    if (this._isUnloaded) return false
    if (!hasConnection(networkType)) {
      this.setData({
        networkConnected: false,
        networkError: true,
        retrying: false,
        networkHint: '请检查网络或重试'
      })
      return false
    }
    this.setData({
      networkConnected: true,
      networkError: false,
      retrying: false,
      networkHint: ''
    })
    wx.showToast({ title: '网络已恢复', icon: 'success' })
    return true
  },

  copyQuestion() {
    const question = boundedQuestion(this.data.lastQuestion)
    if (!question || typeof wx.setClipboardData !== 'function') return Promise.resolve(false)
    return new Promise(resolve => {
      wx.setClipboardData({
        data: question,
        success() {
          wx.showToast({ title: '问题已复制', icon: 'success' })
          resolve(true)
        },
        fail() {
          wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
          resolve(false)
        }
      })
    })
  },

  editQuestion() {
    const draft = boundedQuestion(this.data.lastQuestion)
    if (!draft) return
    this.setData({ draft, canSend: true, focusInput: true })
    saveLocalState(this.data.lastQuestion, draft)
  },

  showAttachmentUnavailable() {
    wx.showToast({ title: '暂不支持附件', icon: 'none' })
  },

  openLibrary() {
    wx.switchTab({ url: '/pages/guides/index' })
  },

  openSearch() {
    navigation.openSearch(this.data.lastQuestion || this.data.draft || '')
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.switchTab({ url: '/pages/guides/index' })
      }
    })
  }
})
