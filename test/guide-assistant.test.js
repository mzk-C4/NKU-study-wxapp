const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const navigation = require('../miniprogram/utils/navigation')
const learningProfile = require('../miniprogram/utils/learning-profile')
const { createGuideAssistantController } = require('../miniprogram/features/guide-assistant/controller')

const projectRoot = path.resolve(__dirname, '..')

function capturePage(relativePath) {
  const modulePath = require.resolve(path.join(projectRoot, relativePath))
  const previousPage = global.Page
  let definition
  global.Page = value => { definition = value }
  delete require.cache[modulePath]
  try {
    require(modulePath)
  } finally {
    delete require.cache[modulePath]
    if (previousPage === undefined) delete global.Page
    else global.Page = previousPage
  }
  return definition
}

function createPage(definition, data = {}) {
  const page = {
    ...definition,
    data: { ...JSON.parse(JSON.stringify(definition.data)), ...data },
    _isUnloaded: false,
    _setDataCalls: []
  }
  page.setData = function setData(patch, callback) {
    this._setDataCalls.push(patch)
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return page
}

function installWx(t, implementation = {}) {
  const hadWx = Object.hasOwn(global, 'wx')
  const previousWx = global.wx
  global.wx = {
    getWindowInfo() { return { statusBarHeight: 22 } },
    getStorageSync() { return null },
    setStorageSync() {},
    onNetworkStatusChange() {},
    offNetworkStatusChange() {},
    getNetworkType(options) { options.success({ networkType: 'wifi' }) },
    navigateTo() {},
    navigateBack() {},
    switchTab() {},
    setClipboardData(options) { options.success() },
    showModal() {},
    showToast() {},
    ...implementation
  }
  t.after(() => {
    if (hadWx) global.wx = previousWx
    else delete global.wx
  })
}

const assistantDefinition = capturePage('miniprogram/pages/guide-assistant/index.js')
const guidesDefinition = capturePage('miniprogram/pages/guides/index.js')

test('AI assistant offline page is registered and matches the approved recovery structure', () => {
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.json'), 'utf8'))
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.wxss'), 'utf8')
  const source = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.js'), 'utf8')

  assert.ok(app.pages.includes('pages/guide-assistant/index'))
  assert.equal(config.navigationStyle, 'custom')
  assert.match(template, /学习指南针 AI 问答/)
  assert.match(template, /对话记录/)
  assert.match(template, /新开话题/)
  assert.match(template, /正在查找资料并整理回答中/)
  assert.match(template, /现有资料暂时无法回答/)
  assert.match(template, /今天想了解什么/)
  assert.match(template, /bindtap="chooseExampleQuestion"/)
  assert.match(template, /disabled="{{requestPending \|\| roundLimitReached/)
  assert.match(template, /class="new-topic-logo"/)
  assert.match(template, /class="new-topic-logo-face"/)
  assert.match(template, /class="composer-notice" wx:if="{{statusMessage}}" aria-live="polite"/)
  assert.match(styles, /generating-card/)
  assert.match(styles, /@keyframes generating-dot-wave/)
  assert.match(styles, /\.generating-dot:nth-child\(10\)[^}]*animation-delay:\s*1\.08s/s)
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/)
  assert.match(styles, /\.new-topic-profile\s*\{[^}]*width:\s*100%\s*!important[^}]*min-width:\s*100%[^}]*max-width:\s*100%/s)
  assert.match(styles, /\.new-topic-profile > text:nth-child\(2\)\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/s)
  assert.match(styles, /refusal-card/)
  assert.match(styles, /new-topic-example/)
  assert.match(template, /bindtap="openConversationHistory"/)
  assert.match(template, /bindtap="startNewTopic"/)
  assert.match(template, /class="history-drawer"/)
  assert.match(template, /placeholder="搜索对话内容\.\.\."/)
  assert.match(template, /bindtap="toggleHistoryPin"/)
  assert.match(template, /bindlongpress="openHistoryActions"/)
  assert.match(template, /class="history-action-card"/)
  assert.match(template, /bindtap="openHistoryRename"/)
  assert.match(template, /bindtap="chooseHistoryPin"/)
  assert.match(template, /bindtap="chooseHistoryDelete"/)
  assert.match(template, /重命名会话/)
  assert.match(template, /class="history-pin-mark"/)
  assert.doesNotMatch(template, /★|☆/)
  assert.match(template, /bindfocus="focusComposer"/)
  assert.match(template, /bindblur="blurComposer"/)
  assert.match(template, /没有找到相关对话/)
  assert.match(template, /学习指南针回答/)
  assert.match(template, /《南开大学本科课程考试与成绩管理规定》/)
  assert.match(template, /bindtap="openAnswerSource"/)
  assert.match(template, /class="source-title"[\s\S]*class="source-detail-row"[\s\S]*class="source-meta-group"[\s\S]*class="source-open-button"/)
  assert.match(template, /当前已完成 \{\{roundLabel\}\} 轮/)
  assert.match(source, /请检查网络或重试/)
  assert.match(template, /浏览知识库/)
  assert.match(template, /去普通搜索/)
  assert.match(template, /给学习指南针发送消息/)
  assert.match(template, /内容由 AI 生成，请仔细甄别/)
  assert.match(template, /bindtap="retryNetwork"/)
  assert.match(template, /bindtap="copyQuestion"/)
  assert.match(template, /bindtap="editQuestion"/)
  assert.match(template, /class="question-bubble question-editor"/)
  assert.match(template, /focus="{{focusQuestionEditor}}"/)
  assert.match(template, /bindtap="cancelQuestionEdit"/)
  assert.match(template, /bindtap="submitEditedQuestion"/)
  assert.match(styles, /\.question-state\s*\{[^}]*padding-left:\s*184rpx/s)
  assert.match(styles, /\.assistant-actions\s*\{[^}]*justify-content:\s*space-between/s)
  assert.match(styles, /\.history-drawer\s*\{[^}]*left:\s*0[^}]*width:\s*86%/s)
  assert.match(styles, /\.history-pin-mark\s*\{[^}]*transform:\s*rotate\(28deg\)/s)
  assert.match(styles, /\.history-action-card,[\s\S]*position:\s*absolute/s)
  assert.match(styles, /\.history-action-row--danger\s*\{[^}]*#E64949/s)
  assert.match(styles, /\.paperclip-icon::before,[\s\S]*\.paperclip-icon::after/)
  assert.match(styles, /\.answer-question-bubble\s*\{[^}]*width:\s*74%/s)
  assert.match(styles, /\.answer-card\s*\{[^}]*border-radius:\s*30rpx/s)
  assert.match(styles, /\.source-body\s*\{[^}]*grid-template-columns:\s*82rpx minmax\(0, 1fr\)/s)
  assert.match(styles, /\.source-detail-row\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*space-between/s)
  assert.match(styles, /\.source-open-button\s*\{[^}]*width:\s*164rpx\s*!important[^}]*white-space:\s*nowrap/s)
  assert.match(styles, /\.assistant-content\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s)
  assert.match(styles, /\.continue-section\s*\{[^}]*margin-top:\s*auto/s)
  assert.match(styles, /\.continue-card\s*\{[^}]*width:\s*100%\s*!important/s)
  assert.match(styles, /\.composer-area\s*\{[^}]*position:\s*fixed/s)
  assert.doesNotMatch(source, /public-api|wx\.request|guide-assistant\/answers/)
  assert.doesNotMatch(template + source, /一键清空|清空全部|清除全部AI会话/)
  assert.doesNotMatch(template + source, /auth_token|Authorization|Bearer|openid/i)
  assert.doesNotMatch(source, /showActionSheet/)
})

test('new-topic preview renders the welcome state and example buttons fill the composer', async t => {
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) }
  })
  const page = createPage(assistantDefinition)

  await page.onLoad({ preview: 'new-topic' })

  assert.equal(networkChecks, 0)
  assert.equal(page.data.previewMode, true)
  assert.equal(page.data.previewState, 'new-topic')
  assert.equal(page.data.newTopicMode, true)
  assert.equal(page.data.lastQuestion, '')
  assert.deepEqual(page.data.exampleQuestions, [
    '对课程成绩有异议，如何申请复核？',
    '休学期满后如何申请复学？',
    '本科课程作业中如何规范使用 AI 工具？'
  ])

  page.chooseExampleQuestion({ currentTarget: { dataset: { question: page.data.exampleQuestions[1] } } })
  assert.equal(page.data.draft, '休学期满后如何申请复学？')
  assert.equal(page.data.canSend, true)
  assert.equal(page.data.focusInput, true)
})

test('generating preview is local, keeps the question, and disables submission', async t => {
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) }
  })
  const page = createPage(assistantDefinition)

  await page.onLoad({ preview: 'generating' })

  assert.equal(networkChecks, 0)
  assert.equal(page.data.previewState, 'generating')
  assert.equal(page.data.lastQuestion, '我对一门课程的成绩有异议，应该怎么申请复核？')
  assert.equal(page.data.networkError, false)
  page.inputQuestion({ detail: { value: '不应写入' } })
  assert.equal(page.data.draft, '')
  assert.equal(await page.sendQuestion(), false)
})

test('refusal preview keeps the question and stays separate from answer and offline states', async t => {
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) }
  })
  const page = createPage(assistantDefinition)

  await page.onLoad({ preview: 'refusal' })

  assert.equal(networkChecks, 0)
  assert.equal(page.data.previewState, 'refusal')
  assert.equal(page.data.lastQuestion, '宿舍晚上几点断电？')
  assert.equal(page.data.answerMode, false)
  assert.equal(page.data.networkError, false)
})

test('new topic submission only moves to the local generating state', async t => {
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) }
  })
  const page = createPage(assistantDefinition, {
    newTopicMode: true,
    previewMode: true,
    previewState: 'new-topic',
    draft: '本科课程作业中如何规范使用 AI 工具？',
    canSend: true
  })

  assert.equal(await page.sendQuestion(), true)
  assert.equal(networkChecks, 0)
  assert.equal(page.data.previewState, 'generating')
  assert.equal(page.data.lastQuestion, '本科课程作业中如何规范使用 AI 工具？')
  assert.equal(page.data.draft, '')
})
test('loading the assistant while offline restores the question and registers network recovery', async t => {
  let listener
  let removed
  installWx(t, {
    getNetworkType(options) { options.success({ networkType: 'none' }) },
    onNetworkStatusChange(callback) { listener = callback },
    offNetworkStatusChange(callback) { removed = callback }
  })
  const page = createPage(assistantDefinition)
  const question = '我对一门课程的成绩有异议，应该怎么申请复核？'

  await page.onLoad({ question: encodeURIComponent(question) })

  assert.equal(page.data.statusBarHeight, 22)
  assert.equal(page.data.lastQuestion, question)
  assert.equal(page.data.networkError, true)
  assert.equal(page.data.networkConnected, false)
  assert.equal(page.data.networkHint, '请检查网络或重试')
  assert.equal(typeof listener, 'function')

  listener({ isConnected: true, networkType: 'wifi' })
  assert.equal(page.data.networkConnected, true)
  assert.equal(page.data.networkError, true)
  assert.equal(page.data.networkHint, '网络已恢复，可以重新尝试')

  page.onUnload()
  assert.equal(removed, listener)
})

test('sending while offline preserves the question without calling an AI endpoint', async t => {
  const saved = []
  installWx(t, {
    getNetworkType(options) { options.success({ networkType: 'none' }) },
    setStorageSync(key, value) { saved.push({ key, value }) }
  })
  const page = createPage(assistantDefinition, {
    draft: '  我对一门课程的成绩有异议，应该怎么申请复核？  ',
    canSend: true
  })

  assert.equal(await page.sendQuestion(), true)
  assert.equal(page.data.lastQuestion, '我对一门课程的成绩有异议，应该怎么申请复核？')
  assert.equal(page.data.draft, '')
  assert.equal(page.data.canSend, false)
  assert.equal(page.data.networkError, true)
  assert.equal(saved.at(-1).value.lastQuestion, page.data.lastQuestion)
})

test('composer keeps focus while consecutive characters update the draft', t => {
  const saved = []
  installWx(t, { setStorageSync(key, value) { saved.push({ key, value }) } })
  const page = createPage(assistantDefinition)

  page.focusComposer()
  page.inputQuestion({ detail: { value: '成' } })
  page.inputQuestion({ detail: { value: '成绩' } })

  assert.equal(page.data.focusInput, true)
  assert.equal(page.data.draft, '成绩')
  assert.equal(page.data.canSend, true)
  assert.equal(saved.at(-1).value.draft, '成绩')

  page.blurComposer()
  assert.equal(page.data.focusInput, false)
})

test('assistant recovery controls copy, edit in place, browse and search without leaking diagnostics', async t => {
  const copied = []
  const toasts = []
  const tabs = []
  const searches = []
  const originalOpenSearch = navigation.openSearch
  navigation.openSearch = query => searches.push(query)
  t.after(() => { navigation.openSearch = originalOpenSearch })
  installWx(t, {
    setClipboardData(options) { copied.push(options.data); options.success() },
    showToast(options) { toasts.push(options) },
    switchTab(options) { tabs.push(options.url) }
  })
  const question = '成绩复核怎么申请？'
  const page = createPage(assistantDefinition, {
    lastQuestion: question,
    draft: '底部输入框原有草稿',
    canSend: true,
    networkError: true
  })

  assert.equal(await page.copyQuestion(), true)
  page.editQuestion()
  page.openLibrary()
  page.openSearch()
  page.showAttachmentUnavailable()

  assert.deepEqual(copied, [question])
  assert.equal(page.data.draft, '底部输入框原有草稿')
  assert.equal(page.data.focusInput, false)
  assert.equal(page.data.editingQuestion, true)
  assert.equal(page.data.editingQuestionValue, question)
  assert.equal(page.data.focusQuestionEditor, true)
  assert.deepEqual(tabs, ['/pages/guides/index'])
  assert.deepEqual(searches, [question])
  assert.deepEqual(toasts.map(item => item.title), ['问题已复制', '暂不支持附件'])
  assert.doesNotMatch(toasts.map(item => item.title).join(' '), /provider|stack|request id|token/i)
})

test('conversation drawer searches, groups, pins and restores a local answer', t => {
  const saved = []
  installWx(t, {
    setStorageSync(key, value) { saved.push({ key, value }) }
  })
  const now = Date.now()
  const todayStart = new Date(now).setHours(0, 0, 0, 0)
  const question = '我对一门课程的成绩有异议，应该怎么申请复核？'
  const yesterdayQuestion = '休学期满后如何申请复学？'
  const page = createPage(assistantDefinition, {
    lastQuestion: question,
    previewMode: true,
    previewState: 'answer',
    answerMode: true,
    history: [
      { question, state: 'answer', updatedAt: now, pinned: false },
      { question: yesterdayQuestion, state: 'network-error', updatedAt: todayStart - 60 * 60 * 1000, pinned: false }
    ]
  })

  page.openConversationHistory()

  assert.equal(page.data.historyDrawerOpen, true)
  assert.deepEqual(page.data.historyGroups.map(group => group.label), ['今天', '昨天'])
  assert.equal(page.data.historyGroups[0].items[0].title, question.slice(0, 50))

  page.inputHistorySearch({ detail: { value: '复学' } })
  assert.deepEqual(page.data.historyGroups.map(group => group.label), ['昨天'])
  assert.equal(page.data.historyGroups[0].items[0].question, yesterdayQuestion)

  page.toggleHistoryPin({ currentTarget: { dataset: { question: yesterdayQuestion } } })
  assert.equal(page.data.historyGroups[0].label, '置顶')
  assert.equal(page.data.historyGroups[0].items[0].pinned, true)
  assert.equal(saved.at(-1).value.history.find(item => item.question === yesterdayQuestion).pinned, true)

  page.selectHistory({ currentTarget: { dataset: { question: yesterdayQuestion } } })
  assert.equal(page.data.historyDrawerOpen, false)
  assert.equal(page.data.lastQuestion, yesterdayQuestion)
  assert.equal(page.data.answerMode, false)
  assert.equal(page.data.networkError, true)

  page.startNewTopic()

  assert.equal(page.data.lastQuestion, '')
  assert.equal(page.data.answerMode, false)
  assert.equal(page.data.newTopicMode, true)
  assert.equal(page.data.focusInput, true)
  assert.equal(page.data.history[0].question, yesterdayQuestion)
  assert.equal(page.data.history[0].state, 'network-error')
  assert.equal(page.data.history[0].pinned, true)
  assert.equal(saved.at(-1).value.history[0].question, yesterdayQuestion)
})

test('long pressing a conversation opens custom rename, pin and delete actions', t => {
  const modals = []
  const toasts = []
  installWx(t, {
    showModal(options) {
      modals.push({ title: options.title, content: options.content })
      options.success({ confirm: true })
    },
    showToast(options) { toasts.push(options.title) }
  })
  const now = Date.now()
  const pinnedQuestion = '成绩复核怎么申请？'
  const deletedQuestion = '休学后如何复学？'
  const page = createPage(assistantDefinition, {
    lastQuestion: deletedQuestion,
    previewMode: true,
    previewState: 'network-error',
    networkError: true,
    history: [
      { question: pinnedQuestion, state: 'answer', updatedAt: now, pinned: false },
      { question: deletedQuestion, state: 'network-error', updatedAt: now - 1000, pinned: false }
    ]
  })

  page.openConversationHistory()
  page.openHistoryActions({ currentTarget: { dataset: { question: pinnedQuestion } } })
  assert.equal(page.data.historyActionQuestion, pinnedQuestion)
  assert.equal(page.data.historyRenameMode, false)

  page.openHistoryRename({ currentTarget: { dataset: { question: pinnedQuestion } } })
  assert.equal(page.data.historyRenameMode, true)
  assert.equal(page.data.focusHistoryRename, true)
  page.inputHistoryRename({ detail: { value: '   ' } })
  assert.equal(page.saveHistoryRename(), false)
  page.inputHistoryRename({ detail: { value: '课程成绩复核流程' } })
  assert.equal(page.saveHistoryRename(), true)
  assert.equal(page.data.history.find(item => item.question === pinnedQuestion).title, '课程成绩复核流程')
  assert.equal(page.data.history.find(item => item.title === '课程成绩复核流程').question, pinnedQuestion)
  page.inputHistorySearch({ detail: { value: '课程成绩' } })
  assert.equal(page.data.historyGroups[0].items[0].title, '课程成绩复核流程')
  page.inputHistorySearch({ detail: { value: '' } })

  page.openHistoryActions({ currentTarget: { dataset: { question: pinnedQuestion } } })
  page.chooseHistoryPin({ currentTarget: { dataset: { question: pinnedQuestion } } })
  assert.equal(page.data.history.find(item => item.question === pinnedQuestion).pinned, true)

  page.openHistoryActions({ currentTarget: { dataset: { question: deletedQuestion } } })
  page.chooseHistoryDelete({ currentTarget: { dataset: { question: deletedQuestion } } })
  assert.equal(page.data.history.some(item => item.question === deletedQuestion), false)
  assert.equal(page.data.lastQuestion, '')
  assert.equal(page.data.newTopicMode, true)
  assert.equal(page.data.historyDrawerOpen, false)
  assert.equal(page.data.focusInput, true)
  assert.deepEqual(modals, [{
    title: '删除这条会话？',
    content: '删除后无法从本机会话记录中恢复。'
  }])
  assert.deepEqual(toasts, ['会话名称不能为空', '会话已重命名', '已置顶', '会话已删除'])
})

test('conversation history keeps only entries from the latest 30 days', async t => {
  const now = Date.now()
  const recentQuestion = '最近的问题'
  installWx(t, {
    getStorageSync() {
      return {
        lastQuestion: recentQuestion,
        draft: '',
        updatedAt: now,
        history: [
          { question: recentQuestion, state: 'answer', updatedAt: now - 2 * 24 * 60 * 60 * 1000 },
          { question: '超过30天的问题', state: 'answer', updatedAt: now - 31 * 24 * 60 * 60 * 1000 }
        ]
      }
    }
  })
  const page = createPage(assistantDefinition)

  await page.onLoad({})
  page.openConversationHistory()

  assert.deepEqual(page.data.history.map(item => item.question), [recentQuestion])
  assert.equal(page.data.historyGroups[0].label, '7天内')
})

test('answer preview renders locally without checking the network or calling an AI endpoint', async t => {
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) }
  })
  const page = createPage(assistantDefinition)
  const question = '我对一门课程的成绩有异议，应该怎么申请复核？'

  await page.onLoad({ preview: 'answer', question: encodeURIComponent(question) })

  assert.equal(networkChecks, 0)
  assert.equal(page.data.previewMode, true)
  assert.equal(page.data.previewState, 'answer')
  assert.equal(page.data.answerMode, true)
  assert.equal(page.data.networkError, false)
  assert.equal(page.data.lastQuestion, question)
  assert.equal(page.data.history[0].state, 'answer')
})

test('answer actions copy the approved response while source stays a future navigation entry', async t => {
  const copied = []
  const toasts = []
  installWx(t, {
    setClipboardData(options) { copied.push(options.data); options.success() },
    showToast(options) { toasts.push(options.title) }
  })
  const page = createPage(assistantDefinition, { answerMode: true })

  assert.equal(await page.copyAnswer(), true)
  assert.equal(await page.openAnswerSource(), false)
  page.rateAnswer({ currentTarget: { dataset: { value: 'helpful' } } })

  assert.match(copied[0], /下一学期开学3周内/)
  assert.equal(copied.length, 1)
  assert.equal(page.data.answerFeedback, 'helpful')
  assert.deepEqual(toasts, ['回答已复制', '回答中没有可打开的来源', '感谢反馈'])
})

test('inline question editing can cancel or send in the approved offline preview', async t => {
  const saved = []
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) },
    setStorageSync(key, value) { saved.push({ key, value }) }
  })
  const page = createPage(assistantDefinition, {
    lastQuestion: '原问题',
    draft: '底部草稿保持不变',
    canSend: true,
    previewMode: true,
    networkError: true,
    networkConnected: false
  })

  page.editQuestion()
  page.inputEditedQuestion({ detail: { value: '取消的修改' } })
  page.cancelQuestionEdit()
  assert.equal(page.data.lastQuestion, '原问题')
  assert.equal(page.data.draft, '底部草稿保持不变')
  assert.equal(page.data.editingQuestion, false)

  page.editQuestion()
  page.inputEditedQuestion({ detail: { value: '  修改后的问题  ' } })
  assert.equal(await page.submitEditedQuestion(), true)
  assert.equal(networkChecks, 0)
  assert.equal(page.data.lastQuestion, '修改后的问题')
  assert.equal(page.data.draft, '底部草稿保持不变')
  assert.equal(page.data.editingQuestion, false)
  assert.equal(page.data.focusQuestionEditor, false)
  assert.equal(page.data.networkError, true)
  assert.equal(saved.at(-1).value.lastQuestion, '修改后的问题')
  assert.equal(saved.at(-1).value.draft, '底部草稿保持不变')
})

test('inline question editing rejects empty text and stays editable', async t => {
  const toasts = []
  installWx(t, { showToast(options) { toasts.push(options) } })
  const page = createPage(assistantDefinition, {
    lastQuestion: '原问题',
    editingQuestion: true,
    editingQuestionValue: '   ',
    canSendEditedQuestion: false,
    previewMode: true,
    networkError: true
  })

  assert.equal(await page.submitEditedQuestion(), false)
  assert.equal(page.data.editingQuestion, true)
  assert.equal(page.data.lastQuestion, '原问题')
  assert.deepEqual(toasts.map(item => item.title), ['问题不能为空'])
})

test('manual retry only leaves the offline state after a confirmed connection', async t => {
  const types = ['none', 'wifi']
  const toasts = []
  installWx(t, {
    getNetworkType(options) { options.success({ networkType: types.shift() }) },
    showToast(options) { toasts.push(options) }
  })
  const page = createPage(assistantDefinition, {
    lastQuestion: '成绩复核怎么申请？',
    networkError: true,
    networkConnected: false
  })

  assert.equal(await page.retryNetwork(), false)
  assert.equal(page.data.networkError, true)
  assert.equal(page.data.networkHint, '请检查网络或重试')

  assert.equal(await page.retryNetwork(), true)
  assert.equal(page.data.networkError, false)
  assert.equal(page.data.networkConnected, true)
  assert.deepEqual(toasts.map(item => item.title), ['网络已恢复，请再次发送'])
})

test('guide AI entry opens the real assistant without probing network or runtime profile', t => {
  const calls = []
  const originalOpenAssistant = navigation.openGuideAssistant
  navigation.openGuideAssistant = (question, options) => calls.push({ question, options })
  t.after(() => { navigation.openGuideAssistant = originalOpenAssistant })
  installWx(t, {
    getAccountInfoSync() { return { miniProgram: { envVersion: 'release' } } },
    getNetworkType() { assert.fail('guide entry must not probe network before opening the assistant') }
  })
  const page = createPage(guidesDefinition)

  page.openAssistant()

  assert.deepEqual(calls, [{ question: undefined, options: undefined }])
})

test('network-error preview renders the approved state even while the developer machine is online', async t => {
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) }
  })
  const page = createPage(assistantDefinition)

  await page.onLoad({
    preview: 'network-error',
    question: encodeURIComponent('我对一门课程的成绩有异议，应该怎么申请复核？')
  })

  assert.equal(networkChecks, 0)
  assert.equal(page.data.previewMode, true)
  assert.equal(page.data.networkError, true)
  assert.equal(page.data.networkConnected, false)
  assert.equal(page.data.networkHint, '请检查网络或重试')
})

test('assistant navigation encodes a bounded question in the stable route', t => {
  const routes = []
  installWx(t, { navigateTo(options) { routes.push(options.url) } })
  navigation.openGuideAssistant('成绩复核 / 下一步？')
  navigation.openGuideAssistant('成绩复核？', { previewNetworkError: true })
  navigation.openGuideAssistant('成绩复核？', { previewAnswer: true })
  assert.deepEqual(routes, [
    '/pages/guide-assistant/index?question=%E6%88%90%E7%BB%A9%E5%A4%8D%E6%A0%B8%20%2F%20%E4%B8%8B%E4%B8%80%E6%AD%A5%EF%BC%9F',
    '/pages/guide-assistant/index?question=%E6%88%90%E7%BB%A9%E5%A4%8D%E6%A0%B8%EF%BC%9F&preview=network-error',
    '/pages/guide-assistant/index?question=%E6%88%90%E7%BB%A9%E5%A4%8D%E6%A0%B8%EF%BC%9F&preview=answer'
  ])
})

test('reference page waits for the controller, renders real data, and restores one multi-round conversation', async t => {
  const requests = []
  installWx(t, {
    getStorageSync(key) {
      if (key === learningProfile.STORAGE_KEY) {
        return { version: 1, admission_year: '2025', major: '计算机科学与技术' }
      }
      return null
    }
  })
  const responses = [
    {
      refused: false,
      reason: '',
      answer: '第一轮真实回答',
      applicable_scope: '2025级本科生',
      freshness_notice: '以最新官方文件为准。',
      citations: [{
        id: 'SRC-003',
        title: '南开大学本科课程考试与成绩管理规定',
        document_no: '教字〔2024〕2号',
        publisher: '南开大学教务部',
        file_type: 'pdf',
        file_url: 'http://127.0.0.1:3000/__local__/learning-compass/source-files/SRC-003',
        official_page_url: ''
      }]
    },
    {
      refused: true,
      reason: 'SOURCE_CONFLICT',
      answer: '第二轮来源存在差异，无法给出统一结论。',
      applicable_scope: '',
      freshness_notice: '请以最新正式通知为准。',
      citations: []
    }
  ]
  const page = createPage(assistantDefinition, {
    newTopicMode: true,
    draft: '第一轮问题',
    canSend: true
  })
  page._assistantController = createGuideAssistantController({
    api: {
      async askGuideAssistant(input) {
        requests.push(input)
        return responses.shift()
      }
    }
  })

  assert.equal(await page.sendQuestion(), true)
  assert.equal(page.data.responseAnswer, '第一轮真实回答')
  assert.equal(page.data.responseCitations[0].id, 'SRC-003')
  assert.equal(page.data.completedRoundCount, 1)
  assert.equal(page.data.history.length, 1)
  assert.deepEqual(requests[0].profile, { admission_year: '2025', major: '计算机科学与技术' })

  page.inputQuestion({ detail: { value: '第二轮同主题问题' } })
  assert.equal(await page.sendQuestion(), true)
  assert.equal(page.data.previewState, 'refusal')
  assert.equal(page.data.responseReason, 'SOURCE_CONFLICT')
  assert.equal(page.data.completedRoundCount, 2)
  assert.equal(page.data.history.length, 1)
  assert.equal(page.data.history[0].rounds, 2)
  assert.equal(requests[1].history.length, 2)

  const conversationKey = page.data.history[0].question
  page.startNewTopic()
  assert.equal(page.data.completedRoundCount, 0)
  page.openConversationHistory()
  page.selectHistory({ currentTarget: { dataset: { question: conversationKey } } })
  assert.equal(page.data.completedRoundCount, 2)
  assert.equal(page.data.messages.length, 4)
  assert.equal(page.data.previousTurns.length, 1)
  assert.equal(page.data.previousTurns[0].answer, '第一轮真实回答')
  assert.equal(page.data.responseAnswer, '第二轮来源存在差异,无法给出统一结论。')
})

test('401 recovery logs in once and leaves the original question for manual retry', async t => {
  let toastCalls = 0
  installWx(t, { showToast() { toastCalls += 1 } })
  let submitCalls = 0
  let loginCalls = 0
  const page = createPage(assistantDefinition, {
    assistantState: 'auth-required',
    lastQuestion: '原问题',
    showRecoveryActions: true
  })
  page._assistantController = {
    async recoverAuthentication() { loginCalls += 1; return { ok: true, manualRetryRequired: true } },
    async submit() { submitCalls += 1 }
  }

  assert.equal(await page.recoverAuthentication(), true)
  assert.equal(loginCalls, 1)
  assert.equal(submitCalls, 0)
  assert.equal(page.data.draft, '原问题')
  assert.equal(page.data.canSend, true)
  assert.equal(page.data.statusMessage, '登录成功，请再次点击发送按钮继续提问。')
  assert.equal(toastCalls, 0)
})

test('a failed follow-up keeps every previously completed message visible', t => {
  installWx(t)
  const messages = [
    { role: 'user', content: '第一轮问题' },
    {
      role: 'assistant',
      content: '第一轮回答',
      refused: false,
      applicable_scope: '本科生',
      freshness_notice: '以最新文件为准。',
      citations: []
    }
  ]
  const page = createPage(assistantDefinition, {
    messages,
    completedRoundCount: 1,
    activeConversationQuestion: '第一轮问题'
  })

  page.applyAssistantFailure('service-error', '第二轮问题', new Error('private diagnostics'))

  assert.equal(page.data.previousTurns.length, 1)
  assert.equal(page.data.previousTurns[0].question, '第一轮问题')
  assert.equal(page.data.previousTurns[0].answer, '第一轮回答')
  assert.equal(page.data.recoveryTitle, 'AI服务暂时不可用')
})

test('AI response blocks are rebuilt for answers, refusals, restored history and every reset path', async t => {
  const responses = [
    { refused: false, answer: '# 成绩复核\n| 材料 | 时限 |\n| --- | --- |\n| **申请** | `3周` |\n<script>alert(1)</script>', applicable_scope: '', freshness_notice: '', citations: [] },
    { refused: true, reason: 'INSUFFICIENT_EVIDENCE', answer: '暂无**足够依据**', applicable_scope: '', freshness_notice: '', citations: [] },
    { refused: false, answer: '重新生成的回答', applicable_scope: '', freshness_notice: '', citations: [] },
    { refused: false, answer: '编辑后的回答', applicable_scope: '', freshness_notice: '', citations: [] }
  ]
  installWx(t)
  const page = createPage(assistantDefinition, { newTopicMode: true, draft: '成绩复核怎么申请？', canSend: true })
  page._assistantController = createGuideAssistantController({ api: { async askGuideAssistant() { return responses.shift() } } })

  await page.sendQuestion()
  assert.equal(page.data.responseAnswer.includes('成绩复核'), true)
  assert.equal(page.data.responseBlocks.some(block => block.type === 'table'), true)
  assert.equal(page.data.responseBlocks.length > 0, true)
  assert.equal(page.data.responseBlocks.at(-1).runs[0].html.includes('&lt;script&gt;'), true)

  page.inputQuestion({ detail: { value: '没有文件依据的问题' } })
  await page.sendQuestion()
  assert.equal(page.data.previewState, 'refusal')
  assert.equal(page.data.responseBlocks.length > 0, true)
  const conversationKey = page.data.history[0].question
  page.startNewTopic()
  assert.deepEqual(page.data.responseBlocks, [])
  page.selectHistory({ currentTarget: { dataset: { question: conversationKey } } })
  assert.equal(page.data.responseBlocks.length > 0, true)
  assert.equal(page.data.responseAnswer, '暂无**足够依据**')
  assert.match(page.data.responseBlocks[0].runs.map(run => run.html || '').join(''), /<b>足够依据<\/b>/)

  await page.regenerateAnswer()
  assert.equal(page.data.responseAnswer, '重新生成的回答')
  assert.equal(page.data.responseBlocks[0].runs[0].html, '重新生成的回答')
  page.editQuestion()
  page.inputEditedQuestion({ detail: { value: '编辑后的提问' } })
  await page.submitEditedQuestion()
  assert.equal(page.data.responseAnswer, '编辑后的回答')
  assert.equal(page.data.responseBlocks[0].runs[0].html, '编辑后的回答')
  page.applyAssistantFailure('service-error', '断网后重试', new Error('hidden'))
  assert.equal(page.data.responseAnswer, '')
  assert.deepEqual(page.data.responseBlocks, [])
  page.startNewTopic()
  page.deleteHistoryByQuestion(conversationKey)
  assert.deepEqual(page.data.responseBlocks, [])

  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.wxml'), 'utf8')
  assert.match(template, /wx:for="\{\{responseBlocks\}\}"/)
  assert.doesNotMatch(template, />\{\{responseAnswer\}\}</)
})
