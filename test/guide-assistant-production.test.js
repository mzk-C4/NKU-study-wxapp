const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')

test('a real refusal allows a clarifying follow-up with its original context', async t => {
  installWx(t)
  const prior = completedExchange('宿舍问题', '资料不足，请补充校区')
  prior[1].refused = true
  const page = createPage(capturePage(), { previewState: 'refusal', assistantState: 'refusal', messages: prior })
  let input
  page._assistantController = { async submit(value) {
    input = value
    return { accepted: true, state: 'answer', response: { answer: '补充条件后的回答' },
      messages: [...prior, ...completedExchange(value.question, '补充条件后的回答')] }
  } }
  page.inputQuestion({ detail: { value: '我是津南校区的新生' } })
  assert.equal(await page.sendQuestion(), true)
  assert.equal(input.question, '我是津南校区的新生')
  assert.equal(input.messages[1].refused, true)
  assert.equal(page.data.completedRoundCount, 2)
})

test('duplicate send taps during network detection submit only once', async t => {
  let network
  installWx(t, { getNetworkType(options) { network = options } })
  const page = createPage(capturePage(), { draft: '选课怎么操作？' })
  let calls = 0
  page._assistantController = { async submit(input) {
    calls++
    return { accepted: true, state: 'answer', response: { answer: '回答' }, messages: completedExchange(input.question, '回答') }
  } }
  const first = page.sendQuestion()
  assert.equal(await page.sendQuestion(), false)
  network.success({ networkType: 'wifi' })
  assert.equal(await first, true)
  assert.equal(calls, 1)
})

test('starting a new topic ignores the previous in-flight response', async t => {
  installWx(t)
  const page = createPage(capturePage(), { draft: '旧问题' })
  let resolve, cancelled = false
  page._assistantController = {
    cancel() { cancelled = true },
    submit() { return new Promise(done => { resolve = done }) }
  }
  const pending = page.sendQuestion()
  await new Promise(done => setImmediate(done))
  assert.equal(page.data.requestPending, true)
  page.startNewTopic()
  resolve({ accepted: true, state: 'answer', response: { answer: '旧回答' }, messages: completedExchange('旧问题', '旧回答') })
  assert.equal(await pending, false)
  assert.equal(cancelled, true)
  assert.equal(page.data.newTopicMode, true)
  assert.equal(page.data.requestPending, false)
  assert.equal(page.data.responseAnswer, '')
  assert.deepEqual(page.data.messages, [])
})

test('an incoming search question starts a clean draft and keeps previous conversations', async t => {
  const messages = completedExchange('旧问题', '旧回答')
  installWx(t, { getStorageSync(key) {
    if (key !== 'nkustudy_guide_assistant_local_state') return null
    return { updatedAt: Date.now(), lastQuestion: '旧问题', draft: '', history: [
      { question: '旧问题', state: 'answer', updatedAt: Date.now(), messages }
    ] }
  } })
  const page = createPage(capturePage())
  await page.onLoad({ question: encodeURIComponent('新问题') })
  assert.equal(page.data.draft, '新问题')
  assert.equal(page.data.lastQuestion, '')
  assert.deepEqual(page.data.messages, [])
  assert.equal(page.data.history[0].question, '旧问题')
  page.onUnload()
})


function installWx(t, overrides = {}) {
  const previous = global.wx
  global.wx = {
    getAccountInfoSync() { return { miniProgram: { envVersion: 'release' } } },
    getWindowInfo() { return { statusBarHeight: 22 } },
    getStorageSync() { return null },
    setStorageSync() {},
    onNetworkStatusChange() {},
    offNetworkStatusChange() {},
    getNetworkType(options) { options.success({ networkType: 'wifi' }) },
    showToast() {},
    ...overrides
  }
  t.after(() => {
    if (previous === undefined) delete global.wx
    else global.wx = previous
  })
}

function capturePage() {
  const modulePath = require.resolve(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.js'))
  const previousPage = global.Page
  let definition
  global.Page = value => { definition = value }
  delete require.cache[modulePath]
  require(modulePath)
  delete require.cache[modulePath]
  if (previousPage === undefined) delete global.Page
  else global.Page = previousPage
  return definition
}

function createPage(definition, data = {}) {
  const page = { ...definition, data: { ...JSON.parse(JSON.stringify(definition.data)), ...data }, _isUnloaded: false }
  page.setData = function setData(patch, callback) {
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return page
}

function completedExchange(question = '原问题', answer = '原回答') {
  return [
    { role: 'user', content: question },
    { role: 'assistant', content: answer, refused: false, applicable_scope: '本科生', freshness_notice: '', citations: [] }
  ]
}

test('release profile opens a real new topic instead of production building mode', async t => {
  installWx(t)
  const page = createPage(capturePage())

  await page.onLoad({})

  assert.equal(page.data.newTopicMode, true)
  assert.equal(page.data.assistantState, 'idle')
  assert.equal(Object.hasOwn(page.data, 'buildingMode'), false)
})

test('regenerate removes the latest completed round and sends the same question again', async t => {
  installWx(t)
  const definition = capturePage()
  const calls = []
  const page = createPage(definition, {
    lastQuestion: '成绩复核怎么办？',
    activeConversationQuestion: '成绩复核怎么办？',
    messages: completedExchange('成绩复核怎么办？'),
    completedRoundCount: 1,
    roundLabel: '1/10',
    answerMode: true,
    previewMode: false
  })
  page._assistantController = {
    async submit(input) {
      calls.push(input)
      return {
        accepted: true,
        stale: false,
        state: 'answer',
        response: { answer: '重新生成的回答', refused: false, citations: [] },
        messages: completedExchange(input.question, '重新生成的回答')
      }
    }
  }

  assert.equal(await page.regenerateAnswer(), true)
  assert.equal(calls[0].question, '成绩复核怎么办？')
  assert.deepEqual(calls[0].messages, [])
  assert.equal(page.data.responseAnswer, '重新生成的回答')
  assert.equal(page.data.completedRoundCount, 1)
})

test('editing the latest question replaces its round and sends the edited question', async t => {
  installWx(t)
  const definition = capturePage()
  const calls = []
  const page = createPage(definition, {
    lastQuestion: '原问题',
    activeConversationQuestion: '原问题',
    editingQuestion: true,
    editingQuestionValue: '修改后的问题',
    canSendEditedQuestion: true,
    messages: completedExchange(),
    completedRoundCount: 1,
    roundLabel: '1/10',
    answerMode: true,
    previewMode: false,
    previewState: 'answer'
  })
  page._assistantController = {
    async submit(input) {
      calls.push(input)
      return {
        accepted: true,
        stale: false,
        state: 'answer',
        response: { answer: '修改问题后的回答', refused: false, citations: [] },
        messages: completedExchange(input.question, '修改问题后的回答')
      }
    }
  }

  assert.equal(await page.submitEditedQuestion(), true)
  assert.equal(calls[0].question, '修改后的问题')
  assert.deepEqual(calls[0].messages, [])
  assert.equal(page.data.responseAnswer, '修改问题后的回答')
})
