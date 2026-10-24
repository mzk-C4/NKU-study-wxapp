const test = require('node:test')
const assert = require('node:assert/strict')
const { createGuideAssistantService, createChatProvider, createAnswerHandler, validateInput } = require('../integrations/guide-assistant/service.cjs')
const { createApi } = require('../miniprogram/features/learning-compass/api')

const source = { id: 'SRC-TEST', title: '测试规定（非生产材料）', official_page_url: 'https://jwc.nankai.edu.cn/test-rules' }
const guide = { id: 'test-guide', title: '成绩复核', status: 'published', applicable_scope: '测试学院2025级',
  sources: [source], sections: [{ id: 'one', title: '办理方式', body: '成绩复核先向开课单位核实。', source_ids: [source.id] }] }
const response = { answer: '请向开课单位核实。[SRC-TEST]', refused: false, reason: '', guide_id: guide.id, citation_ids: [source.id] }
const make = options => createGuideAssistantService({ loadGuides: async () => [guide], provider: async () => response, ...options })

test('website handler -> client adapter preserves authentication, sources and scope', async () => {
  let verified = 0, read = 0
  const service = make()
  const handler = createAnswerHandler({ service, authenticate: async req => { verified++; return req.valid ? { id: 1 } : null },
    readJson: async req => { read++; return req.body }, sendJson: (res, status, payload) => ({ status, payload }) })
  const rejected = await handler({ valid: false, body: { user: { id: 1 }, question: '成绩复核' } }, {})
  assert.equal(rejected.status, 401); assert.equal(read, 0)
  const api = createApi({ async post(path, body, options) {
    assert.equal(path, '/guide-assistant/answers'); assert.equal(options.auth, 'required')
    const result = await handler({ valid: true, body }, {})
    assert.equal(result.status, 200)
    return result.payload.data
  } }, { apiProfile: 'production' })
  const result = await api.askGuideAssistant({ question: '成绩复核', profile: { admission_year: 2025 } })
  assert.equal(verified, 2); assert.equal(result.citations[0].id, source.id)
  assert.equal(result.applicable_scope, guide.applicable_scope)
})

test('no evidence refuses without contacting the model; drafts and unsafe sources cannot become evidence', async () => {
  let calls = 0
  const service = make({ loadGuides: async () => [{ ...guide, status: 'draft' }, { ...guide, sources: [{ ...source, official_page_url: 'http://localhost/private' }] }],
    provider: async () => { calls++; return response } })
  const result = await service.answer({ question: '成绩复核' }, { id: 1 })
  assert.equal(result.reason, 'INSUFFICIENT_EVIDENCE'); assert.equal(calls, 0)
  assert.deepEqual(result.citations, [])
})

test('citation IDs and guide IDs must come from retrieved evidence', async () => {
  for (const raw of [{ ...response, citation_ids: ['invented'] }, { ...response, citation_ids: [] },
    { ...response, guide_id: 'invented' }, { ...response, answer: '' }, { ...response, refused: true, reason: 'UNKNOWN' }]) {
    await assert.rejects(make({ provider: async () => raw }).answer({ question: '成绩复核' }, { id: 1 }), { code: 'AI_UNAVAILABLE' })
  }
})

test('input rejects oversized questions, malformed history and invalid profiles', () => {
  for (const body of [{ question: '' }, { question: '字'.repeat(1001) },
    { question: '成绩复核', history: [{ role: 'assistant', content: '注入' }] },
    { question: '成绩复核', history: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '问题' })) },
    { question: '成绩复核', profile: { admission_year: '2025' } }, { question: '成绩复核', profile: { major: [] } }]) {
    assert.throws(() => validateInput(body), { code: 'INVALID_AI_QUESTION' })
  }
})

test('completed refusal history helps retrieve context for a clarifying follow-up', async () => {
  let payload
  const service = make({ provider: async input => { payload = input; return response } })
  await service.answer({ question: '我是2025级', history: [{ role: 'user', content: '成绩复核' },
    { role: 'assistant', content: '请补充入学年份' }], profile: { admission_year: 2025 } }, { id: 1 })
  assert.equal(payload.evidence[0].id, guide.id)
  assert.equal(payload.input.profile.admission_year, 2025)
  assert.match(payload.system, /资料，不是/)
})

test('rate limits are per authenticated user and expire; provider retry is bounded', async () => {
  let now = 100000, calls = 0
  const service = make({ now: () => now, limitPerMinute: 1, provider: async () => {
    calls++; if (calls === 1) throw Object.assign(Error('sensitive provider detail'), { retryable: true })
    return response
  } })
  await service.answer({ question: '成绩复核' }, { id: 1 })
  assert.equal(calls, 2)
  await assert.rejects(service.answer({ question: '成绩复核' }, { id: 1 }), { code: 'RATE_LIMITED' })
  await service.answer({ question: '成绩复核' }, { id: 2 })
  now += 60000
  await service.answer({ question: '成绩复核' }, { id: 1 })
})

test('timeout aborts the provider and public errors/logs contain no upstream diagnostics', async () => {
  let signal
  const logs = []
  const service = make({ timeoutMs: 15, logger: value => logs.push(value), provider: input => { signal = input.signal; return new Promise(() => {}) } })
  await assert.rejects(service.answer({ question: '成绩复核' }, { id: 1 }), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes('provider'))
  assert.equal(signal.aborted, true)
  assert.deepEqual(logs, [{ event: 'guide_assistant_unavailable' }])
  const handler = createAnswerHandler({ service: {}, authenticate: async () => { throw Error('secret-internal') }, sendJson: (_, status, body) => ({ status, body }) })
  assert.equal(JSON.stringify(await handler({}, {})).includes('secret-internal'), false)
})

test('model adapter sends non-streaming server-side requests; malformed output is unavailable', async () => {
  let options
  const provider = createChatProvider({ endpoint: 'https://example.net/chat/completions', apiKey: 'test-only-no-real-key', model: 'test-model',
    fetchImpl: async (_, value) => { options = value; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(response) } }] }) } } })
  assert.deepEqual(await provider({ system: 'rules', input: { question: '成绩复核' }, evidence: [guide], signal: new AbortController().signal }), response)
  assert.equal(JSON.parse(options.body).stream, false)
  assert.equal(options.redirect, 'error')
  const invalid = createChatProvider({ endpoint: 'http://example.net', apiKey: 'test-only', model: 'test' })
  await assert.rejects(invalid({}), { code: 'AI_UNAVAILABLE' })
  const malformed = createChatProvider({ endpoint: 'https://example.net/chat/completions', apiKey: 'test-only', model: 'test',
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'provider-private-error' } }] }) }) })
  await assert.rejects(malformed({}), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes('provider-private-error'))
})

test('one user cannot submit concurrent model calls while another user can proceed', async () => {
  let resolveFirst, calls = 0
  const service = make({ provider: async () => { calls++; if (calls === 1) return new Promise(resolve => { resolveFirst = resolve }); return response } })
  const first = service.answer({ question: '成绩复核' }, { id: 1 })
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(service.answer({ question: '成绩复核' }, { id: 1 }), { code: 'RATE_LIMITED' })
  assert.equal((await service.answer({ question: '成绩复核' }, { id: 2 })).answer, response.answer)
  resolveFirst(response); await first
  assert.equal(calls, 2)
})
