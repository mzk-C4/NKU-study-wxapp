const navigation = require('../../utils/navigation')

const STORAGE_KEY = 'nkustudy_guide_assistant_local_state'
const MAX_QUESTION_LENGTH = 1000
const LOCAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const ANSWER_PREVIEW_QUESTION = '我对一门课程的成绩有异议，应该怎么申请复核？'
const ANSWER_CLIPBOARD_TEXT = [
  '你可以在下一学期开学3周内，向开课单位提出书面申请。开课单位受理后会组织人员复议，并给出复议意见；超过时限，开课单位可以不予受理。',
  '如果复议后确需更改成绩，任课教师不能直接修改。应由任课教师填写成绩更改申请，经开课单位审批、系统提交并由教务部批准后完成更改。',
  '来源：《南开大学本科课程考试与成绩管理规定》（教字〔2024〕2号）第十四条、第十五条。'
].join('\n\n')

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

function normalizeHistory(value, now = Date.now()) {
  if (!Array.isArray(value)) return []
  return value.map(item => ({
    question: boundedQuestion(item && item.question),
    state: item && item.state === 'answer' ? 'answer' : 'network-error',
    updatedAt: Number(item && item.updatedAt) || now,
    pinned: Boolean(item && item.pinned)
  })).filter(item => (
    item.question &&
    item.updatedAt <= now &&
    now - item.updatedAt <= LOCAL_RETENTION_MS
  )).sort((left, right) => right.updatedAt - left.updatedAt)
}

function addHistoryEntry(history, question, state) {
  const normalizedQuestion = boundedQuestion(question)
  if (!normalizedQuestion) return normalizeHistory(history)
  const normalizedHistory = normalizeHistory(history)
  const previous = normalizedHistory.find(item => item.question === normalizedQuestion)
  return [
    {
      question: normalizedQuestion,
      state: state === 'answer' ? 'answer' : 'network-error',
      updatedAt: Date.now(),
      pinned: Boolean(previous && previous.pinned)
    },
    ...normalizedHistory.filter(item => item.question !== normalizedQuestion)
  ]
}

function startOfLocalDay(timestamp) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function buildHistoryGroups(history, search = '', now = Date.now()) {
  const query = boundedQuestion(search).toLocaleLowerCase()
  const today = startOfLocalDay(now)
  const definitions = [
    { key: 'pinned', label: '置顶', matches: item => item.pinned },
    { key: 'today', label: '今天', matches: item => !item.pinned && item.updatedAt >= today },
    { key: 'yesterday', label: '昨天', matches: item => !item.pinned && item.updatedAt >= today - DAY_MS && item.updatedAt < today },
    { key: 'seven-days', label: '7天内', matches: item => !item.pinned && item.updatedAt >= today - 7 * DAY_MS && item.updatedAt < today - DAY_MS },
    { key: 'thirty-days', label: '30天内', matches: item => !item.pinned && item.updatedAt < today - 7 * DAY_MS }
  ]
  const filtered = normalizeHistory(history, now).filter(item => (
    !query || item.question.toLocaleLowerCase().includes(query)
  ))
  return definitions.map(group => ({
    key: group.key,
    label: group.label,
    items: filtered.filter(group.matches).map(item => ({
      ...item,
      pinAriaLabel: item.pinned ? `取消置顶：${item.question}` : `置顶：${item.question}`
    }))
  })).filter(group => group.items.length)
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
      draft: boundedQuestion(value.draft),
      history: normalizeHistory(value.history)
    }
  } catch (_) {
    return null
  }
}

function saveLocalState(lastQuestion, draft, history = []) {
  try {
    if (typeof wx.setStorageSync !== 'function') return
    wx.setStorageSync(STORAGE_KEY, {
      lastQuestion: boundedQuestion(lastQuestion),
      draft: boundedQuestion(draft),
      history: normalizeHistory(history),
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
    editingQuestion: false,
    editingQuestionValue: '',
    canSendEditedQuestion: false,
    focusQuestionEditor: false,
    previewMode: false,
    previewState: '',
    answerMode: false,
    newTopicMode: false,
    history: [],
    historyDrawerOpen: false,
    historySearch: '',
    historyGroups: [],
    answerFeedback: '',
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
    const previewState = options.preview === 'answer'
      ? 'answer'
      : options.preview === 'network-error' ? 'network-error' : ''
    const previewMode = Boolean(previewState)
    const answerMode = previewState === 'answer'
    const lastQuestion = optionQuestion || (answerMode ? ANSWER_PREVIEW_QUESTION : stored.lastQuestion || '')
    const draft = optionQuestion ? '' : stored.draft || ''
    const history = previewMode
      ? addHistoryEntry(stored.history, lastQuestion, previewState)
      : normalizeHistory(stored.history)
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      lastQuestion,
      draft,
      previewMode,
      previewState,
      answerMode,
      newTopicMode: false,
      history,
      canSend: Boolean(boundedQuestion(draft))
    })
    saveLocalState(lastQuestion, draft, history)
    if (answerMode) {
      this.setData({
        networkConnected: true,
        networkError: false,
        retrying: false,
        networkHint: ''
      })
      return
    }
    if (previewState === 'network-error') {
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
    saveLocalState(this.data.lastQuestion, this.data.draft, this.data.history)
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
    saveLocalState(this.data.lastQuestion, draft, this.data.history)
  },

  async sendQuestion() {
    if (this._isUnloaded) return false
    const question = boundedQuestion(this.data.draft)
    if (!question) return false
    if (this.data.previewState === 'answer') {
      wx.showToast({ title: 'AI问答正在建设中', icon: 'none' })
      return false
    }
    let connected = false
    if (!this.data.previewMode) {
      const networkType = await getNetworkType()
      if (this._isUnloaded) return false
      connected = hasConnection(networkType)
    }
    if (!connected) {
      const history = addHistoryEntry(this.data.history, question, 'network-error')
      this.setData({
        lastQuestion: question,
        draft: '',
        canSend: false,
        focusInput: false,
        networkConnected: false,
        networkError: true,
        retrying: false,
        answerMode: false,
        newTopicMode: false,
        history,
        networkHint: '请检查网络或重试'
      })
      saveLocalState(question, '', history)
      return true
    }
    wx.showToast({ title: 'AI问答正在建设中', icon: 'none' })
    return false
  },

  async retryNetwork() {
    if (this._isUnloaded || this.data.retrying) return false
    this.setData({ previewMode: false, previewState: '', retrying: true, networkHint: '正在检查网络...' })
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

  openConversationHistory() {
    if (this._isUnloaded) return
    const fallbackState = this.data.answerMode ? 'answer' : 'network-error'
    const history = this.data.history.length
      ? normalizeHistory(this.data.history)
      : addHistoryEntry([], this.data.lastQuestion, fallbackState)
    this.setData({
      history,
      historyDrawerOpen: true,
      historySearch: '',
      historyGroups: buildHistoryGroups(history)
    })
  },

  closeConversationHistory() {
    if (this._isUnloaded) return
    this.setData({ historyDrawerOpen: false, historySearch: '', historyGroups: [] })
  },

  inputHistorySearch(event) {
    if (this._isUnloaded) return
    const historySearch = boundedQuestion(event && event.detail ? event.detail.value : '')
    this.setData({
      historySearch,
      historyGroups: buildHistoryGroups(this.data.history, historySearch)
    })
  },

  selectHistory(event) {
    if (this._isUnloaded) return
    const question = boundedQuestion(event && event.currentTarget && event.currentTarget.dataset.question)
    const history = normalizeHistory(this.data.history)
    const item = history.find(entry => entry.question === question)
    if (!item) return
    const answerMode = item.state === 'answer'
    this.setData({
      lastQuestion: item.question,
      draft: '',
      canSend: false,
      focusInput: false,
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false,
      previewMode: true,
      previewState: item.state,
      answerMode,
      newTopicMode: false,
      historyDrawerOpen: false,
      historySearch: '',
      historyGroups: [],
      answerFeedback: '',
      networkConnected: answerMode,
      networkError: !answerMode,
      retrying: false,
      networkHint: answerMode ? '' : '请检查网络或重试',
      history
    })
    saveLocalState(item.question, '', history)
  },

  toggleHistoryPin(event) {
    if (this._isUnloaded) return
    const question = boundedQuestion(event && event.currentTarget && event.currentTarget.dataset.question)
    const history = normalizeHistory(this.data.history).map(item => (
      item.question === question ? { ...item, pinned: !item.pinned } : item
    ))
    this.setData({
      history,
      historyGroups: buildHistoryGroups(history, this.data.historySearch)
    })
    saveLocalState(this.data.lastQuestion, this.data.draft, history)
  },

  stopPropagation() {},

  startNewTopic() {
    if (this._isUnloaded) return
    const previousState = this.data.answerMode ? 'answer' : 'network-error'
    const history = addHistoryEntry(this.data.history, this.data.lastQuestion, previousState)
    const stayOffline = this.data.networkError && this.data.previewState === 'network-error'
    this.setData({
      lastQuestion: '',
      draft: '',
      canSend: false,
      focusInput: false,
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false,
      previewMode: stayOffline,
      previewState: stayOffline ? 'network-error' : '',
      answerMode: false,
      newTopicMode: true,
      historyDrawerOpen: false,
      historySearch: '',
      historyGroups: [],
      answerFeedback: '',
      networkConnected: !stayOffline,
      networkError: stayOffline,
      retrying: false,
      networkHint: stayOffline ? '请检查网络或重试' : '',
      history
    }, () => {
      if (!this._isUnloaded) this.setData({ focusInput: true })
    })
    saveLocalState('', '', history)
  },

  copyAnswer() {
    if (typeof wx.setClipboardData !== 'function') return Promise.resolve(false)
    return new Promise(resolve => {
      wx.setClipboardData({
        data: ANSWER_CLIPBOARD_TEXT,
        success() {
          wx.showToast({ title: '回答已复制', icon: 'success' })
          resolve(true)
        },
        fail() {
          wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
          resolve(false)
        }
      })
    })
  },

  regenerateAnswer() {
    wx.showToast({ title: 'AI问答正在建设中', icon: 'none' })
  },

  rateAnswer(event) {
    const value = String(event && event.currentTarget && event.currentTarget.dataset.value || '')
    if (value !== 'helpful' && value !== 'unhelpful') return
    this.setData({ answerFeedback: value })
    wx.showToast({ title: value === 'helpful' ? '感谢反馈' : '已记录反馈', icon: 'none' })
  },

  openAnswerSource() {
    wx.showToast({ title: '原文跳转正在建设中', icon: 'none' })
    return Promise.resolve(false)
  },

  editQuestion() {
    const editingQuestionValue = boundedQuestion(this.data.lastQuestion)
    if (!editingQuestionValue || this._isUnloaded) return
    this.setData({
      editingQuestion: true,
      editingQuestionValue,
      canSendEditedQuestion: true,
      focusQuestionEditor: false
    }, () => {
      if (this._isUnloaded || !this.data.editingQuestion) return
      this.setData({ focusQuestionEditor: true })
    })
  },

  inputEditedQuestion(event) {
    if (this._isUnloaded) return
    const editingQuestionValue = String(event && event.detail ? event.detail.value : '').slice(0, MAX_QUESTION_LENGTH)
    this.setData({
      editingQuestionValue,
      canSendEditedQuestion: Boolean(boundedQuestion(editingQuestionValue))
    })
  },

  cancelQuestionEdit() {
    if (this._isUnloaded) return
    this.setData({
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false
    })
  },

  async submitEditedQuestion() {
    if (this._isUnloaded) return false
    const question = boundedQuestion(this.data.editingQuestionValue)
    if (!question) {
      wx.showToast({ title: '问题不能为空', icon: 'none' })
      return false
    }

    let connected = false
    if (!this.data.previewMode) {
      const networkType = await getNetworkType()
      if (this._isUnloaded) return false
      connected = hasConnection(networkType)
    }
    if (connected) {
      wx.showToast({ title: 'AI问答正在建设中', icon: 'none' })
      return false
    }

    this.setData({
      lastQuestion: question,
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false,
      networkConnected: false,
      networkError: true,
      retrying: false,
      networkHint: '请检查网络或重试'
    })
    const history = addHistoryEntry(this.data.history, question, 'network-error')
    this.setData({ history })
    saveLocalState(question, this.data.draft, history)
    return true
  },

  showAttachmentUnavailable() {
    wx.showToast({ title: '暂不支持附件', icon: 'none' })
  },

  openLibrary() {
    wx.switchTab({ url: '/pages/guides/index' })
  },

  openSearch() {
    navigation.openSearch(
      boundedQuestion(this.data.editingQuestionValue) || this.data.lastQuestion || this.data.draft || ''
    )
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
