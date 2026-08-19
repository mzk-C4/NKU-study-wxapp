const Fuse = require('../lib/fuse')
const {
  getSearchTokens,
  normalizeBoundedSearchText,
  normalizeSearchText,
  scatteredIncludes
} = require('./search-utils')

const DEFAULT_SEARCH_RESULT_LIMIT = 40
const SEARCH_TYPES = ['course', 'teacher', 'resource', 'guide']
const FUSE_OPTIONS = Object.freeze({
  includeScore: true,
  ignoreLocation: true,
  // Deterministic matching has already fixed the candidate set; this threshold only lets Fuse score every candidate.
  threshold: 1,
  keys: [
    { name: 'name', weight: 0.3 },
    { name: 'short_name', weight: 0.2 },
    { name: 'aliases', weight: 0.15 },
    { name: 'tags', weight: 0.15 },
    { name: 'teachers', weight: 0.1 },
    { name: 'search_text', weight: 0.1 }
  ]
})

function toTextArray(value) {
  return Array.isArray(value) ? value.filter(item => item != null).map(String) : []
}

function createSearchPool(item) {
  return [
    item && item.name,
    item && item.short_name,
    ...toTextArray(item && item.aliases),
    ...toTextArray(item && item.tags),
    ...toTextArray(item && item.teachers),
    item && item.course_name,
    item && item.resource_type,
    item && item.term_label,
    item && item.category,
    item && item.updated_at,
    item && item.subtitle,
    item && item.search_text
  ].filter(Boolean).join(' ')
}

function matchesCandidate(item, query) {
  const normalizedPool = normalizeSearchText(createSearchPool(item))
  const abbreviationFields = [item && item.name, item && item.short_name, ...toTextArray(item && item.aliases)]
  return getSearchTokens(query).every(token =>
    normalizedPool.includes(token) || abbreviationFields.some(value => scatteredIncludes(value, token))
  )
}

function normalizedValues(value) {
  return toTextArray(value).map(normalizeSearchText).filter(Boolean)
}

function includesQuery(value, query) {
  return value === query || value.includes(query)
}

function getFieldRank(item, query) {
  const name = normalizeSearchText(item.name)
  const shortName = normalizeSearchText(item.short_name)
  const aliases = normalizedValues(item.aliases)
  const teachers = normalizedValues(item.teachers)
  const tags = normalizedValues(item.tags)

  if (name === query || shortName === query) return 0
  if (aliases.includes(query)) return 1
  if (includesQuery(name, query) || includesQuery(shortName, query)) return 2
  if (teachers.some(value => includesQuery(value, query))) return 3
  if (tags.some(value => includesQuery(value, query))) return 4
  if (normalizeSearchText(item.search_text).includes(query)) return 5
  return 6
}

function itemKey(item) {
  return `${item.type || ''}:${item.id || ''}`
}

function compareText(left, right) {
  const a = String(left || '')
  const b = String(right || '')
  return a < b ? -1 : a > b ? 1 : 0
}

function rankCandidates(candidates, query) {
  const fuseScores = new Map(
    new Fuse(candidates, FUSE_OPTIONS).search(query).map(result => [itemKey(result.item), result.score == null ? 1 : result.score])
  )

  return candidates.map((item, sourceIndex) => ({
    item,
    sourceIndex,
    fieldRank: getFieldRank(item, query),
    fuseScore: fuseScores.has(itemKey(item)) ? fuseScores.get(itemKey(item)) : 1
  })).sort((left, right) =>
    left.fieldRank - right.fieldRank ||
    left.fuseScore - right.fuseScore ||
    compareText(left.item.name, right.item.name) ||
    compareText(left.item.type, right.item.type) ||
    compareText(left.item.id, right.item.id) ||
    left.sourceIndex - right.sourceIndex
  ).map(entry => entry.item)
}

function normalizeSearchType(type) {
  return SEARCH_TYPES.includes(type) ? type : ''
}

function countTypes(items) {
  return items.reduce((counts, item) => {
    counts[item.type] = (counts[item.type] || 0) + 1
    return counts
  }, {})
}

function createSearchEngine(indexItems) {
  const items = Array.isArray(indexItems) ? indexItems.slice() : []

  return {
    search(keyword, options = {}) {
      const query = normalizeBoundedSearchText(keyword)
      const candidates = query
        ? items.filter(item => matchesCandidate(item, query))
        : items.slice()
      const rankedItems = query ? rankCandidates(candidates, query) : candidates
      const type = normalizeSearchType(options.type)
      const requestedLimit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : DEFAULT_SEARCH_RESULT_LIMIT
      const results = (type ? rankedItems.filter(item => item.type === type) : rankedItems).slice(0, requestedLimit)

      return { query, counts: countTypes(rankedItems), results }
    }
  }
}

module.exports = {
  DEFAULT_SEARCH_RESULT_LIMIT,
  SEARCH_TYPES,
  FUSE_OPTIONS,
  createSearchPool,
  matchesCandidate,
  normalizeSearchType,
  createSearchEngine
}
