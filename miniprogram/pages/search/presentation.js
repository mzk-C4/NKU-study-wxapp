const { getSearchTokens, normalizeSearchText } = require('../../utils/search-utils')

const MATCH_FIELDS = Object.freeze([
  { key: 'name', label: '名称', allowScattered: true },
  { key: 'short_name', label: '简称', allowScattered: true },
  { key: 'aliases', label: '别名', allowScattered: true },
  { key: 'teachers', label: '教师' },
  { key: 'tags', label: '标签' },
  { key: 'course_name', label: '所属课程' },
  { key: 'resource_type', label: '资料类型' },
  { key: 'term_label', label: '学期' },
  { key: 'category', label: '指南分类' },
  { key: 'updated_at', label: '更新时间' },
  { key: 'subtitle', label: '说明' },
  { key: 'search_text', label: '相关内容' }
])

const COURSE_MATCH_FIELDS = Object.freeze([
  { key: 'name', label: '课程名', allowScattered: true },
  { key: 'short_name', label: '简称', allowScattered: true },
  { key: 'aliases', label: '别名', allowScattered: true },
  { key: 'teachers', label: '教师' },
  { key: 'tags', label: '标签' },
  { key: 'summary', label: '摘要' },
  { key: 'term', label: '修读阶段' },
  { key: 'group', label: '课程类别' },
  { key: 'assessment', label: '考核方式' }
])

const TYPE_BADGES = Object.freeze({ course: '课', teacher: '师', resource: '资', guide: '指' })

function toText(value) {
  return String(value == null ? '' : value)
}

function escapeHtml(value) {
  return toText(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]))
}

function findContinuousMatch(value, query) {
  const text = toText(value)
  const needle = toText(query).trim()
  if (!needle) return null
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase())
  return index < 0 ? null : { index, length: needle.length }
}

function normalizedCodePointUnits(value) {
  return Array.from(toText(value)).flatMap((character, index) => {
    const normalized = normalizeSearchText(character)
    return normalized
      ? Array.from(normalized).map(value => ({ normalized: value, index }))
      : [{ normalized: '\u0000', index }]
  })
}

function findContinuousPositions(units, token, usedPositions) {
  const characters = Array.from(normalizeSearchText(token))
  if (!characters.length) return null

  for (let start = 0; start <= units.length - characters.length; start += 1) {
    const positions = []
    let matches = true
    for (let offset = 0; offset < characters.length; offset += 1) {
      const unit = units[start + offset]
      if (!unit || unit.normalized !== characters[offset] || usedPositions.has(unit.index)) {
        matches = false
        break
      }
      positions.push(unit.index)
    }
    if (matches) return positions
  }
  return null
}

function findScatteredPositions(units, token, usedPositions) {
  const characters = Array.from(normalizeSearchText(token).replace(/\s+/g, ''))
  if (!characters.length) return []

  const positions = []
  let tokenIndex = 0
  for (const unit of units) {
    if (!unit.normalized || unit.normalized === '\u0000' || /\s/.test(unit.normalized) || usedPositions.has(unit.index)) continue
    if (unit.normalized === characters[tokenIndex]) {
      positions.push(unit.index)
      tokenIndex += 1
      if (tokenIndex === characters.length) return positions
    }
  }
  return null
}

function findHighlightPositions(value, query, allowScattered = true) {
  const tokens = [...new Set(getSearchTokens(query))]
  if (!tokens.length) return []

  const units = normalizedCodePointUnits(value)
  const positions = new Set()
  for (const token of tokens) {
    const continuous = findContinuousPositions(units, token, positions)
    const matched = continuous || (allowScattered ? findScatteredPositions(units, token, positions) : null)
    if (!matched) return null
    matched.forEach(position => positions.add(position))
  }
  return [...positions].sort((left, right) => left - right)
}

function renderHighlightedText(value, positions) {
  const characters = Array.from(toText(value))
  const matched = new Set(positions)
  let html = ''
  let cursor = 0
  while (cursor < characters.length) {
    const highlighted = matched.has(cursor)
    let end = cursor + 1
    while (end < characters.length && matched.has(end) === highlighted) end += 1
    const segment = escapeHtml(characters.slice(cursor, end).join(''))
    html += highlighted
      ? `<span style="color:#4B1F6F;background:#F8EFD9;font-weight:700">${segment}</span>`
      : segment
    cursor = end
  }
  return html
}

function highlightText(value, query, options = {}) {
  const text = toText(value)
  const positions = findHighlightPositions(text, query, options.allowScattered !== false)
  if (!positions || !positions.length) return { html: escapeHtml(text), matched: false }
  return {
    html: renderHighlightedText(text, positions),
    matched: true
  }
}

function fieldValues(course, key) {
  const value = course && course[key]
  return Array.isArray(value) ? value : [value]
}

function findMatch(source, query, fields) {
  if (!toText(query).trim()) return null
  for (const field of fields) {
    for (const value of fieldValues(source, field.key)) {
      const highlighted = highlightText(value, query, { allowScattered: field.allowScattered === true })
      if (!highlighted.matched) continue
      return { field, value, highlighted }
    }
  }
  return null
}

function buildSearchPresentation(item, query) {
  const source = item && typeof item === 'object' ? item : {}
  const type = ['course', 'teacher', 'resource', 'guide'].includes(source.type) ? source.type : ''
  const name = toText(source.name)
  const match = findMatch(source, query, MATCH_FIELDS)
  const metadata = type === 'resource'
    ? [source.course_name, source.resource_type, source.term_label]
    : (type === 'guide' ? [source.category, source.updated_at] : [])
  return {
    id: toText(source.id),
    key: `${type}:${toText(source.id)}`,
    type,
    badge: toText(source.badge || source.type_label) || TYPE_BADGES[type] || '',
    name,
    highlighted_name: highlightText(name, query).html,
    short_name: toText(source.short_name),
    aliases: Array.isArray(source.aliases) ? source.aliases.map(toText).filter(Boolean) : [],
    tags: Array.isArray(source.tags) ? source.tags.map(toText).filter(Boolean) : [],
    teachers: Array.isArray(source.teachers) ? source.teachers.map(toText).filter(Boolean) : [],
    subtitle: toText(source.subtitle),
    metadata: metadata.map(toText).filter(Boolean).join(' · '),
    course_id: toText(source.course_id),
    course_name: toText(source.course_name),
    resource_type: toText(source.resource_type),
    term_label: toText(source.term_label),
    category: toText(source.category),
    updated_at: toText(source.updated_at),
    match_html: match ? `${escapeHtml(match.field.label)}匹配：${match.highlighted.html}` : '',
    match_text: match ? '' : '符合当前搜索条件'
  }
}

function buildCoursePresentation(course, query) {
  const source = course && typeof course === 'object' ? course : {}
  const keyword = toText(query).trim()
  const highlightedName = highlightText(source.name, keyword)
  const presented = {
    ...source,
    key: `course:${toText(source.id)}`,
    type: 'course',
    badge: '课',
    highlighted_name: highlightedName.html,
    subtitle: [source.group, source.term, source.assessment].filter(Boolean).join(' · '),
    match_html: '',
    match_text: keyword ? '符合当前搜索条件' : '符合当前筛选条件'
  }

  if (!keyword) return presented

  const match = findMatch(source, keyword, COURSE_MATCH_FIELDS)
  if (match) return {
    ...presented,
    match_html: `${escapeHtml(match.field.label)}匹配：${match.highlighted.html}`,
    match_text: ''
  }

  return presented
}

module.exports = {
  MATCH_FIELDS,
  COURSE_MATCH_FIELDS,
  escapeHtml,
  findContinuousMatch,
  findHighlightPositions,
  highlightText,
  buildSearchPresentation,
  buildCoursePresentation
}
