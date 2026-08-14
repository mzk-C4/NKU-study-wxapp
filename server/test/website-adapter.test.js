const test = require('node:test')
const assert = require('node:assert/strict')
const { AdapterValidationError, adaptWebsiteData } = require('../src/website-adapter')
const { courseView, reviewView } = require('../src/model')

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

test('reuses server categories, tags, teachers and the single rating', () => {
  const result = adaptWebsiteData({
    manifest,
    reviews: [
      { id: 'matched', courseTitle: '线性代数', teacher: '张老师', rating: 5, content: '讲解清晰', status: 'approved', hidden: false },
      { id: 'unmatched', courseTitle: '课程清单外评价', teacher: '李老师', rating: 4, content: '历史评价', status: 'approved', hidden: false }
    ],
    catalogMetadata: { 'linear-algebra': { department: '数学科学学院', extra_tags: ['人工补充'] } }
  })
  const course = result.data.courses[0]
  assert.equal(course.category_name, '专业必修课')
  assert.equal(course.term, '大一上')
  assert.deepEqual(course.tags, ['数学'])
  assert.deepEqual(course.extra_tags, ['人工补充'])
  assert.equal(result.data.resources.length, 1)
  assert.equal('academic_year' in result.data.resources[0], false)
  assert.equal('campus' in result.data.resources[0], false)
  assert.equal(result.data.reviews.length, 2)
  assert.equal(result.data.reviews[0].teacher, '张老师')
  assert.equal(result.data.reviews[0].rating, 5)
  assert.equal(result.data.reviews[1].course_id, null)
  assert.equal(result.report.unmatched_review_count, 1)
  assert.equal(result.report.issues.length, 0)
  assert.equal(result.data.teachers.length, 0)
  assert.equal(result.data.offerings.length, 0)
})

test('course views group teacher text exactly like website reviews', () => {
  const reviews = [1, 2, 3].map(index => ({ id: `review-${index}`, courseTitle: '线性代数', teacher: index === 3 ? '李老师' : '张老师', rating: 4, content: '评价', status: 'approved', hidden: false }))
  const adapted = adaptWebsiteData({ manifest, reviews }).data
  const course = courseView(adapted, adapted.courses[0], true)
  assert.equal(course.ratings.average, 4)
  assert.deepEqual(course.teacher_groups.map(group => [group.teacher_name, group.review_count]), [['张老师', 2], ['李老师', 1]])
  assert.equal(reviewView(adapted, adapted.reviews[0]).teacher_name, '张老师')
})

test('strict mode only blocks unsafe resource roots', () => {
  assert.throws(
    () => adaptWebsiteData({ manifest: { ...manifest, resourceRoot: 'http://untrusted.example/resources/' } }),
    error => error instanceof AdapterValidationError && error.issues[0].code === 'RESOURCE_ROOT_NOT_ALLOWED'
  )
})

test('legacy seed reviews remain readable during migration', () => {
  const adapted = adaptWebsiteData({ manifest, reviews: [] }).data
  adapted.teachers = [{ id: 'teacher-old', name: '旧教师' }]
  adapted.offerings = [{ id: 'offering-old', course_id: adapted.courses[0].id, teacher_id: 'teacher-old', status: 'published' }]
  adapted.reviews = [1, 2, 3].map(index => ({ id: `legacy-${index}`, offering_id: 'offering-old', recommend: 3, status: 'published' }))
  const course = courseView(adapted, adapted.courses[0], true)
  assert.equal(course.ratings.average, 3)
  assert.equal(course.teacher_groups[0].teacher_name, '旧教师')
})
