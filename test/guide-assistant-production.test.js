const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')

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
