const test = require('node:test')
const assert = require('node:assert/strict')
const { AdapterValidationError, adaptWebsiteData } = require('../src/website-adapter')
const { courseView } = require('../src/model')

const manifest = {
  version: 1, updated: '2026-08-14', resourceRoot: 'https://resources.nkustudy.top/resources/',
  courses: [{
    id: 'linear-algebra', term: '大一上', group: '专业必修课', title: '线性代数', summary: '课程简介',
    contributors: ['同学 A'], updated: '2026-08-14', tags: ['数学'], basePath: '大一上/专业必修课/线性代数/',
    sections: [{ title: '往年试题', files: [
      { title: '2025 试卷.pdf', path: '试卷/2025 试卷.pdf', size: 2048 },
      { title: '.openlist', path: '.openlist', size: 1 }
    ] }]
  }]
}

test('reuses server categories, terms, tags and the single rating', () => {
  const result = adaptWebsiteData({
    manifest,
    reviews: [{ id: 'review-1', courseTitle: '线性代数', teacher: '张老师', rating: 5, content: '讲解清晰', status: 'approved', hidden: false }],
    catalogMetadata: { 'linear-algebra': { department: '数学科学学院', extra_tags: ['人工补充'] } }
  })
  const course = result.data.courses[0]
  assert.equal(course.category_name, '专业必修课')
  assert.equal(course.term, '大一上')
  assert.equal(course.category_code, null)
  assert.deepEqual(course.tags, ['数学'])
  assert.deepEqual(course.extra_tags, ['人工补充'])
  assert.equal(result.data.resources.length, 1)
  assert.equal(result.data.resources[0].source_section, '往年试题')
  assert.equal(result.data.resources[0].share_url, 'https://resources.nkustudy.top/resources/%E5%A4%A7%E4%B8%80%E4%B8%8A/%E4%B8%93%E4%B8%9A%E5%BF%85%E4%BF%AE%E8%AF%BE/%E7%BA%BF%E6%80%A7%E4%BB%A3%E6%95%B0/%E8%AF%95%E5%8D%B7/2025%20%E8%AF%95%E5%8D%B7.pdf')
  assert.equal(result.data.reviews[0].rating, 5)
  assert.equal('difficulty' in result.data.reviews[0], false)
  assert.equal('recommend' in result.data.reviews[0], false)
})

test('reports unmatched reviews without blocking valid server data', () => {
  const result = adaptWebsiteData({
    manifest,
    reviews: [{ id: 'orphan', courseTitle: '不存在的课程', teacher: '李老师', rating: 4, content: '历史数据', status: 'approved', hidden: false }]
  })
  assert.equal(result.data.courses.length, 1)
  assert.equal(result.data.reviews.length, 0)
  assert.equal(result.report.issues[0].code, 'REVIEW_COURSE_UNMATCHED')
  assert.equal(result.report.issues[0].severity, 'warning')
})

test('strict mode only blocks unsafe resource roots', () => {
  assert.throws(
    () => adaptWebsiteData({ manifest: { ...manifest, resourceRoot: 'http://untrusted.example/resources/' } }),
    error => error instanceof AdapterValidationError && error.issues[0].code === 'RESOURCE_ROOT_NOT_ALLOWED'
  )
})

test('single aggregate rating also supports old seed reviews during migration', () => {
  const input = {
    manifest,
    reviews: [1, 2, 3].map(index => ({ id: `review-${index}`, courseTitle: '线性代数', teacher: '张老师', rating: 4, content: '评价', status: 'approved', hidden: false }))
  }
  const adapted = adaptWebsiteData(input).data
  const course = courseView(adapted, adapted.courses[0], true)
  assert.equal(course.ratings.show_aggregate, true)
  assert.equal(course.ratings.average, 4)
  assert.equal('difficulty' in course.ratings, false)

  const legacyData = { ...adapted, reviews: adapted.reviews.map(review => ({ ...review, rating: undefined, recommend: 3 })) }
  assert.equal(courseView(legacyData, legacyData.courses[0]).ratings.average, 3)
})
