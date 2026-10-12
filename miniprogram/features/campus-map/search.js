// Adapted from NKUwiki wiki-map/search.js (20ad5fcb), MIT. See SOURCE.md.
const MiniSearch = require('../../lib/minisearch')
const { normalizeBoundedSearchText, normalizeSearchText } = require('../../utils/search-utils')

// Upstream's Chinese single-character + adjacent-bigram index, plus Latin words.
function tokenize(text) {
  const tokens = []
  for (const word of normalizeSearchText(text).split(' ')) {
    if (!word) continue
    if (/[\u4E00-\u9FFF]/.test(word)) {
      const chars = Array.from(word)
      tokens.push(...chars)
      for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1])
    } else tokens.push(word)
  }
  return tokens
}

// MiniSearch OR recall alone accepts any common Chinese character. Require each
// query phrase to occur in one field, allowing a bounded edit near that phrase.
// A free text prefix/suffix gives substring distance; a 1–2 character query is exact.
function matchesPhrase(text, phrase) {
  if (text.includes(phrase)) return true
  if (phrase.length < 3 || !text) return false
  const edits = Math.min(2, Math.max(1, Math.floor(phrase.length * 0.2)))
  let previous = new Array(text.length + 1).fill(0)
  for (let i = 1; i <= phrase.length; i++) {
    const current = [i]
    for (let j = 1; j <= text.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1,
        previous[j - 1] + (phrase[i - 1] === text[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous.some(distance => distance <= edits)
}

function createBuildingSearch(buildings, categories = {}) {
  const documents = buildings.map(place => ({ ...place,
    categoryLabel: categories[place.category] ? categories[place.category].label : '' }))
  const fieldsById = new Map(documents.map(place => [place.id, {
    name: normalizeSearchText(place.name),
    aliases: (place.aliases || []).map(normalizeSearchText),
    other: [place.desc, place.categoryLabel].map(normalizeSearchText)
  }]))
  const engine = new MiniSearch({
    fields: ['name', 'desc', 'aliases', 'categoryLabel'],
    tokenize,
    extractField: (doc, field) => field === 'aliases' ? (doc.aliases || []).join(' ') : doc[field],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3, aliases: 2, desc: 1, categoryLabel: 1 } }
  })
  engine.addAll(documents)
  // Return ranked stable string IDs only. Native numeric marker IDs never change.
  return value => {
    if (!String(value || '').trim()) return buildings.map(place => place.id)
    const query = normalizeBoundedSearchText(value)
    if (!query) return []
    const phrases = query.split(' ')
    return engine.search(query).filter(result => {
      const fields = fieldsById.get(result.id)
      return phrases.every(phrase => [fields.name, ...fields.aliases, ...fields.other]
        .some(text => matchesPhrase(text, phrase)))
    }).map(result => {
      const fields = fieldsById.get(result.id)
      const priority = fields.name === query ? 0
        : phrases.every(phrase => fields.name.includes(phrase)) ? 1
          : fields.aliases.includes(query) ? 2 : 3
      return { id: result.id, priority, score: result.score }
    }).sort((a, b) => a.priority - b.priority || b.score - a.score || a.id.localeCompare(b.id))
      .map(result => result.id)
  }
}

module.exports = { tokenize, createBuildingSearch }
