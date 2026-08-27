const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  buildReviewGroupUrl,
  getReviewEmptyText,
  getReviewListState,
  getReviewSearchStats,
  searchReviewGroups
} = require('../miniprogram/pages/reviews-tab/search')
const { highlightText } = require('../miniprogram/utils/search-highlight')
const presentation = require('../miniprogram/pages/search/presentation')

const projectRoot = path.resolve(__dirname, '..')

function group(key, courseName, teacherName, overrides = {}) {
  return {
    group_key: key,
    course_id: '',
    course_name: courseName,
    teacher_name: teacherName,
    review_count: 1,
    ...overrides
  }
}

function resultKeys(groups, keyword) {
  return searchReviewGroups(groups, keyword).results.map(item => item.group_key)
}

function captureReviewsPage() {
  const modulePath = require.resolve('../miniprogram/pages/reviews-tab/index.js')
  const previousPage = global.Page
  let definition
  global.Page = value => { definition = value }
  delete require.cache[modulePath]
  try {
    require(modulePath)
  } finally {
    delete require.cache[modulePath]
    if (previousPage === undefined) delete global.Page
    else global.Page = previousPage
  }
  return definition
}

function createReviewsPage() {
  const definition = captureReviewsPage()
  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data))
  }
  page.setData = patch => Object.assign(page.data, patch)
  return page
}

test('normalizes NFKC, English case, punctuation, whitespace, and caps the keyword at 80 characters', () => {
  const groups = [group('organic', '有机化学', 'Alice Zhang'), group('data', 'Data Structures', 'Bob')]
  assert.deepEqual(resultKeys(groups, '有机， 化学'), ['organic'])
  assert.deepEqual(resultKeys(groups, 'ＤＡＴＡ'), ['data'])
  assert.equal(searchReviewGroups(groups, ` ${'x'.repeat(100)} `).query.length, 80)
})

test('finds continuous and scattered course and teacher terms without crossing fields', () => {
  const groups = [
    group('organic', '有机化学', '张老师'),
    group('teacher-continuous', '大学物理', '张伟老师'),
    group('teacher-scattered', '线性代数', '张三丰老师'),
    group('cross-field-only', '化工导论', '王学老师')
  ]
  assert.deepEqual(resultKeys(groups, '有学'), ['organic'])
  assert.deepEqual(resultKeys(groups, '张伟'), ['teacher-continuous'])
  assert.deepEqual(resultKeys(groups, '张丰'), ['teacher-scattered'])
  assert.deepEqual(resultKeys(groups, '化学 张'), ['organic'])
  assert.deepEqual(resultKeys(groups, '化学'), ['organic'])
})

test('does not search review body, tags, ratings, or other non-public-group fields', () => {
  const groups = [group('hidden-fields', '高等数学', '李老师', {
    body: '独有正文词',
    tags: ['独有标签'],
    rating_average: 4.8,
    created_at: '2026-08-27'
  })]
  assert.deepEqual(resultKeys(groups, '独有正文词'), [])
  assert.deepEqual(resultKeys(groups, '独有标签'), [])
  assert.deepEqual(resultKeys(groups, '4.8'), [])
})

test('orders exact before continuous, continuous before scattered, then stable normalized fields and group key', () => {
  const groups = [
    group('scattered', '有A机B化C学', '甲'),
    group('continuous', '有机化学实验', '甲'),
    group('exact', '有机化学', '乙'),
    group('tie-b', '同名课程', '同名教师'),
    group('tie-a', '同名课程', '同名教师')
  ]
  assert.deepEqual(resultKeys(groups, '有机化学'), ['exact', 'continuous', 'scattered'])
  assert.deepEqual(resultKeys(groups, '同名'), ['tie-a', 'tie-b'])
})

test('highlights only fields that actually matched and escapes all rich text content', () => {
  const [crossField] = searchReviewGroups([group('cross', '化学导论', '张老师')], '化学 张').results
  assert.match(crossField.highlighted_course_name, /<span[^>]*>化学<\/span>/)
  assert.match(crossField.highlighted_teacher_name, /<span[^>]*>张<\/span>/)
  const [unsafe] = searchReviewGroups([group('unsafe', '<有机>&化学', '张<老师>')], '有机 张').results
  assert.match(unsafe.highlighted_course_name, /&lt;<span[^>]*>有机<\/span>&gt;&amp;化学/)
  assert.match(unsafe.highlighted_teacher_name, /<span[^>]*>张<\/span>&lt;老师&gt;/)
  assert.doesNotMatch(unsafe.highlighted_course_name, /<有机>/)
})

test('the extracted shared highlighter keeps the search page output unchanged', () => {
  assert.equal(
    presentation.highlightText('有机化学', '有学').html,
    highlightText('有机化学', '有学').html
  )
  assert.equal(presentation.escapeHtml('<script>'), '&lt;script&gt;')
})

test('pagination resets on a new search and clearing restores the first 20 public groups', () => {
  const groups = Array.from({ length: 25 }, (_, index) => group(`g-${index}`, `化学课程 ${index}`, '张老师'))
  const page = createReviewsPage()
  page.applyFilter(groups, '')
  page.loadMore()
  assert.equal(page.data.visibleGroups.length, 25)
  assert.equal(page.data.page, 2)
  page.inputKeyword({ detail: { value: '化学' } })
  assert.equal(page.data.page, 1)
  assert.equal(page.data.visibleGroups.length, 20)
  page.clearKeyword()
  assert.equal(page.data.keyword, '')
  assert.equal(page.data.visibleGroups.length, 20)
  assert.equal(page.data.filteredGroups.length, 25)
})

test('the input preserves raw user text while normalized text controls search state', () => {
  const page = createReviewsPage()
  const groups = [group('data', 'Data Structures', 'Alice')]
  const rawKeyword = ' ＤＡＴＡ， '
  page.applyFilter(groups, rawKeyword)
  assert.equal(page.data.keyword, rawKeyword)
  assert.equal(page.data.hasSearchQuery, true)
  assert.deepEqual(page.data.filteredGroups.map(item => item.group_key), ['data'])
  page.inputKeyword({ detail: { value: 'x'.repeat(100) } })
  assert.equal(page.data.keyword.length, 80)
  page.applyFilter(groups, '，　')
  assert.equal(page.data.keyword, '，　')
  assert.equal(page.data.hasSearchQuery, false)
  assert.equal(page.data.filteredGroups.length, 1)
})

test('course statistics deduplicate stable ids and safely fall back to normalized names while reviews sum', () => {
  const stats = getReviewSearchStats([
    group('a', '有机化学', '张老师', { course_id: 'course-1', review_count: 2 }),
    group('b', '有机化学', '李老师', { course_id: 'course-1', review_count: 3 }),
    group('c', ' Ｄａｔａ　Ｓｔｒｕｃｔｕｒｅｓ ', '王老师', { review_count: 4 }),
    group('d', 'data structures', '赵老师', { review_count: 5 })
  ])
  assert.deepEqual(stats, { statCourses: 2, statReviews: 14 })
})

test('search and true-empty states stay distinct and group navigation uses only encoded group_key', () => {
  assert.equal(getReviewEmptyText('不存在', []), '没有匹配的课程或教师')
  assert.equal(getReviewEmptyText('', []), '暂无评价')
  assert.equal(buildReviewGroupUrl(group('课程/张 ?&', '课程', '张')), '/pages/course-reviews/index?group_key=%E8%AF%BE%E7%A8%8B%2F%E5%BC%A0%20%3F%26')
  assert.equal(buildReviewGroupUrl({ key: 'legacy-or-untrusted' }), '')
  assert.deepEqual(getReviewListState([1, 2, 3], 2, 2), { visibleGroups: [1, 2, 3], page: 2, hasMore: false })
})

test('reviews tab search control is an accessible native button with a 64rpx target', () => {
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/reviews-tab/index.wxml'), 'utf8')
  const style = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/reviews-tab/index.wxss'), 'utf8')
  assert.match(template, /<input[^>]*maxlength="80"[^>]*confirm-type="search"[^>]*aria-label="搜索课程或教师"/)
  assert.match(template, /<button[^>]*class="reviews-search-clear"[^>]*aria-label="清除搜索词"[^>]*catchtap="clearKeyword"[^>]*>×<\/button>/)
  assert.match(template, /empty-text="\{\{hasSearchQuery \? '没有匹配的课程或教师' : '暂无评价'\}\}"/)
  assert.match(style, /\.reviews-search-clear\s*\{[^}]*width:\s*64rpx;[^}]*min-width:\s*64rpx;[^}]*height:\s*64rpx;[^}]*min-height:\s*64rpx;/)
})
