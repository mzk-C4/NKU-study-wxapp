const test = require('node:test')
const assert = require('node:assert/strict')

const {
  MAX_ROUNDS,
  appendCompletedRound,
  completedRounds,
  createGuideAssistantController
} = require('../miniprogram/features/guide-assistant/controller')

function success(answer = '回答', overrides = {}) {
  return {
    refused: false,
    reason: '',
    answer,
    applicable_scope: '本科生',
    freshness_notice: '以最新官方文件为准。',
    citations: [{
      id: 'SRC-003',
      title: '南开大学本科课程考试与成绩管理规定',
      document_no: '教字〔2024〕2号',
      publisher: '南开大学教务部',
      file_type: 'pdf',
      file_url: 'http://127.0.0.1:3000/__local__/learning-compass/source-files/SRC-003',
      official_page_url: ''
    }],
    ...overrides
  }
}

test('controller keeps generating tied to the real pending promise and blocks duplicate submits', async () => {
  let resolveRequest
  let calls = 0
  const controller = createGuideAssistantController({
    api: {
      askGuideAssistant() {
        calls += 1
        return new Promise(resolve => { resolveRequest = resolve })
      }
    }
  })

  const pending = controller.submit({ question: '成绩复核怎么办？', messages: [], profile: {} })
  assert.equal(controller.isPending(), true)
  assert.deepEqual(await controller.submit({ question: '重复发送', messages: [] }), { accepted: false, reason: 'pending' })
  assert.equal(calls, 1)

  resolveRequest(success())
  const result = await pending
  assert.equal(result.state, 'answer')
  assert.equal(result.rounds, 1)
  assert.equal(completedRounds(result.messages), 1)
  assert.equal(controller.isPending(), false)
})

test('normal answers and all three business refusals count as completed rounds', async () => {
  const results = [
    success('正常回答'),
    success('材料不足', { refused: true, reason: 'INSUFFICIENT_EVIDENCE', citations: [] }),
    success('来源冲突', { refused: true, reason: 'SOURCE_CONFLICT', citations: [] }),
    success('超出范围', { refused: true, reason: 'OUT_OF_SCOPE', citations: [] })
  ]
  let index = 0
  const controller = createGuideAssistantController({
    api: { async askGuideAssistant() { return results[index++] } }
  })
  let messages = []
  for (const question of ['一', '二', '三', '四']) {
    const result = await controller.submit({ question, messages })
    messages = result.messages
  }
  assert.equal(completedRounds(messages), 4)
  assert.deepEqual(messages.filter(item => item.role === 'assistant').map(item => item.refused), [false, true, true, true])
})

test('transport failures do not add rounds and auth recovery never resends the AI request', async () => {
  let aiCalls = 0
  let loginCalls = 0
  const controller = createGuideAssistantController({
    api: {
      async askGuideAssistant() {
        aiCalls += 1
        const error = new Error('safe')
        error.statusCode = 401
        error.code = 'AUTH_REQUIRED'
        throw error
      }
    },
    auth: {
      clearSession() {},
      async ensureLogin() { loginCalls += 1; return { user: { id: 'safe-id' } } }
    }
  })

  const result = await controller.submit({ question: '成绩复核', messages: [] })
  assert.equal(result.state, 'auth-required')
  assert.equal(result.messages, undefined)
  assert.deepEqual(await controller.recoverAuthentication(), { ok: true, manualRetryRequired: true })
  assert.equal(aiCalls, 1)
  assert.equal(loginCalls, 1)
})

test('400, 401, 429, network, 500 and 503 keep distinct stable client states', async () => {
  const cases = [
    [{ statusCode: 400, code: 'INVALID_AI_QUESTION' }, 'invalid-question'],
    [{ statusCode: 401, code: 'AUTH_REQUIRED' }, 'auth-required'],
    [{ statusCode: 429, code: 'RATE_LIMITED' }, 'rate-limited'],
    [{ statusCode: 0, code: 'NETWORK_ERROR', kind: 'network_error' }, 'network-error'],
    [{ statusCode: 500, code: 'INTERNAL_ERROR' }, 'service-error'],
    [{ statusCode: 503, code: 'AI_UNAVAILABLE' }, 'service-error']
  ]
  for (const [shape, expected] of cases) {
    const controller = createGuideAssistantController({
      api: {
        async askGuideAssistant() {
          const error = Object.assign(new Error('safe'), shape)
          throw error
        }
      },
      auth: { clearSession() {} }
    })
    const result = await controller.submit({ question: '问题', messages: [] })
    assert.equal(result.state, expected)
    assert.equal(result.messages, undefined)
  }
})

test('the tenth round completes while an eleventh round is stopped client-side', async () => {
  let messages = []
  for (let round = 1; round < MAX_ROUNDS; round += 1) {
    messages = appendCompletedRound(messages, `问题${round}`, success(`回答${round}`))
  }
  let calls = 0
  const controller = createGuideAssistantController({
    api: { async askGuideAssistant() { calls += 1; return success('第十轮回答') } }
  })

  const tenth = await controller.submit({ question: '第十轮问题', messages })
  assert.equal(tenth.rounds, 10)
  const eleventh = await controller.submit({ question: '第十一轮问题', messages: tenth.messages })
  assert.deepEqual(eleventh, { accepted: false, state: 'round-limit' })
  assert.equal(calls, 1)
})

test('cancel makes an overdue response stale and prevents post-unload state use', async () => {
  let resolveRequest
  const controller = createGuideAssistantController({
    api: { askGuideAssistant() { return new Promise(resolve => { resolveRequest = resolve }) } }
  })
  const pending = controller.submit({ question: '问题', messages: [] })
  controller.cancel()
  resolveRequest(success())
  assert.deepEqual(await pending, { accepted: true, stale: true })
})
