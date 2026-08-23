const MAX_QUESTION_LENGTH = 1000
const MAX_HISTORY_ROUNDS = 9
const MAX_HISTORY_MESSAGES = MAX_HISTORY_ROUNDS * 2
const MAX_HISTORY_CONTENT_LENGTH = 1000
const MAX_MAJOR_LENGTH = 100

const FRESHNESS_NOTICE = '本回答仅依据当前本地已发布指南；如与后续官方文件冲突，以最新官方文件为准。'
const INSUFFICIENT_EVIDENCE_ANSWER = '当前本地已发布指南没有足够依据回答这个问题。请查看对应官方文件或使用普通指南搜索；我不会根据模型记忆补充校内规则。'
const SOURCE_CONFLICT_ANSWER = '当前收录来源对自修GPA、门数和申请日期存在差异，无法给出统一结论。请以最新正式通知和教务部门确认结果为准。'

const GUIDE_QUERY_HINTS = Object.freeze({
  'course-selection-2026-fall': Object.freeze([
    '选课', '预选', '正选', '补退选', '跨专业选课', '期中退课', '必修课补登', 'w记录', '放出名额'
  ]),
  'grade-review': Object.freeze([
    '成绩复核', '成绩复议', '成绩异议', '课程成绩', '改分', '成绩更改', '开课单位'
  ]),
  'resume-study': Object.freeze([
    '休学', '复学', '续休', '病愈诊断', '校医院', '复学手续'
  ]),
  'micro-major-2026': Object.freeze([
    '微专业'
  ]),
  'ai-coursework': Object.freeze([
    'ai', '人工智能', 'aigc', 'ai工具', 'ai生成', '代写', '生成内容标注'
  ])
})

const STOP_GRAMS = new Set([
  '什么', '怎么', '如何', '是否', '可以', '需要', '应该', '哪个', '哪里', '时候', '办理', '申请', '我的', '学校', '课程'
])

class GuideAssistantError extends Error {
  constructor(code, status, message, details = {}) {
    super(message)
    this.name = 'GuideAssistantError'
    this.code = code
    this.status = status
    this.details = details
  }
}

function invalid(message, details) {
  throw new GuideAssistantError('INVALID_AI_QUESTION', 400, message, details)
}

function unavailable() {
  return new GuideAssistantError('AI_UNAVAILABLE', 503, '本地问答服务暂不可用，请使用普通指南或搜索。')
}

function codePointLength(value) {
  return Array.from(value).length
}

function cleanText(value) {
  return String(value || '').normalize('NFKC').trim()
}

function normalizedSearchText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

function validateQuestion(value) {
  if (typeof value !== 'string') invalid('问题不能为空。', { field: 'question' })
  const question = cleanText(value)
  if (!question) invalid('问题不能为空。', { field: 'question' })
  if (codePointLength(question) > MAX_QUESTION_LENGTH) {
    invalid(`问题不能超过${MAX_QUESTION_LENGTH}字。`, { field: 'question', max_length: MAX_QUESTION_LENGTH })
  }
  return question
}

function validateHistory(value) {
  if (value == null) return []
  if (!Array.isArray(value)) invalid('history必须是已完成问答数组。', { field: 'history' })
  if (value.length > MAX_HISTORY_MESSAGES || value.length % 2 !== 0) {
    invalid(`history最多包含${MAX_HISTORY_ROUNDS}轮完整问答。`, { field: 'history', max_rounds: MAX_HISTORY_ROUNDS })
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      invalid('history条目格式无效。', { field: 'history', index })
    }
    const expectedRole = index % 2 === 0 ? 'user' : 'assistant'
    if (entry.role !== expectedRole) {
      invalid('history必须按user、assistant成对排列。', { field: 'history', index })
    }
    if (typeof entry.content !== 'string') invalid('history内容不能为空。', { field: 'history', index })
    const content = cleanText(entry.content)
    if (!content || codePointLength(content) > MAX_HISTORY_CONTENT_LENGTH) {
      invalid(`history每条内容须为1至${MAX_HISTORY_CONTENT_LENGTH}字。`, { field: 'history', index })
    }
    return Object.freeze({ role: expectedRole, content })
  })
}

function validateProfile(value) {
  if (value == null) return Object.freeze({})
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('profile格式无效。', { field: 'profile' })
  }
  const allowed = new Set(['admission_year', 'major'])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(`profile包含未支持字段：${key}`, { field: `profile.${key}` })
  }
  const profile = {}
  if (value.admission_year != null) {
    if (!Number.isInteger(value.admission_year) || value.admission_year < 1900 || value.admission_year > 2100) {
      invalid('profile.admission_year必须是四位年份。', { field: 'profile.admission_year' })
    }
    profile.admission_year = value.admission_year
  }
  if (value.major != null) {
    if (typeof value.major !== 'string') invalid('profile.major必须是文本。', { field: 'profile.major' })
    const major = cleanText(value.major)
    if (codePointLength(major) > MAX_MAJOR_LENGTH) {
      invalid(`profile.major不能超过${MAX_MAJOR_LENGTH}字。`, { field: 'profile.major' })
    }
    if (major) profile.major = major
  }
  return Object.freeze(profile)
}

function queryNgrams(value) {
  const text = normalizedSearchText(value)
  const grams = new Set()
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= text.length - size; index += 1) {
      const gram = text.slice(index, index + size)
      if (!STOP_GRAMS.has(gram)) grams.add(gram)
    }
  }
  return [...grams]
}

function refusalReason(question) {
  const normalized = normalizedSearchText(question)
  if (normalized.includes('自修')) return 'SOURCE_CONFLICT'
  const excluded = [
    /培养方案/,
    /课程资料|课件|试题|复习资料|学习笔记/,
    /课程评价|教师评价|老师评价|哪个老师|推荐老师/,
    /我的专业.*(?:毕业|学分|课程)|主修专业.*(?:毕业|学分|课程)|毕业要求|毕业学分/
  ]
  return excluded.some(pattern => pattern.test(normalized)) ? 'OUT_OF_SCOPE' : ''
}

function documentText(detail) {
  return [
    detail.title,
    detail.summary,
    ...(detail.sections || []).flatMap(section => [section.title, section.body])
  ].filter(Boolean).join(' ')
}

function buildDocuments(learningCompass) {
  if (!learningCompass || typeof learningCompass.listPublished !== 'function' || typeof learningCompass.getPublished !== 'function') {
    throw new TypeError('learningCompass published projection is required')
  }
  return learningCompass.listPublished().map(summary => {
    const detail = learningCompass.getPublished(summary.id)
    if (!detail) throw new TypeError(`published guide detail is missing: ${summary.id}`)
    return Object.freeze({
      id: detail.id,
      detail,
      normalized_text: normalizedSearchText(documentText(detail)),
      hints: (GUIDE_QUERY_HINTS[detail.id] || []).map(normalizedSearchText)
    })
  })
}

function retrieveGuide(question, documents) {
  const normalizedQuestion = normalizedSearchText(question)
  const grams = queryNgrams(question)
  const gramFrequency = new Map()
  for (const gram of grams) {
    gramFrequency.set(gram, documents.filter(document => document.normalized_text.includes(gram)).length)
  }
  const ranked = documents.map(document => {
    const matchedHints = document.hints.filter(hint => hint && normalizedQuestion.includes(hint))
    let score = matchedHints.reduce((total, hint) => total + 100 + hint.length * 5, 0)
    let matchedGrams = 0
    for (const gram of grams) {
      if (!document.normalized_text.includes(gram)) continue
      matchedGrams += 1
      score += gram.length * (1 + documents.length - (gramFrequency.get(gram) || 1))
    }
    if (normalizedQuestion.length >= 4 && document.normalized_text.includes(normalizedQuestion)) score += 80
    return { document, score, matchedHints: matchedHints.length, matchedGrams }
  }).sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id, 'en'))
  const best = ranked[0]
  if (!best || (!best.matchedHints && (best.matchedGrams < 2 || best.score < 18))) return null
  return best.document.detail
}

function directSection(guide) {
  return (guide.sections || []).find(section => section.title === '直接回答') || guide.sections[0]
}

function reminderSection(guide) {
  return (guide.sections || []).find(section => section.title === '使用提醒')
}

function createDeterministicGuideProvider() {
  return Object.freeze({
    async answer({ guide }) {
      const direct = directSection(guide)
      if (!direct || !cleanText(direct.body)) throw new Error('published guide has no direct answer')
      const reminder = reminderSection(guide)
      return {
        answer: cleanText(direct.body),
        applicable_scope: reminder ? cleanText(reminder.body) : ''
      }
    }
  })
}

function refusal(reason) {
  const conflict = reason === 'SOURCE_CONFLICT'
  return {
    refused: true,
    reason: conflict ? 'SOURCE_CONFLICT' : 'INSUFFICIENT_EVIDENCE',
    guide_id: null,
    category: '',
    answer: conflict ? SOURCE_CONFLICT_ANSWER : INSUFFICIENT_EVIDENCE_ANSWER,
    applicable_scope: '',
    freshness_notice: FRESHNESS_NOTICE,
    citations: []
  }
}

async function providerAnswer(provider, context) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await provider.answer(context)
      if (!result || !cleanText(result.answer)) throw new Error('provider returned an empty answer')
      return result
    } catch (error) {
      lastError = error
    }
  }
  const error = unavailable()
  error.details = { cause: lastError && lastError.name ? lastError.name : 'Error' }
  throw error
}

function createGuideAssistant({ learningCompass, provider = createDeterministicGuideProvider() }) {
  if (!provider || typeof provider.answer !== 'function') throw new TypeError('guide assistant provider.answer is required')
  const documents = buildDocuments(learningCompass)
  return Object.freeze({
    async answer(payload = {}) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid('请求格式无效。')
      const question = validateQuestion(payload.question)
      const history = validateHistory(payload.history)
      const profile = validateProfile(payload.profile)
      const reason = refusalReason(question)
      if (reason) return refusal(reason)
      const guide = retrieveGuide(question, documents)
      if (!guide) return refusal('INSUFFICIENT_EVIDENCE')
      const result = await providerAnswer(provider, { question, history, profile, guide })
      const direct = directSection(guide)
      const excerpt = cleanText(direct ? direct.body : guide.summary).slice(0, 280)
      const citations = (guide.sources || []).map((source, index) => ({
        id: source.id,
        marker: `来源 ${index + 1}`,
        title: source.title,
        url: source.url,
        location_label: source.location_label,
        excerpt
      }))
      if (!citations.length) throw unavailable()
      return {
        refused: false,
        reason: '',
        guide_id: guide.id,
        category: guide.category,
        answer: cleanText(result.answer),
        applicable_scope: cleanText(result.applicable_scope),
        freshness_notice: FRESHNESS_NOTICE,
        citations
      }
    }
  })
}

module.exports = {
  FRESHNESS_NOTICE,
  GuideAssistantError,
  MAX_HISTORY_ROUNDS,
  MAX_QUESTION_LENGTH,
  createDeterministicGuideProvider,
  createGuideAssistant,
  validateHistory,
  validateProfile,
  validateQuestion
}
