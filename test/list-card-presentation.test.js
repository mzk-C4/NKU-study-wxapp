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
