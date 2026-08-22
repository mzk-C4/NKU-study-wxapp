const course = {
  id: '7eb43b38-e8ec-4d30-a9de-6e62b0240e91',
  name: '测试课程',
  summary: '服务器摘要',
  description: '服务器摘要',
  term: '大一上',
  group: '通识选修课',
  category_name: '通识选修课',
  tags: ['数学'],
  assessment: '绩点制',
  teachers: ['张老师'],
  teacher_groups: [{ id: 'group-key', group_key: 'group-key', teacher_name: '张老师', teacher_name_short: '老师', review_count: 1 }],
  resource_count: 1,
  review_count: 1,
  offering_count: 1,
  ratings: { average: 5, count: 1, show_aggregate: true },
  updated: '2026-08-15',
  basePath: 'must-not-reach-client-adapter',
  source: 'must-not-reach-client-adapter'
}

const reviewGroup = {
  group_key: 'group-key',
  course_id: course.id,
  course_name: course.name,
  teacher_name: '张老师',
  matched: true,
  review_count: 1,
  rating_average: 5,
  items: [{ id: 'review-1', teacher_name: '张老师', rating: 5, tags: ['讲解清晰'], body: '公开评价正文', helpful_count: 2, created_at: '2026-08-15' }]
}

module.exports = {
  course,
  reviewGroup,
  home: { announcement: '公告', hot_courses: [course], latest_updates: [{ id: course.id, title: course.name, summary: course.summary, updated: course.updated }] },
  courses: { items: [course], total: 1, page: 1, page_size: 20, facets: { groups: [course.group], terms: [course.term], tags: course.tags, assessments: [course.assessment] } },
  resources: { course_id: course.id, total: 1, items: [{ id: 'file-id', course_id: course.id, course_name: course.name, title: '试卷.pdf', size: 1024, size_label: '1.0 KB', description: '期末试题', section: '历年试题', type: '历年试题', term_label: course.term, extension: 'PDF', download_url: 'https://resources.nkustudy.top/resources/test.pdf', path: 'must-not-reach-client-adapter' }] }
}
