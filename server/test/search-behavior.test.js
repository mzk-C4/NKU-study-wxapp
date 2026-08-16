const test = require('node:test')
const assert = require('node:assert/strict')

const seed = require('../data/seed.json')
const { buildSearchIndex } = require('../src/model')
const { createSearchEngine } = require('../../miniprogram/utils/search-engine')
const {
  DEFAULT_SEARCH_TEXT_MAX_LENGTH,
  fuzzyIncludes,
  getSearchTokens,
  normalizeBoundedSearchText,
  normalizeSearchText,
  scatteredIncludes
} = require('../../miniprogram/utils/search-utils')

const indexItems = buildSearchIndex(seed)
const engine = createSearchEngine(indexItems)

function search(keyword, type) {
  return engine.search(keyword, type ? { type } : {}).results
}

function keys(results) {
  return results.map(item => `${item.type}:${item.id}`)
}

function assertIncludes(results, expected) {
  assert.ok(keys(results).includes(expected), `expected ${expected} in ${keys(results).join(', ')}`)
}

function assertExcludes(results, unexpected) {
  assert.ok(!keys(results).includes(unexpected), `did not expect ${unexpected} in ${keys(results).join(', ')}`)
}

function assertFirst(results, expected) {
  assert.equal(keys(results)[0], expected)
}

test('search utilities normalize NFKC, punctuation, spaces and enforce token AND semantics', () => {
  assert.equal(normalizeSearchText('  ＤＳ，  算法\n'), 'ds 算法')
  assert.deepEqual(getSearchTokens(' 概   统 '), ['概', '统'])
  assert.equal(normalizeBoundedSearchText('A'.repeat(DEFAULT_SEARCH_TEXT_MAX_LENGTH + 20)).length, DEFAULT_SEARCH_TEXT_MAX_LENGTH)
  assert.equal(scatteredIncludes('概率论与数理统计', '概统'), true)
  assert.equal(fuzzyIncludes('有机化学', '有 化'), true)
  assert.equal(fuzzyIncludes('环境化学', '有 化'), false)
})

test('course search regression covers names, aliases, short names, NFKC and scattered matches', () => {
  const chemistry = search('化学')
  assertIncludes(chemistry, 'course:course_organic_chemistry')
  assertIncludes(chemistry, 'course:course_environmental_chemistry')

  const cases = [
    ['有机', 'course:course_organic_chemistry'],
    ['环化', 'course:course_environmental_chemistry'],
    ['DS', 'course:course_data_structures'],
    ['ＤＳ', 'course:course_data_structures'],
    ['概统', 'course:course_probability'],
    ['概 统', 'course:course_probability'],
    ['有化', 'course:course_organic_chemistry'],
    ['有 化', 'course:course_organic_chemistry'],
    ['数构', 'course:course_data_structures'],
    ['数 构', 'course:course_data_structures'],
    [' 大   物 ', 'course:course_university_physics']
  ]

  for (const [query, expected] of cases) assertFirst(search(query), expected)
  assertExcludes(search('有 化'), 'course:course_environmental_chemistry')
})

test('teacher, tag and guide fields participate in deterministic recall', () => {
  const teacherResults = search('周老师')
  assertFirst(teacherResults, 'teacher:teacher_zhou')
  assertIncludes(teacherResults, 'course:course_probability')

  const tagResults = search('算法')
  assertIncludes(tagResults, 'course:course_data_structures')
  assert.equal(tagResults.find(item => item.id === 'course_data_structures').type, 'course')

  const guideResults = search('隐私')
  assertFirst(guideResults, 'guide:guide_resource_safety')
  assert.equal(guideResults[0].type, 'guide')
})

test('type filtering preserves candidate counts and excludes other result types', () => {
  const result = engine.search('化学', { type: 'course' })
  assert.deepEqual(keys(result.results), [
    'course:course_organic_chemistry',
    'course:course_environmental_chemistry'
  ])
  assert.equal(result.results.every(item => item.type === 'course'), true)
  assert.ok(result.counts.course >= 2)
  assert.ok(result.counts.resource >= 1)
  assert.deepEqual(keys(engine.search('隐私', { type: 'guide' }).results), ['guide:guide_resource_safety'])
  assert.deepEqual(keys(engine.search('隐私', { type: 'unknown' }).results), ['guide:guide_resource_safety'])
})

test('empty input keeps the existing default-list contract without throwing', () => {
  const empty = engine.search('')
  const whitespace = engine.search('   ')
  assert.equal(empty.query, '')
  assert.deepEqual(keys(empty.results), keys(indexItems.slice(0, 40)))
  assert.deepEqual(keys(whitespace.results), keys(empty.results))
  assert.deepEqual(keys(engine.search('', { type: 'course' }).results), keys(indexItems.filter(item => item.type === 'course')))
})

test('course search index exposes an optional short_name field and remains compatible when it is absent', () => {
  const courseItems = indexItems.filter(item => item.type === 'course')
  assert.deepEqual(courseItems.map(item => [item.id, item.short_name]), [
    ['course_probability', '概统'],
    ['course_organic_chemistry', '有化'],
    ['course_data_structures', 'DS'],
    ['course_university_physics', '大物'],
    ['course_environmental_chemistry', '环化']
  ])
  assert.ok(courseItems.every(item => item.search_text.includes(item.short_name)))

  const productionCompatibleItems = indexItems.map(item => {
    const compatibleItem = { ...item }
    delete compatibleItem.short_name
    return compatibleItem
  })
  assertFirst(createSearchEngine(productionCompatibleItems).search('DS').results, 'course:course_data_structures')
})
