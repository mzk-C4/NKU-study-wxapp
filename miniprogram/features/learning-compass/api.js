const request = require('../../utils/request')
const config = require('../../config')

const CATEGORY_DEFINITIONS = Object.freeze([
  Object.freeze({ value: 'course-study', label: '选课与修读', order: 1 }),
  Object.freeze({ value: 'exam-grade', label: '考试与成绩', order: 2 }),
  Object.freeze({ value: 'student-status-graduation', label: '学籍与毕业', order: 3 }),
  Object.freeze({ value: 'academic-development', label: '学业拓展', order: 4 }),
  Object.freeze({ value: 'rules-rights', label: '规范与权益', order: 5 })
])
const CATEGORY_BY_VALUE = Object.freeze(Object.fromEntries(CATEGORY_DEFINITIONS.map(item => [item.value, item])))
const CATEGORY_BY_LABEL = Object.freeze(Object.fromEntries(CATEGORY_DEFINITIONS.map(item => [item.label, item])))
const REFUSAL_REASONS = new Set(['INSUFFICIENT_EVIDENCE', 'SOURCE_CONFLICT', 'OUT_OF_SCOPE'])
const LOCAL_SOURCE_PREFIX = '/__local__/learning-compass/source-files/'

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function texts(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : [] }
function count(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}
function positive(value, fallback, maximum) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) return fallback
  return Math.min(number, maximum)
}
function encode(value) { return encodeURIComponent(String(value == null ? '' : value)) }

function unicode(value, maximum) {
  if (typeof value !== 'string') return ''
  let normalized = value
  try { normalized = value.normalize('NFKC') } catch (_) {}
  return Array.from(normalized.trim()).slice(0, maximum).join('')
}

function publicHttps(value) {
  const url = text(value)
  if (!url || /[\s\\]/.test(url)) return ''
  const match = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url)
  if (!match || match[1].includes('@')) return ''
  return url
}

function guideFileUrl(value, isReference) {
  const url = text(value)
  if (!url || /[\s\\]/.test(url)) return ''
  if (isReference) {
    if (/^http:\/\/127\.0\.0\.1:3000\/__local__\/learning-compass\/source-files\/[A-Za-z0-9-]+$/.test(url)) return url
    if (new RegExp(`^${LOCAL_SOURCE_PREFIX}[A-Za-z0-9-]+$`).test(url)) return `http://127.0.0.1:3000${url}`
    return ''
  }
  return /^https:\/\/resources\.nkustudy\.top\/guide-sources\//.test(url) ? url : ''
}

function category(value, label) {
  const key = text(value)
  const definition = CATEGORY_BY_VALUE[key] || CATEGORY_BY_LABEL[key]
  if (definition) return definition
  return { value: '', label: text(label) }
}

function buildGuideQuery(input = {}) {
  const query = { page: positive(input.page, 1, 1000000), page_size: positive(input.page_size, 20, 100) }
  const definition = CATEGORY_BY_LABEL[text(input.category)] || CATEGORY_BY_VALUE[text(input.category)]
  if (definition) query.category = definition.value
  return query
}

function mapSummary(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const mappedCategory = category(raw.category, raw.category_label)
  return {
    id: text(raw.id), title: text(raw.title), summary: text(raw.summary),
    category: mappedCategory.label, category_value: mappedCategory.value, category_label: mappedCategory.label,
    updated_at: text(raw.updated_at), applicable_scope: text(raw.applicable_scope),
    time_status: text(raw.time_status), content_type: text(raw.content_type) || 'standard',
    source_count: count(raw.source_count), read_minutes: count(raw.read_minutes),
    related_course_ids: texts(raw.related_course_ids)
  }
}

function mapList(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const items = Array.isArray(raw.items) ? raw.items.map(mapSummary).filter(item => item.id && item.title) : []
  const rawCategories = raw.facets && Array.isArray(raw.facets.categories) ? raw.facets.categories : []
  const options = rawCategories.map((item, index) => {
    const source = item && typeof item === 'object' ? item : { value: item }
    const mapped = category(source.value, source.label)
    return mapped.value ? { value: mapped.value, label: mapped.label, count: count(source.count), order: positive(source.order, index + 1, 100) } : null
  }).filter(Boolean)
  return {
    items,
    total: count(raw.total == null ? items.length : raw.total),
    page: positive(raw.page, 1, 1000000),
    page_size: positive(raw.page_size, items.length || 20, 100),
    facets: { categories: options.map(item => item.label), category_options: options },
    data_updated_at: text(raw.data_updated_at)
  }
}

function mapSection(value, index) {
  const raw = value && typeof value === 'object' ? value : {}
  const sourceIds = texts(raw.source_ids || raw.citation_ids)
  return {
    id: text(raw.id) || `section-${index + 1}`,
    title: text(raw.title), body_format: text(raw.body_format) || 'markdown', body: text(raw.body),
    source_ids: sourceIds, citation_ids: sourceIds
  }
}

function mapSource(value, isReference) {
  const raw = value && typeof value === 'object' ? value : {}
  const fileUrl = guideFileUrl(raw.file_url, isReference)
  const officialPageUrl = publicHttps(raw.official_page_url || (!raw.file_url ? raw.url : ''))
  return {
    id: text(raw.id), title: text(raw.title), document_no: text(raw.document_no), publisher: text(raw.publisher),
    published_at: text(raw.published_at), file_type: text(raw.file_type).toLowerCase(), file_name: text(raw.file_name),
    file_url: fileUrl, official_page_url: officialPageUrl, url: fileUrl || officialPageUrl,
    location_label: text(raw.location_label)
  }
}

function mapVariantSummary(value) {
  const raw = value && typeof value === 'object' ? value : {}
  return { id: text(raw.id), title: text(raw.title), order: count(raw.order), source_count: count(raw.source_count) }
}

function mapDetail(value, isReference) {
  const raw = value && typeof value === 'object' ? value : {}
  const mappedCategory = category(raw.category, raw.category_label)
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map(mapSection).filter(item => item.title || item.body)
    : Array.isArray(raw.steps) ? raw.steps.map(mapSection).filter(item => item.title || item.body) : []
  const sources = Array.isArray(raw.sources) ? raw.sources.map(item => mapSource(item, isReference)).filter(item => item.id || item.title) : []
  return {
    id: text(raw.id), title: text(raw.title), summary: text(raw.summary),
    category: mappedCategory.label, category_value: mappedCategory.value, category_label: mappedCategory.label,
    updated_at: text(raw.updated_at), read_minutes: count(raw.read_minutes), applicable_scope: text(raw.applicable_scope),
    time_status: text(raw.time_status), content_type: text(raw.content_type) || 'standard', sections,
    steps: sections.map(item => ({ title: item.title, body: item.body })), sources,
    variants: Array.isArray(raw.variants) ? raw.variants.map(mapVariantSummary).filter(item => item.id && item.title) : [],
    related_courses: Array.isArray(raw.related_courses) ? raw.related_courses.map(item => ({ id: text(item && item.id), name: text(item && item.name) })).filter(item => item.id && item.name) : [],
    source_title: text(raw.source_title) || (sources[0] && sources[0].title) || '',
    source_url: guideFileUrl(raw.source_url, isReference) || publicHttps(raw.source_url) || (sources[0] && sources[0].url) || '',
    correction_url: publicHttps(raw.correction_url)
  }
}

function mapVariant(value, isReference) {
  const raw = value && typeof value === 'object' ? value : {}
  const variant = raw.variant && typeof raw.variant === 'object' ? raw.variant : {}
  return {
    guide_id: text(raw.guide_id),
    variant: {
      id: text(variant.id), title: text(variant.title), order: count(variant.order),
      sections: Array.isArray(variant.sections) ? variant.sections.map(mapSection).filter(item => item.title || item.body) : [],
      sources: Array.isArray(variant.sources) ? variant.sources.map(item => mapSource(item, isReference)).filter(item => item.id || item.title) : []
    }
  }
}

function buildAssistantRequest(input = {}) {
  const admissionYearText = unicode(input.profile && input.profile.admission_year, 4)
  const admissionYear = /^\d{4}$/.test(admissionYearText) ? Number(admissionYearText) : 0
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {}
  return {
    question: unicode(input.question, 1000),
    history: Array.isArray(input.history) ? input.history.slice(0, 18).map(item => ({
      role: item && item.role === 'assistant' ? 'assistant' : 'user',
      content: unicode(item && item.content, 1000)
    })).filter(item => item.content) : [],
    profile: {
      ...(admissionYear ? { admission_year: admissionYear } : {}),
      ...(unicode(profile.major, 100) ? { major: unicode(profile.major, 100) } : {})
    }
  }
}

function mapAssistant(value, isReference) {
  const raw = value && typeof value === 'object' ? value : {}
  const refused = raw.refused === true
  const reason = text(raw.reason)
  return {
    refused,
    reason: refused && REFUSAL_REASONS.has(reason) ? reason : '',
    guide_id: text(raw.guide_id), category: text(raw.category), answer: text(raw.answer),
    applicable_scope: text(raw.applicable_scope), freshness_notice: text(raw.freshness_notice),
    citations: Array.isArray(raw.citations) ? raw.citations.map(item => mapSource(item, isReference)).filter(item => item.id && item.title) : []
  }
}

function createApi(client = request, options = {}) {
  const isReference = (options.apiProfile || config.apiProfile) === 'reference'
  return {
    getGuides(input) { return client.get('/guides', buildGuideQuery(input)).then(mapList) },
    getGuide(id) { return client.get(`/guides/${encode(id)}`).then(value => mapDetail(value, isReference)) },
    getGuideVariant(guideId, variantId) {
      return client.get(`/guides/${encode(guideId)}/variants/${encode(variantId)}`).then(value => mapVariant(value, isReference))
    },
    askGuideAssistant(input) {
      return client.post('/guide-assistant/answers', buildAssistantRequest(input), {
        timeout: 30000, auth: 'required'
      }).then(value => mapAssistant(value, isReference))
    },
    validateGuideFileUrl(value) { return guideFileUrl(value, isReference) },
    isAllowedGuideFileUrl(value) { return Boolean(guideFileUrl(value, isReference)) },
    validatePublicHttpsUrl: publicHttps,
    isAllowedPublicHttpsUrl(value) { return Boolean(publicHttps(value)) }
  }
}

const api = createApi()

module.exports = Object.assign(api, {
  CATEGORY_DEFINITIONS,
  CATEGORY_BY_VALUE,
  CATEGORY_BY_LABEL,
  buildGuideQuery,
  mapList,
  mapDetail,
  mapVariant,
  mapAssistant,
  buildAssistantRequest,
  createApi
})
