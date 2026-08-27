const { getSearchTokens, normalizeSearchText } = require('./search-utils')

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
      ? Array.from(normalized).map(normalizedCharacter => ({ normalized: normalizedCharacter, index }))
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
  return { html: renderHighlightedText(text, positions), matched: true }
}

module.exports = {
  escapeHtml,
  findContinuousMatch,
  findHighlightPositions,
  highlightText
}
