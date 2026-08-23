const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const LEARNING_COMPASS_CATEGORIES = Object.freeze([
  '选课与修读',
  '考试与成绩',
  '学籍与毕业',
  '学业拓展',
  '规范与权益'
])
const LEARNING_COMPASS_STATUSES = Object.freeze(['draft', 'review', 'published'])

class LearningCompassValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'LearningCompassValidationError'
    this.code = code
    this.details = details
  }
}

function fail(code, message, details) {
  throw new LearningCompassValidationError(code, message, details)
}

function stripCode(value) {
  const text = String(value || '').trim()
  return text.startsWith('`') && text.endsWith('`') ? text.slice(1, -1) : text
}

function splitTableRow(line) {
  return String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(item => item.trim())
}

function officialUrl(cell, sourceId) {
  const match = String(cell || '').match(/\[[^\]]+\]\(([^)]+)\)/)
  if (!match) fail('SOURCE_URL_MISSING', `${sourceId} 缺少官方链接`, { source_id: sourceId })
  let parsed
  try {
    parsed = new URL(match[1])
  } catch {
    fail('SOURCE_URL_INVALID', `${sourceId} 官方链接无效`, { source_id: sourceId })
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    fail('SOURCE_URL_UNSAFE', `${sourceId} 官方链接必须是无账号信息的 HTTPS 地址`, { source_id: sourceId })
  }
  return parsed.toString()
}

function parseSourceManifest(markdown) {
  const sources = new Map()
  for (const line of String(markdown || '').split(/\r?\n/)) {
    if (!/^\|\s*`SRC-\d+`\s*\|/.test(line)) continue
    const cells = splitTableRow(line)
    const id = stripCode(cells[0])
    if (sources.has(id)) fail('SOURCE_ID_DUPLICATE', `来源 ID 重复：${id}`, { source_id: id })
    const title = String(cells[1] || '').trim()
    if (!title) fail('SOURCE_TITLE_MISSING', `${id} 缺少标题`, { source_id: id })
    sources.set(id, Object.freeze({ id, title, url: officialUrl(cells[7], id) }))
  }
  if (!sources.size) fail('SOURCE_MANIFEST_EMPTY', 'SOURCE_MANIFEST 未解析到来源')
  return sources
}

function parseFrontMatter(markdown, filename) {
  const input = String(markdown || '').replace(/^\uFEFF/, '')
  const match = input.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) fail('GUIDE_FRONTMATTER_MISSING', `${filename} 缺少最小头部`, { filename })
  const metadata = {}
  let currentArray = ''
  for (const rawLine of match[1].split(/\r?\n/)) {
    const arrayItem = rawLine.match(/^\s+-\s+(.+)$/)
    if (arrayItem && currentArray) {
      metadata[currentArray].push(arrayItem[1].trim())
      continue
    }
    const field = rawLine.match(/^([a-z_]+):\s*(.*)$/)
    if (!field) fail('GUIDE_FRONTMATTER_INVALID', `${filename} 包含无法解析的头部行`, { filename, line: rawLine })
    const [, key, rawValue] = field
    if (key === 'source_ids') {
      metadata[key] = []
      currentArray = key
    } else {
      metadata[key] = rawValue.trim()
      currentArray = ''
    }
  }
  return { metadata, body: match[2] }
}

function sectionId(guideId, title) {
  const digest = crypto.createHash('sha256').update(`${guideId}\0${title}`).digest('hex').slice(0, 12)
  return `section-${digest}`
}

function parseCitations(body, filename) {
  const citations = []
  const seen = new Set()
  const pattern = /\[(SRC-\d+)\s*[｜|]\s*([^\]]+)\]/g
  let match
  while ((match = pattern.exec(body))) {
    const sourceId = match[1]
    const locationLabel = match[2].trim()
    const key = `${sourceId}\0${locationLabel}`
    if (!seen.has(key)) {
      citations.push({ id: sourceId, source_id: sourceId, location_label: locationLabel })
      seen.add(key)
    }
  }
  if (!citations.length) fail('GUIDE_CITATION_MISSING', `${filename} 缺少原文依据`, { filename })
  return citations
}

function parseSections(body, guideId, citations, filename) {
  const lines = String(body || '').split(/\r?\n/)
  const rawSections = []
  let current = null
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      if (current) rawSections.push(current)
      current = { title: heading[1].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) rawSections.push(current)
  const publicSections = rawSections.filter(section => section.title !== '原文依据')
  if (!publicSections.length) fail('GUIDE_SECTION_MISSING', `${filename} 缺少正文区段`, { filename })
  const ids = new Set()
  return publicSections.map(section => {
    const id = sectionId(guideId, section.title)
    if (ids.has(id)) fail('GUIDE_SECTION_ID_DUPLICATE', `${filename} 章节 ID 重复`, { filename, section_id: id })
    ids.add(id)
    return {
      id,
      title: section.title,
      body: section.lines.join('\n').trim(),
      citation_ids: citations.map(citation => citation.id)
    }
  })
}

function plainText(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseGuideMarkdown(markdown, filename = 'guide.md') {
  const { metadata, body } = parseFrontMatter(markdown, filename)
  const allowedKeys = new Set(['id', 'title', 'category', 'status', 'source_ids'])
  for (const key of Object.keys(metadata)) {
    if (!allowedKeys.has(key)) fail('GUIDE_METADATA_UNEXPECTED', `${filename} 包含未允许的头部字段：${key}`, { filename, field: key })
  }
  for (const key of ['id', 'title', 'category', 'status', 'source_ids']) {
    if (metadata[key] == null || (Array.isArray(metadata[key]) ? !metadata[key].length : !metadata[key])) {
      fail('GUIDE_METADATA_MISSING', `${filename} 缺少字段：${key}`, { filename, field: key })
    }
  }
  const citations = parseCitations(body, filename)
  const sections = parseSections(body, metadata.id, citations, filename)
  const directAnswer = sections.find(section => section.title === '直接回答')
  const summary = plainText(directAnswer ? directAnswer.body : sections[0].body)
  return {
    id: metadata.id,
    title: metadata.title,
    category: metadata.category,
    status: metadata.status,
    source_ids: metadata.source_ids,
    summary,
    read_minutes: Math.max(1, Math.ceil(plainText(body).length / 600)),
    sections,
    citations
  }
}

function validateGuide(guide, sources, filename) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(guide.id)) fail('GUIDE_ID_INVALID', `${filename} 的 ID 无效`, { filename, guide_id: guide.id })
  if (!LEARNING_COMPASS_CATEGORIES.includes(guide.category)) fail('GUIDE_CATEGORY_INVALID', `${filename} 的一级分类无效`, { filename, category: guide.category })
  if (!LEARNING_COMPASS_STATUSES.includes(guide.status)) fail('GUIDE_STATUS_INVALID', `${filename} 的状态无效`, { filename, status: guide.status })
  if (!Array.isArray(guide.source_ids) || !guide.source_ids.length) fail('GUIDE_SOURCE_MISSING', `${filename} 缺少来源`, { filename })
  if (!Array.isArray(guide.sections) || !guide.sections.length) fail('GUIDE_SECTION_MISSING', `${filename} 缺少正文区段`, { filename })
  if (!Array.isArray(guide.citations) || !guide.citations.length) fail('GUIDE_CITATION_MISSING', `${filename} 缺少原文依据`, { filename })
  const declaredSources = new Set(guide.source_ids)
  for (const sourceId of declaredSources) {
    if (!sources.has(sourceId)) fail('GUIDE_SOURCE_UNKNOWN', `${filename} 引用了未知来源：${sourceId}`, { filename, source_id: sourceId })
  }
  for (const citation of guide.citations) {
    if (!declaredSources.has(citation.source_id)) fail('GUIDE_CITATION_UNDECLARED', `${filename} 的引用未在 source_ids 声明`, { filename, source_id: citation.source_id })
    if (!citation.location_label) fail('GUIDE_CITATION_LOCATION_MISSING', `${filename} 的引用缺少定位`, { filename, source_id: citation.source_id })
  }
  const sectionIds = new Set()
  for (const section of guide.sections) {
    if (!section.id || sectionIds.has(section.id)) fail('GUIDE_SECTION_ID_DUPLICATE', `${filename} 章节 ID 缺失或重复`, { filename, section_id: section.id || '' })
    sectionIds.add(section.id)
  }
  for (const sourceId of declaredSources) {
    if (!guide.citations.some(citation => citation.source_id === sourceId)) fail('GUIDE_SOURCE_LOCATION_MISSING', `${filename} 的来源缺少章节/条款定位`, { filename, source_id: sourceId })
  }
  if (guide.status === 'published' && !guide.citations.length) fail('PUBLISHED_GUIDE_CITATION_MISSING', `${filename} 的已发布内容没有引用`, { filename })
}

function validateKnowledgeBase(knowledgeBase) {
  if (!knowledgeBase || !Array.isArray(knowledgeBase.sources) || !Array.isArray(knowledgeBase.guides)) {
    fail('KNOWLEDGE_BASE_INVALID', '学习指南针生成数据结构无效')
  }
  const sourceMap = new Map()
  for (const source of knowledgeBase.sources) {
    if (!source || !source.id || sourceMap.has(source.id)) fail('SOURCE_ID_DUPLICATE', `生成数据来源 ID 缺失或重复：${source && source.id ? source.id : ''}`)
    if (!source.title) fail('SOURCE_TITLE_MISSING', `${source.id} 缺少标题`, { source_id: source.id })
    let parsed
    try {
      parsed = new URL(source.url)
    } catch {
      fail('SOURCE_URL_INVALID', `${source.id} 官方链接无效`, { source_id: source.id })
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('SOURCE_URL_UNSAFE', `${source.id} 官方链接必须是无账号信息的 HTTPS 地址`, { source_id: source.id })
    sourceMap.set(source.id, source)
  }
  const guideIds = new Set()
  for (const guide of knowledgeBase.guides) {
    if (guideIds.has(guide.id)) fail('GUIDE_ID_DUPLICATE', `生成数据指南 ID 重复：${guide.id}`, { guide_id: guide.id })
    guideIds.add(guide.id)
    validateGuide(guide, sourceMap, guide.id || 'generated-guide')
  }
  return sourceMap
}

function buildLearningCompass({ manifestPath, guidesDir }) {
  const manifestMarkdown = fs.readFileSync(path.resolve(manifestPath), 'utf8')
  const sources = parseSourceManifest(manifestMarkdown)
  const filenames = fs.readdirSync(path.resolve(guidesDir), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'))
  const guides = []
  const guideIds = new Set()
  for (const filename of filenames) {
    const markdown = fs.readFileSync(path.join(path.resolve(guidesDir), filename), 'utf8')
    const guide = parseGuideMarkdown(markdown, filename)
    if (guideIds.has(guide.id)) fail('GUIDE_ID_DUPLICATE', `指南 ID 重复：${guide.id}`, { guide_id: guide.id })
    guideIds.add(guide.id)
    validateGuide(guide, sources, filename)
    guides.push(guide)
  }
  if (!guides.length) fail('GUIDES_EMPTY', '未解析到指南草稿')
  const usedSourceIds = [...new Set(guides.flatMap(guide => guide.source_ids))].sort()
  const usedSources = usedSourceIds.map(id => sources.get(id))
  const payload = {
    generated: true,
    categories: [...LEARNING_COMPASS_CATEGORIES],
    sources: usedSources,
    guides
  }
  const version = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
  return { version, ...payload }
}

function publicSource(source, locationLabel) {
  return { id: source.id, title: source.title, url: source.url, location_label: locationLabel }
}

function publicGuideDetail(guide, sourceMap) {
  const locationBySource = new Map(guide.citations.map(citation => [citation.source_id, citation.location_label]))
  const sources = guide.source_ids.map(sourceId => publicSource(sourceMap.get(sourceId), locationBySource.get(sourceId)))
  return {
    id: guide.id,
    title: guide.title,
    category: guide.category,
    summary: guide.summary,
    read_minutes: guide.read_minutes,
    sections: guide.sections,
    sources,
    steps: guide.sections.map(section => ({ title: section.title, body: section.body })),
    source_title: sources[0] ? sources[0].title : '',
    source_url: sources[0] ? sources[0].url : '',
    related_courses: []
  }
}

function createLearningCompassProjection(knowledgeBase) {
  const sourceMap = validateKnowledgeBase(knowledgeBase)
  const published = (knowledgeBase.guides || []).filter(guide => guide.status === 'published')
  const details = new Map(published.map(guide => [guide.id, publicGuideDetail(guide, sourceMap)]))
  return Object.freeze({
    categories: [...LEARNING_COMPASS_CATEGORIES],
    listPublished() {
      return [...details.values()].map(detail => {
        const { sections, sources, steps, source_title, source_url, related_courses, ...summary } = detail
        return summary
      })
    },
    getPublished(id) {
      return details.get(id) || null
    },
    searchItems() {
      return [...details.values()].map(detail => ({
        id: detail.id,
        type: 'guide',
        type_label: '指',
        badge: '指',
        name: detail.title,
        aliases: [],
        tags: [detail.category],
        teachers: [],
        search_text: `${detail.title} ${detail.category} ${detail.summary}`,
        subtitle: `${detail.category} · 指南`
      }))
    }
  })
}

function readLearningCompassData(dataPath) {
  return JSON.parse(fs.readFileSync(path.resolve(dataPath), 'utf8'))
}

module.exports = {
  LEARNING_COMPASS_CATEGORIES,
  LEARNING_COMPASS_STATUSES,
  LearningCompassValidationError,
  buildLearningCompass,
  createLearningCompassProjection,
  parseGuideMarkdown,
  parseSourceManifest,
  readLearningCompassData,
  validateKnowledgeBase
}
