function formatBrowseCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) return ''
  if (value < 1000) return String(value)
  const unit = value >= 10000 ? '万' : 'k'
  const divisor = value >= 10000 ? 10000 : 1000
  return (Math.floor(value / divisor * 10) / 10).toFixed(1).replace(/\.0$/, '') + unit
}

function courseCardTags(course) {
  const source = course && typeof course === 'object' ? course : {}
  const tags = []
  if (source.resource_count >= 10) tags.push({ text: '资料较多', tone: 'purple' })
  const labels = [...(Array.isArray(source.tags) ? source.tags : []), source.group || source.category_name]
  labels.forEach(label => {
    if (typeof label !== 'string' || !label.trim()) return
    const text = label.trim()
    if (!tags.some(tag => tag.text === text)) tags.push({ text, tone: 'gray' })
  })
  return tags.slice(0, 2)
}

module.exports = { formatBrowseCount, courseCardTags }
