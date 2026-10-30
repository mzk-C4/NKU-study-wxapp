const test = require('node:test')
const assert = require('node:assert/strict')
const { formatBrowseCount, courseCardTags } = require('../miniprogram/utils/list-card-presentation')
const { mapCourse, mapReviewGroup } = require('../miniprogram/services/public-api')

test('course tags use declared labels and quantity, deduplicate, and stay bounded', () => {
  assert.deepEqual(courseCardTags({ resource_count: 10, tags: ['通识必修课', ''], group: '通识必修课' }), [
    { text: '资料较多', tone: 'purple' }, { text: '通识必修课', tone: 'gray' }
  ])
  assert.deepEqual(courseCardTags({ resource_count: 9, tags: [], group: '通识必修课' }), [{ text: '通识必修课', tone: 'gray' }])
  assert.deepEqual(courseCardTags({}), [])
  assert.deepEqual(courseCardTags({ tags: ['数学', '数学', '基础', '第三个'] }).map(item => item.text), ['数学', '基础'])
})

test('missing or malformed view counts stay absent, true zero remains displayable', () => {
  for (const value of [null, undefined, '', '1000', -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(formatBrowseCount(value), '')
    assert.equal(Object.hasOwn(mapCourse({ view_count: value }), 'view_count'), false)
    assert.equal(Object.hasOwn(mapReviewGroup({ view_count: value }), 'browse_count_label'), false)
  }
  assert.equal(formatBrowseCount(0), '0')
  assert.equal(formatBrowseCount(999), '999')
  assert.equal(formatBrowseCount(1999), '1.9k')
  assert.equal(formatBrowseCount(9999), '9.9k')
  assert.equal(formatBrowseCount(10000), '1万')
  assert.equal(mapReviewGroup({ view_count: 1200 }).browse_count_label, '1.2k')
})

test('review tag summaries keep real bounded counts, drop private fields and select the top two', () => {
  const group = mapReviewGroup({ review_count: 6, tag_counts: [
    { tag: '讲解清晰', count: 3, user_id: 'private' },
    { tag: ' 内容有趣 ', count: 5 },
    { tag: '讲解清晰', count: 4 },
    { tag: '作业适中', count: 2 },
    { tag: '错误', count: 7 },
    { tag: '', count: 1 },
    { tag: '错误', count: -1 },
    { tag: '错误', count: '2' },
    { tag: '错误', count: 1.5 }
  ] })
  assert.deepEqual(group.tag_counts, [{ tag: '内容有趣', count: 5 }, { tag: '讲解清晰', count: 4 }])
  assert.equal(Object.hasOwn(mapReviewGroup({}), 'tag_counts'), false)
  assert.deepEqual(mapReviewGroup({ review_count: 0, tag_counts: [{ tag: '不存在', count: 1 }] }).tag_counts, [])
})

test('review cards preserve real scores and do not manufacture scores from missing or invalid values', () => {
  const previous = global.Page
  global.Page = () => {}
  let presentReview
  try { ({ presentReview } = require('../miniprogram/pages/course-reviews/index')) } finally { global.Page = previous }
  for (const rating of [null, undefined, '', 0, -1, 6, Infinity, 'bad']) {
    const review = presentReview({ rating, body: '事多分低，四学期以来最低的英语' })
    assert.equal(review.rating, null)
    assert.equal(review.rating_label, '—')
    assert.equal(review.stars.some(star => star.active), false)
  }
  const review = presentReview({ rating: 5, body: '事多分低，四学期以来最低的英语' })
  assert.equal(review.rating_label, '5.0', 'client must not infer moderation or rewrite server scores from text')
  assert.equal(presentReview({ rating: 3.5 }).rating_label, '3.5')
})

test('review layout places score left, date in header and real helpful action beside the text', () => {
  const fs = require('node:fs')
  const read = file => fs.readFileSync(require('node:path').join(__dirname, '../miniprogram', file), 'utf8')
  const markup = read('pages/course-reviews/index.wxml')
  assert.ok(markup.indexOf('class="review-score"') < markup.indexOf('class="review-teacher"'))
  assert.ok(markup.indexOf('class="review-date"') < markup.indexOf('class="review-content"'))
  assert.match(markup, /<button class="helpful-button[^>]*catchtap="reactToReview"/)
  assert.match(markup, /class="review-compose-fab"[^>]*bindtap="writeReview"[^>]*aria-label="写课程评价"/)
  assert.doesNotMatch(markup, /sticky-footer/)
  assert.match(read('pages/course-reviews/index.wxss'), /bottom:\s*calc\(28rpx \+ env\(safe-area-inset-bottom\)\)/)
})

test('home restores the separate themed brand row and original rounded purple grid hero', () => {
  const fs = require('node:fs')
  const read = file => fs.readFileSync(require('node:path').join(__dirname, '../miniprogram', file), 'utf8')
  const home = read('pages/home/index.wxml')
  const styles = read('pages/home/index.wxss')
  assert.doesNotMatch(home + styles, /home-masthead/)
  assert.ok(home.indexOf('class="brand-row"') < home.indexOf('class="hero"'))
  assert.ok(home.indexOf('class="search-box home-search"') < home.indexOf('class="announcement-bar"'))
  assert.ok(home.indexOf('class="announcement-bar"') < home.indexOf('class="home-carousel section"'))
  assert.match(styles, /\.brand-name\s*\{[^}]*color:\s*var\(--nk-text/)
  assert.match(styles, /\.site-status-value\s*\{[^}]*color:\s*var\(--nk-text/)
  assert.match(styles, /\.hero\s*\{[^}]*background-image:\s*linear-gradient/)
  assert.match(styles, /\.hero\s*\{[^}]*border-radius:\s*0 0 48rpx 48rpx/)
})

test('decimal stars display exact partial fill without changing the server score', () => {
  const previous = global.Page
  global.Page = () => {}
  let starStates
  try { ({ starStates } = require('../miniprogram/pages/course-reviews/index')) } finally { global.Page = previous }
  assert.deepEqual(starStates(3.5).map(star => star.fill), [100, 100, 100, 50, 0])
  assert.deepEqual(starStates(4.9).map(star => star.fill), [100, 100, 100, 100, 90])
  assert.deepEqual(starStates(null).map(star => star.fill), [0, 0, 0, 0, 0])
})
