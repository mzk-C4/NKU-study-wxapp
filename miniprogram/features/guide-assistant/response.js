// Public business outcome is separate from rendered text. Keep this boundary
// for old servers and restored local conversations as well as fresh replies.
const REASONS = new Set(['INSUFFICIENT_EVIDENCE', 'SOURCE_CONFLICT', 'OUT_OF_SCOPE'])
const KINDS = new Set(['guide_answer', 'conversation_summary', 'assistant_info'])
const REFUSAL_COPY = {
  INSUFFICIENT_EVIDENCE: '现有指南没有足够依据回答这个问题。你可以补充目标学院、年份等条件，或查看普通指南与原文。',
  SOURCE_CONFLICT: '现有来源存在差异，暂时无法给出统一结论，请向负责单位确认。',
  OUT_OF_SCOPE: '这个问题超出了当前指南的回答范围。'
}

function answerOutcome(value, depth = 0, detectRefusal = true) {
  const text = typeof value === 'string' ? value.trim() : ''
  const marker = /REFUSE_([A-Z_]+)/i.exec(text)
  if (marker) return { refused: true, reason: /CONFLICT/i.test(marker[1]) ? 'SOURCE_CONFLICT' : /OUT_OF_SCOPE/i.test(marker[1]) ? 'OUT_OF_SCOPE' : 'INSUFFICIENT_EVIDENCE' }
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  if (/^[{[]/.test(json)) {
    try {
      const raw = JSON.parse(json)
      if (depth >= 2 || !raw || Array.isArray(raw) || typeof raw.refused !== 'boolean') return { answer: '' }
      if (raw.refused) return { refused: true, reason: REASONS.has(raw.reason) ? raw.reason : 'INSUFFICIENT_EVIDENCE' }
      if (raw.reason || typeof raw.answer !== 'string') return { answer: '' }
      return answerOutcome(raw.answer, depth + 1, detectRefusal)
    } catch (_) { return { answer: '' } }
  }
  if (detectRefusal && /没有足够依据|资料不足.{0,12}(无法|不能)回答|无法依据.{0,12}(回答|结论)|不敢瞎说|(?:没有|缺少)(?:相关|足够|可靠)?(?:资料|依据|信息)[\s\S]{0,20}(?:不能|无法)(?:回答|作答)|(?:资料库|知识库).{0,10}(?:没有|未收录|找不到)/.test(text)) return { refused: true, reason: 'INSUFFICIENT_EVIDENCE' }
  return { answer: text }
}

function normalizeResponse(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const kind = KINDS.has(raw.answer_kind) ? raw.answer_kind : 'guide_answer'
  // A server-generated recap may quote a previous refusal without refusing
  // the recap itself. Its kind cannot be supplied by the model provider.
  const outcome = answerOutcome(raw.answer, 0, kind === 'guide_answer')
  const refused = raw.refused === true || outcome.refused === true
  const reason = outcome.reason || (REASONS.has(raw.reason) ? raw.reason : '')
  return {
    ...raw,
    answer: refused && reason ? REFUSAL_COPY[reason] : outcome.answer || '',
    refused,
    reason: refused ? reason : '',
    answer_kind: refused ? 'guide_answer' : kind,
    applicable_scope: refused ? '' : raw.applicable_scope || '',
    citations: refused ? [] : Array.isArray(raw.citations) ? raw.citations : [],
    follow_up_questions: refused || kind !== 'guide_answer' ? [] : [...new Set((Array.isArray(raw.follow_up_questions) ? raw.follow_up_questions : [])
      .filter(item => typeof item === 'string' && item.trim() && item.length <= 160 && !/REFUSE_/i.test(item)).map(item => item.trim()))].slice(0, 3)
  }
}

module.exports = { normalizeResponse }
