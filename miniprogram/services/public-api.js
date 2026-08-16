const request = require('../utils/request')
const config = require('../config')

const RESOURCE_DOWNLOAD_HOST = 'resources.nkustudy.top'
const COURSE_QUERY_KEYS = Object.freeze(['q', 'term', 'group', 'tag', 'assessment', 'page', 'page_size'])

function toText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function toTextArray(value) {
  return Array.isArray(value) ? value.map(toText).filter(Boolean) : []
}

function toCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toPositiveInteger(value, fallback, maximum) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) return fallback
  return Math.min(number, maximum)
}

function boundedQueryText(value, maximum) {
  return toText(value).slice(0, maximum)
}

function buildCourseQuery(input = {}) {
  const query = {
    page: toPositiveInteger(input.page, 1, 1000000),
    page_size: toPositiveInteger(input.page_size, 20, 100)
  }
  const q = boundedQueryText(input.q, 200)
  if (q) query.q = q
  for (const key of ['term', 'group', 'tag', 'assessment']) {
    const value = boundedQueryText(input[key], 120)
    if (value) query[key] = value
  }
  return query
}

function buildDevelopCourseQuery(input = {}) {
  const publicQuery = buildCourseQuery(input)
  const query = { page: publicQuery.page, page_size: publicQuery.page_size }
  if (publicQuery.q) query.query = publicQuery.q
  return query
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value == null ? '' : value))
}

function validateResourceDownloadUrl(value) {
  const url = toText(value)
  if (!url || /[\s\\]/.test(url)) return ''
  const match = /^https:\/\/([^/:?#]+)(?=\/|\?|#|$)/i.exec(url)
  if (!match || match[1].toLowerCase() !== RESOURCE_DOWNLOAD_HOST) return ''
  return url
}

function mapRatings(rawRatings, reviewCount) {
  const raw = rawRatings && typeof rawRatings === 'object' ? rawRatings : {}
  const average = toNullableNumber(raw.average)
  const count = toCount(raw.count == null ? reviewCount : raw.count)
  const showAggregate = raw.show_aggregate === true && average !== null
  return {
    average,
    count,
    show_aggregate: showAggregate,
    label: showAggregate ? `${average.toFixed(1)} 分` : '暂无评分'
  }
}

function mapTeacherGroup(rawGroup) {
  const raw = rawGroup && typeof rawGroup === 'object' ? rawGroup : {}
  const groupKey = toText(raw.group_key || raw.id)
  const teacherName = toText(raw.teacher_name)
  return {
    id: groupKey,
    group_key: groupKey,
    teacher_name: teacherName,
    teacher_name_short: toText(raw.teacher_name_short) || teacherName.slice(0, 1),
    review_count: toCount(raw.review_count)
  }
}

function mapCourse(rawCourse) {
  const raw = rawCourse && typeof rawCourse === 'object' ? rawCourse : {}
  const reviewCount = toCount(raw.review_count)
  const rawTeacherGroups = Array.isArray(raw.teacher_groups)
    ? raw.teacher_groups
    : (Array.isArray(raw.offerings) ? raw.offerings : [])
  const teacherGroups = rawTeacherGroups.map(mapTeacherGroup).filter(item => item.group_key || item.teacher_name)
  const declaredTeachers = toTextArray(raw.teachers)
  const teachers = declaredTeachers.length ? declaredTeachers : [...new Set(teacherGroups.map(item => item.teacher_name).filter(Boolean))]
  const group = toText(raw.group || raw.category_name || raw.requirement_type)
  const term = toText(raw.term || raw.recommended_stage)
  const assessment = toText(raw.assessment)
  return {
    id: toText(raw.id),
    name: toText(raw.name),
    summary: toText(raw.summary || raw.description),
    description: toText(raw.description || raw.summary),
    term,
    group,
    category_name: toText(raw.category_name || raw.group || raw.requirement_type),
    tags: toTextArray(raw.tags),
    assessment,
    teachers,
    teacher_groups: teacherGroups,
    resource_count: toCount(raw.resource_count),
    review_count: reviewCount,
    offering_count: toCount(raw.offering_count == null ? teacherGroups.length : raw.offering_count),
    ratings: mapRatings(raw.ratings, reviewCount),
    updated: toText(raw.updated || raw.updated_at)
  }
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

function mapFacets(rawFacets, courses) {
  const raw = rawFacets && typeof rawFacets === 'object' ? rawFacets : {}
  const mapped = {
    groups: toTextArray(raw.groups),
    terms: toTextArray(raw.terms),
    tags: toTextArray(raw.tags),
    assessments: toTextArray(raw.assessments)
  }
  return {
    groups: mapped.groups.length ? mapped.groups : uniqueSorted(courses.map(item => item.group)),
    terms: mapped.terms.length ? mapped.terms : uniqueSorted(courses.map(item => item.term)),
    tags: mapped.tags.length ? mapped.tags : uniqueSorted(courses.flatMap(item => item.tags)),
    assessments: mapped.assessments.length ? mapped.assessments : uniqueSorted(courses.map(item => item.assessment))
  }
}

function mapCourseList(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const courses = Array.isArray(raw.items) ? raw.items.map(mapCourse) : []
  return {
    items: courses,
    total: toCount(raw.total == null ? courses.length : raw.total),
    page: toPositiveInteger(raw.page, 1, 1000000),
    page_size: toPositiveInteger(raw.page_size, courses.length || 20, 100),
    facets: mapFacets(raw.facets, courses)
  }
}

function mapHome(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  return {
    announcement: toText(raw.announcement),
    hot_courses: Array.isArray(raw.hot_courses) ? raw.hot_courses.map(mapCourse) : [],
    latest_updates: Array.isArray(raw.latest_updates) ? raw.latest_updates.map(item => ({
      id: toText(item && item.id),
      title: toText(item && item.title),
      summary: toText(item && item.summary),
      updated: toText(item && (item.updated || item.updated_at))
    })) : []
  }
}

function mapResource(rawResource) {
  const raw = rawResource && typeof rawResource === 'object' ? rawResource : {}
  const downloadUrl = validateResourceDownloadUrl(raw.download_url)
  return {
    id: toText(raw.id),
    course_id: toText(raw.course_id),
    course_name: toText(raw.course_name),
    title: toText(raw.title),
    size: toCount(raw.size),
    size_label: toText(raw.size_label),
    description: toText(raw.description),
    section: toText(raw.section),
    type: toText(raw.type || raw.section),
    term_label: toText(raw.term_label),
    extension: toText(raw.extension).toUpperCase(),
    download_url: downloadUrl,
    download_available: Boolean(downloadUrl)
  }
}

function mapCourseResources(rawData, courseId) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const resources = Array.isArray(raw.items) ? raw.items.map(mapResource) : []
  return {
    course_id: toText(raw.course_id) || toText(courseId),
    items: resources,
    total: toCount(raw.total == null ? resources.length : raw.total)
  }
}

function mapReviewItem(rawItem, groupKey) {
  const raw = rawItem && typeof rawItem === 'object' ? rawItem : {}
  return {
    id: toText(raw.id),
    group_key: toText(groupKey),
    teacher_name: toText(raw.teacher_name),
    rating: toNullableNumber(raw.rating),
    tags: toTextArray(raw.tags),
    body: toText(raw.body),
    helpful_count: toCount(raw.helpful_count),
    created_at: toText(raw.created_at)
  }
}

function mapReviewGroup(rawGroup, includeItems = false) {
  const raw = rawGroup && typeof rawGroup === 'object' ? rawGroup : {}
  const groupKey = toText(raw.group_key)
  const mapped = {
    group_key: groupKey,
    course_id: toText(raw.course_id),
    course_name: toText(raw.course_name),
    teacher_name: toText(raw.teacher_name),
    matched: raw.matched === true,
    review_count: toCount(raw.review_count),
    rating_average: toNullableNumber(raw.rating_average)
  }
  if (includeItems) mapped.items = Array.isArray(raw.items) ? raw.items.map(item => mapReviewItem(item, groupKey)) : []
  return mapped
}

function mapReviewGroupList(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const groups = Array.isArray(raw.items) ? raw.items.map(item => mapReviewGroup(item)) : []
  return { items: groups, total: toCount(raw.total == null ? groups.length : raw.total), available: true }
}

function mapCourseSearchItem(course) {
  const subtitle = [course.group, course.term, course.assessment].filter(Boolean).join(' · ')
  return {
    id: course.id,
    type: 'course',
    type_label: '课',
    badge: '课',
    name: course.name,
    short_name: '',
    aliases: [],
    tags: course.tags,
    teachers: course.teachers,
    search_text: [course.name, course.summary, course.term, course.group, course.assessment, ...course.tags, ...course.teachers].filter(Boolean).join(' '),
    subtitle
  }
}

function unavailableReferenceResult() {
  return { items: [], total: 0, available: false }
}

function createPublicApi(client = request, options = {}) {
  const envVersion = options.envVersion || config.envVersion
  const isDevelopReference = envVersion === 'develop'
  const courseQuery = input => isDevelopReference ? buildDevelopCourseQuery(input) : buildCourseQuery(input)

  return {
    async getHealth() {
      const data = await client.get('/health')
      return { status: toText(data && data.status) }
    },
    async getHome() {
      return mapHome(await client.get('/home'))
    },
    async getCourses(query) {
      return mapCourseList(await client.get('/courses', courseQuery(query)))
    },
    async getCourse(courseUid) {
      return mapCourse(await client.get(`/courses/${encodePathSegment(courseUid)}`))
    },
    async getCourseResources(courseUid) {
      const data = await client.get(`/courses/${encodePathSegment(courseUid)}/resources`)
      return mapCourseResources(data, courseUid)
    },
    async getReviewGroups() {
      if (isDevelopReference) return unavailableReferenceResult()
      return mapReviewGroupList(await client.get('/review-groups'))
    },
    async getReviewGroup(groupKey) {
      if (isDevelopReference) {
        const error = new Error('本地参考服务未提供公开评价分组。')
        error.code = 'REFERENCE_MOCK_UNAVAILABLE'
        throw error
      }
      return mapReviewGroup(await client.get(`/review-groups/${encodePathSegment(groupKey)}`), true)
    },
    async searchCourses(keyword, options = {}) {
      const result = mapCourseList(await client.get('/courses', courseQuery({ ...options, q: keyword })))
      return { ...result, items: result.items.map(mapCourseSearchItem) }
    },
    validateResourceDownloadUrl,
    isAllowedResourceDownloadUrl(value) { return Boolean(validateResourceDownloadUrl(value)) }
  }
}

const publicApi = createPublicApi()

module.exports = Object.assign(publicApi, {
  RESOURCE_DOWNLOAD_HOST,
  COURSE_QUERY_KEYS,
  buildCourseQuery,
  buildDevelopCourseQuery,
  encodePathSegment,
  validateResourceDownloadUrl,
  mapCourse,
  mapCourseList,
  mapHome,
  mapResource,
  mapCourseResources,
  mapReviewGroup,
  mapReviewGroupList,
  mapCourseSearchItem,
  createPublicApi
})
