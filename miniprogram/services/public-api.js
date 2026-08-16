const request = require('../utils/request')

function list(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return typeof value === 'string' ? value : ''
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function adaptTeacherGroup(raw = {}) {
  return {
    id: text(raw.id),
    group_key: text(raw.group_key),
    teacher_name: text(raw.teacher_name),
    teacher_name_short: text(raw.teacher_name_short),
    review_count: number(raw.review_count)
  }
}

function adaptCourse(raw = {}) {
  return {
    id: text(raw.id),
    name: text(raw.name),
    summary: text(raw.summary),
    description: text(raw.description),
    term: text(raw.term),
    group: text(raw.group),
    category_name: text(raw.category_name),
    tags: list(raw.tags).map(text).filter(Boolean),
    assessment: text(raw.assessment),
    teachers: list(raw.teachers).map(text).filter(Boolean),
    teacher_groups: list(raw.teacher_groups).map(adaptTeacherGroup),
    resource_count: number(raw.resource_count),
    review_count: number(raw.review_count),
    offering_count: number(raw.offering_count),
    ratings: {
      average: raw.ratings?.average == null ? null : number(raw.ratings.average),
      count: number(raw.ratings?.count),
      show_aggregate: raw.ratings?.show_aggregate === true
    },
    updated: text(raw.updated)
  }
}

function adaptHome(raw = {}) {
  return {
    announcement: text(raw.announcement),
    hot_courses: list(raw.hot_courses).map(adaptCourse),
    latest_updates: list(raw.latest_updates).map(item => ({
      id: text(item.id),
      title: text(item.title),
      summary: text(item.summary),
      updated: text(item.updated)
    }))
  }
}

function adaptFacets(raw = {}) {
  return {
    groups: list(raw.groups).map(text).filter(Boolean),
    terms: list(raw.terms).map(text).filter(Boolean),
    tags: list(raw.tags).map(text).filter(Boolean),
    assessments: list(raw.assessments).map(text).filter(Boolean)
  }
}

function adaptCourseList(raw = {}) {
  return {
    items: list(raw.items).map(adaptCourse),
    total: number(raw.total),
    page: number(raw.page) || 1,
    page_size: number(raw.page_size) || 20,
    facets: adaptFacets(raw.facets)
  }
}

function adaptResource(raw = {}) {
  return {
    id: text(raw.id),
    course_id: text(raw.course_id),
    course_name: text(raw.course_name),
    title: text(raw.title),
    size: number(raw.size),
    size_label: text(raw.size_label),
    description: text(raw.description),
    section: text(raw.section),
    type: text(raw.type),
    term_label: text(raw.term_label),
    extension: text(raw.extension),
    download_url: text(raw.download_url)
  }
}

function adaptResourceList(raw = {}) {
  return {
    course_id: text(raw.course_id),
    items: list(raw.items).map(adaptResource),
    total: number(raw.total)
  }
}

function adaptReview(raw = {}) {
  return {
    id: text(raw.id),
    teacher_name: text(raw.teacher_name),
    rating: number(raw.rating),
    tags: list(raw.tags).map(text).filter(Boolean),
    body: text(raw.body),
    helpful_count: number(raw.helpful_count),
    created_at: text(raw.created_at)
  }
}

function adaptReviewGroup(raw = {}) {
  const group = {
    group_key: text(raw.group_key),
    course_id: raw.course_id == null ? null : text(raw.course_id),
    course_name: text(raw.course_name),
    teacher_name: text(raw.teacher_name),
    matched: raw.matched === true,
    review_count: number(raw.review_count),
    rating_average: raw.rating_average == null ? null : number(raw.rating_average)
  }
  if (Array.isArray(raw.items)) group.items = raw.items.map(adaptReview)
  return group
}

function allowedCourseQuery(input = {}) {
  const pageSize = Math.min(100, Math.max(1, Number(input.page_size) || 20))
  const query = { page: Math.max(1, Number(input.page) || 1), page_size: pageSize }
  for (const key of ['q', 'term', 'group', 'tag', 'assessment']) {
    if (typeof input[key] === 'string' && input[key].trim()) query[key] = input[key].trim()
  }
  return query
}

function createPublicApi(transport = request) {
  return {
    async getHome() { return adaptHome(await transport.get('/home')) },
    async getCourses(query) { return adaptCourseList(await transport.get('/courses', allowedCourseQuery(query))) },
    async getCourse(courseId) { return adaptCourse(await transport.get(`/courses/${encodeURIComponent(courseId)}`)) },
    async getCourseResources(courseId) { return adaptResourceList(await transport.get(`/courses/${encodeURIComponent(courseId)}/resources`)) },
    async getReviewGroups() {
      const raw = await transport.get('/review-groups')
      return { items: list(raw?.items).map(adaptReviewGroup), total: number(raw?.total) }
    },
    async getReviewGroup(groupKey) { return adaptReviewGroup(await transport.get(`/review-groups/${encodeURIComponent(groupKey)}`)) },
    async getCourseReviewGroups(course) {
      return Promise.all(course.teacher_groups.map(async group => adaptReviewGroup(await transport.get(`/review-groups/${encodeURIComponent(group.group_key)}`))))
    },
    async submitReview(input) {
      return transport.post('/reviews', {
        course_id: text(input.course_id),
        teacher: text(input.teacher),
        rating: number(input.rating),
        tags: list(input.tags).map(text).filter(Boolean),
        body: text(input.body),
        anonymous: input.anonymous === true
      })
    }
  }
}

module.exports = {
  adaptCourse,
  adaptCourseList,
  adaptHome,
  adaptResourceList,
  adaptReviewGroup,
  allowedCourseQuery,
  createPublicApi,
  publicApi: createPublicApi()
}
