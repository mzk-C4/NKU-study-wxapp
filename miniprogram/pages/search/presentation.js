const MATCH_FIELDS = Object.freeze([
  { key: 'name', label: '课程名' },
  { key: 'teachers', label: '教师' },
  { key: 'tags', label: '标签' },
  { key: 'summary', label: '摘要' },
  { key: 'term', label: '修读阶段' },
  { key: 'group', label: '课程类别' },
  { key: 'assessment', label: '考核方式' }
])

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

function highlightText(value, query) {
  const text = toText(value)
  const match = findContinuousMatch(text, query)
  if (!match) return { html: escapeHtml(text), matched: false }

  const prefix = text.slice(0, match.index)
  const matchedText = text.slice(match.index, match.index + match.length)
  const suffix = text.slice(match.index + match.length)
  return {
    html: `${escapeHtml(prefix)}<span style="color:#4B1F6F;background:#F8EFD9;font-weight:700">${escapeHtml(matchedText)}</span>${escapeHtml(suffix)}`,
    matched: true
  }
}

function fieldValues(course, key) {
  const value = course && course[key]
  return Array.isArray(value) ? value : [value]
}

function buildCoursePresentation(course, query) {
  const source = course && typeof course === 'object' ? course : {}
  const keyword = toText(query).trim()
  const highlightedName = highlightText(source.name, keyword)
  const presented = {
    ...source,
    type: 'course',
    badge: '课',
    highlighted_name: highlightedName.html,
    subtitle: [source.group, source.term, source.assessment].filter(Boolean).join(' · '),
    match_html: '',
    match_text: keyword ? '符合当前搜索条件' : '符合当前筛选条件'
  }

  if (!keyword) return presented

  for (const field of MATCH_FIELDS) {
    for (const value of fieldValues(source, field.key)) {
      const highlighted = highlightText(value, keyword)
      if (!highlighted.matched) continue
      return {
        ...presented,
        match_html: `${escapeHtml(field.label)}匹配：${highlighted.html}`,
        match_text: ''
      }
    }
  }

  return presented
}

module.exports = {
  MATCH_FIELDS,
  escapeHtml,
  findContinuousMatch,
  highlightText,
  buildCoursePresentation
}
