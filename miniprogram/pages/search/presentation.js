const {
  escapeHtml,
  findContinuousMatch,
  findHighlightPositions,
  highlightText
} = require('../../utils/search-highlight')

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
