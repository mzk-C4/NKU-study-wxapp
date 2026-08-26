const MAX_ROUNDS = 10
const MAX_QUESTION_LENGTH = 1000
const REFUSAL_REASONS = new Set(['INSUFFICIENT_EVIDENCE', 'SOURCE_CONFLICT', 'OUT_OF_SCOPE'])

function normalizeText(value, maximum = MAX_QUESTION_LENGTH) {
  const source = String(value == null ? '' : value)
  let text = source
  try {
    text = source.normalize('NFKC')
  } catch (_) {
    // Older runtimes may not expose String#normalize; trim still gives a safe fallback.
  }
  return Array.from(text.trim()).slice(0, maximum).join('')
}

function normalizeCitation(value) {
  const raw = value && typeof value === 'object' ? value : {}
  return {
    id: normalizeText(raw.id, 200),
    title: normalizeText(raw.title, 300),
    document_no: normalizeText(raw.document_no, 120),
    publisher: normalizeText(raw.publisher, 200),
    file_type: normalizeText(raw.file_type, 12).toLowerCase(),
    file_url: normalizeText(raw.file_url, 2000),
    official_page_url: normalizeText(raw.official_page_url, 2000)
  }
}

function normalizeAssistantMessage(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const role = raw.role === 'assistant' ? 'assistant' : raw.role === 'user' ? 'user' : ''
  const content = normalizeText(raw.content)
  if (!role || !content) return null
  if (role === 'user') return { role, content }
  const reason = normalizeText(raw.reason, 80)
  return {
    role,
    content,
    refused: raw.refused === true,
    reason: REFUSAL_REASONS.has(reason) ? reason : '',
    applicable_scope: normalizeText(raw.applicable_scope, 500),
    freshness_notice: normalizeText(raw.freshness_notice, 500),
    citations: Array.isArray(raw.citations) ? raw.citations.map(normalizeCitation).filter(item => item.id && item.title) : []
  }
}

function normalizeCompletedMessages(value) {
  if (!Array.isArray(value)) return []
  const messages = value.map(normalizeAssistantMessage).filter(Boolean)
  const completed = []
  for (let index = 0; index + 1 < messages.length && completed.length < MAX_ROUNDS * 2; index += 2) {
    if (messages[index].role !== 'user' || messages[index + 1].role !== 'assistant') break
    completed.push(messages[index], messages[index + 1])
  }
  return completed
}

function completedRounds(messages) {
  return Math.floor(normalizeCompletedMessages(messages).length / 2)
}

function buildHistory(messages) {
  return normalizeCompletedMessages(messages).map(message => ({ role: message.role, content: message.content }))
}

function appendCompletedRound(messages, question, response) {
  const history = normalizeCompletedMessages(messages)
  if (history.length >= MAX_ROUNDS * 2) return history
  const normalizedQuestion = normalizeText(question)
  const raw = response && typeof response === 'object' ? response : {}
  const answer = normalizeText(raw.answer)
  if (!normalizedQuestion || !answer) return history
  const reason = normalizeText(raw.reason, 80)
  return [
    ...history,
    { role: 'user', content: normalizedQuestion },
    {
      role: 'assistant',
      content: answer,
      refused: raw.refused === true,
      reason: REFUSAL_REASONS.has(reason) ? reason : '',
      applicable_scope: normalizeText(raw.applicable_scope, 500),
      freshness_notice: normalizeText(raw.freshness_notice, 500),
      citations: Array.isArray(raw.citations) ? raw.citations.map(normalizeCitation).filter(item => item.id && item.title) : []
    }
  ]
}

function lastCompletedExchange(messages) {
  const normalized = normalizeCompletedMessages(messages)
  if (normalized.length < 2) return null
  return { question: normalized.at(-2).content, response: normalized.at(-1) }
}

function classifyError(error) {
  const code = normalizeText(error && error.code, 80)
  if (code === 'INVALID_AI_QUESTION' || (error && error.statusCode === 400)) return 'invalid-question'
  if (code === 'AUTH_REQUIRED' || (error && error.statusCode === 401)) return 'auth-required'
  if (code === 'RATE_LIMITED' || (error && error.statusCode === 429)) return 'rate-limited'
  if (code === 'NETWORK_ERROR' || (error && error.kind === 'network_error')) return 'network-error'
  if (code === 'AI_UNAVAILABLE' || (error && error.statusCode === 503)) return 'service-error'
  return 'service-error'
}

function createGuideAssistantController(options = {}) {
  const api = options.api
  const auth = options.auth
  let requestId = 0
  let pending = false
  let destroyed = false

  return {
    isPending() { return pending },
    cancel() {
      destroyed = true
      pending = false
      requestId += 1
    },
    async submit(input = {}) {
      if (destroyed || pending) return { accepted: false, reason: pending ? 'pending' : 'destroyed' }
      const question = normalizeText(input.question)
      const messages = normalizeCompletedMessages(input.messages)
      if (!question) return { accepted: false, state: 'invalid-question', message: '请输入问题后再发送。' }
      if (completedRounds(messages) >= MAX_ROUNDS) return { accepted: false, state: 'round-limit' }
      if (!api || typeof api.askGuideAssistant !== 'function') return { accepted: false, state: 'service-error' }

      const currentRequestId = requestId + 1
      requestId = currentRequestId
      pending = true
      try {
        const response = await api.askGuideAssistant({
          question,
          history: buildHistory(messages),
          profile: input.profile
        })
        if (destroyed || requestId !== currentRequestId) return { accepted: true, stale: true }
        const nextMessages = appendCompletedRound(messages, question, response)
        return {
          accepted: true,
          stale: false,
          state: response.refused ? 'refusal' : 'answer',
          response,
          messages: nextMessages,
          rounds: completedRounds(nextMessages)
        }
      } catch (error) {
        if (destroyed || requestId !== currentRequestId) return { accepted: true, stale: true }
        const state = classifyError(error)
        if (state === 'auth-required' && auth && typeof auth.clearSession === 'function') auth.clearSession()
        return { accepted: true, stale: false, state, error }
      } finally {
        if (requestId === currentRequestId) pending = false
      }
    },
    async recoverAuthentication() {
      if (destroyed || !auth || typeof auth.ensureLogin !== 'function') return { ok: false }
      try {
        await auth.ensureLogin()
        return destroyed ? { ok: false } : { ok: true, manualRetryRequired: true }
      } catch (error) {
        return { ok: false, error }
      }
    }
  }
}

module.exports = {
  MAX_ROUNDS,
  MAX_QUESTION_LENGTH,
  REFUSAL_REASONS,
  normalizeText,
  normalizeCitation,
  normalizeCompletedMessages,
  completedRounds,
  buildHistory,
  appendCompletedRound,
  lastCompletedExchange,
  classifyError,
  createGuideAssistantController
}
