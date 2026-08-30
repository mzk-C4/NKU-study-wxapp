const request = require('../utils/request')
const config = require('../config')

const RESOURCE_DOWNLOAD_HOST = 'resources.nkustudy.top'
const COURSE_QUERY_KEYS = Object.freeze(['q', 'term', 'group', 'tag', 'assessment', 'page', 'page_size'])
const GUIDE_QUERY_KEYS = Object.freeze(['category', 'page', 'page_size'])
const GUIDE_CATEGORIES = Object.freeze(['course-selection', 'training-program', 'add-drop', 'exam-grade'])
const SEARCH_INDEX_TYPES = new Set(['course', 'teacher', 'resource', 'guide'])

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

function buildGuidesQuery(input = {}) {
  const query = {
    page: toPositiveInteger(input.page, 1, 1000000),
    page_size: toPositiveInteger(input.page_size, 20, 100)
  }
  const category = toText(input.category)
  if (GUIDE_CATEGORIES.includes(category)) query.category = category
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

function validatePublicHttpsUrl(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\s\\]/.test(value)) return ''
  const match = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(value)
  if (!match || match[1].includes('@')) return ''
  const authority = match[1]
  const validAuthority = /^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?$/i
  return validAuthority.test(authority) ? value : ''
}

function mapRatings(rawRatings, reviewCount) {
  const raw = rawRatings && typeof rawRatings === 'object' ? rawRatings : {}
  const average = toNullableNumber(raw.average)
  const count = toCount(raw.count == null ? reviewCount : raw.count)
  const showAggregate = raw.show_aggregate === true && average !== null
  return {
    average: average === null ? null : average.toFixed(1),
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
    short_name: toText(raw.short_name),
    aliases: toTextArray(raw.aliases),
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

function mapSearchIndexItem(rawItem) {
  const raw = rawItem && typeof rawItem === 'object' ? rawItem : {}
  const id = toText(raw.id)
  const type = toText(raw.type)
  const name = toText(raw.name)
  if (!id || !name || !SEARCH_INDEX_TYPES.has(type)) return null
  const mapped = {
    id,
    type,
    type_label: toText(raw.type_label),
    badge: toText(raw.badge),
    name,
    short_name: toText(raw.short_name),
    aliases: toTextArray(raw.aliases),
    tags: toTextArray(raw.tags),
    teachers: toTextArray(raw.teachers),
    search_text: toText(raw.search_text),
    subtitle: toText(raw.subtitle)
  }
  if (type === 'resource') {
    mapped.course_id = toText(raw.course_id)
    mapped.course_name = toText(raw.course_name)
    mapped.resource_type = toText(raw.resource_type)
    mapped.term_label = toText(raw.term_label)
  }
  if (type === 'guide') {
    const category = toText(raw.category)
    mapped.category = GUIDE_CATEGORIES.includes(category) ? category : ''
    mapped.updated_at = toText(raw.updated_at)
  }
  return mapped
}

function mapSearchIndex(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const items = Array.isArray(raw.items) ? raw.items.map(mapSearchIndexItem).filter(Boolean) : []
  return {
    version: toText(raw.version),
    generated_at: toText(raw.generated_at),
    items,
    total: toCount(raw.total == null ? items.length : raw.total)
  }
}

function mapGuideSummary(rawGuide) {
  const raw = rawGuide && typeof rawGuide === 'object' ? rawGuide : {}
  const category = toText(raw.category)
  return {
    id: toText(raw.id),
    title: toText(raw.title),
    summary: toText(raw.summary),
    category: GUIDE_CATEGORIES.includes(category) ? category : '',
    updated_at: toText(raw.updated_at),
    applicable_scope: toText(raw.applicable_scope),
    related_course_ids: toTextArray(raw.related_course_ids)
  }
}

function mapGuideList(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const items = Array.isArray(raw.items)
    ? raw.items.map(mapGuideSummary).filter(item => item.id && item.title)
    : []
  const rawFacets = raw.facets && typeof raw.facets === 'object' ? raw.facets : {}
  const categories = [...new Set(toTextArray(rawFacets.categories).filter(item => GUIDE_CATEGORIES.includes(item)))]
  return {
    items,
    total: toCount(raw.total == null ? items.length : raw.total),
    page: toPositiveInteger(raw.page, 1, 1000000),
    page_size: toPositiveInteger(raw.page_size, items.length || 20, 100),
    facets: { categories },
    data_updated_at: toText(raw.data_updated_at)
  }
}

function mapGuideStep(rawStep) {
  const raw = rawStep && typeof rawStep === 'object' ? rawStep : {}
  return { title: toText(raw.title), body: toText(raw.body) }
}

function mapRelatedCourse(rawCourse) {
  const raw = rawCourse && typeof rawCourse === 'object' ? rawCourse : {}
  return { id: toText(raw.id), name: toText(raw.name) }
}

function mapGuide(rawGuide) {
  const raw = rawGuide && typeof rawGuide === 'object' ? rawGuide : {}
  const category = toText(raw.category)
  return {
    id: toText(raw.id),
    title: toText(raw.title),
    summary: toText(raw.summary),
    category: GUIDE_CATEGORIES.includes(category) ? category : '',
    updated_at: toText(raw.updated_at),
    applicable_scope: toText(raw.applicable_scope),
    steps: Array.isArray(raw.steps)
      ? raw.steps.map(mapGuideStep).filter(item => item.title || item.body)
      : [],
    related_courses: Array.isArray(raw.related_courses)
      ? raw.related_courses.map(mapRelatedCourse).filter(item => item.id && item.name)
      : [],
    source_title: toText(raw.source_title),
    source_url: validatePublicHttpsUrl(raw.source_url),
    correction_url: validatePublicHttpsUrl(raw.correction_url)
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
  const submission = raw.review_submission && typeof raw.review_submission === 'object' ? raw.review_submission : {}
  return {
    announcement: toText(raw.announcement),
    hot_courses: Array.isArray(raw.hot_courses) ? raw.hot_courses.map(mapCourse) : [],
    latest_updates: Array.isArray(raw.latest_updates) ? raw.latest_updates.map(item => ({
      id: toText(item && item.id),
      title: toText(item && item.title),
      summary: toText(item && item.summary),
      updated: toText(item && (item.updated || item.updated_at))
    })) : [],
    review_submission: {
      min_length: Math.max(1, Number(submission.min_length) || 12),
      moderation_required: submission.moderation_required === true,
      submission_open: submission.submission_open !== false
    }
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
    unhelpful_count: toCount(raw.unhelpful_count),
    viewer_reaction: raw.viewer_reaction === 'up' || raw.viewer_reaction === 'down' ? raw.viewer_reaction : null,
    created_at: toText(raw.created_at)
  }
}

function mapReviewGroup(rawGroup, includeItems = false) {
  const raw = rawGroup && typeof rawGroup === 'object' ? rawGroup : {}
  const groupKey = toText(raw.group_key)
  const ratingAverage = toNullableNumber(raw.rating_average)
  const mapped = {
    group_key: groupKey,
    course_id: toText(raw.course_id),
    course_name: toText(raw.course_name),
    teacher_name: toText(raw.teacher_name),
    matched: raw.matched === true,
    submittable: raw.submittable !== false,
    catalog_course_id: toText(raw.catalog_course_id),
    review_count: toCount(raw.review_count),
    rating_average: ratingAverage === null ? null : ratingAverage.toFixed(1)
  }
  if (includeItems) mapped.items = Array.isArray(raw.items) ? raw.items.map(item => mapReviewItem(item, groupKey)) : []
  return mapped
}

function mapReviewGroupList(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const groups = Array.isArray(raw.items) ? raw.items.map(item => mapReviewGroup(item)) : []
  return { items: groups, total: toCount(raw.total == null ? groups.length : raw.total), available: true }
}

function mapUser(rawUser) {
  const raw = rawUser && typeof rawUser === 'object' ? rawUser : {}
  const id = Number(raw.id)
  return {
    id: Number.isSafeInteger(id) && id > 0 ? id : 0,
    nickname: toText(raw.nickname).slice(0, 32),
    avatar_url: validatePublicHttpsUrl(raw.avatar_url),
    has_web_password: raw.has_web_password === true,
    created_at: raw.created_at || null,
    last_login_at: raw.last_login_at || null
  }
}

function mapAuthResult(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  return {
    token: toText(raw.token),
    expires_in: toPositiveInteger(raw.expires_in, 0, 60 * 60 * 24 * 365),
    user: mapUser(raw.user)
  }
}

function mapFavoriteItem(rawItem) {
  const raw = rawItem && typeof rawItem === 'object' ? rawItem : {}
  return {
    course_id: toText(raw.course_id),
    favorited_at: raw.favorited_at || null,
    name: toText(raw.name),
    term: toText(raw.term),
    group: toText(raw.group),
    resource_count: toCount(raw.resource_count),
    review_count: toCount(raw.review_count)
  }
}

function mapFavoriteList(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const items = Array.isArray(raw.items) ? raw.items.map(mapFavoriteItem).filter(item => item.course_id) : []
  return {
    items,
    total: toCount(raw.total == null ? items.length : raw.total),
    page: toPositiveInteger(raw.page, 1, 1000000),
    page_size: toPositiveInteger(raw.page_size, items.length || 20, 100)
  }
}

function mapMyReview(rawItem) {
  const raw = rawItem && typeof rawItem === 'object' ? rawItem : {}
  return {
    id: toText(raw.id),
    course_title: toText(raw.course_title),
    teacher_name: toText(raw.teacher_name),
    rating: toCount(raw.rating),
    tags: toTextArray(raw.tags),
    body: toText(raw.body),
    status: toText(raw.status) || 'pending',
    hidden: raw.hidden === true,
    created_at: raw.created_at || '',
    updated_at: raw.updated_at || ''
  }
}

function mapMyReviewList(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const items = Array.isArray(raw.items) ? raw.items.map(mapMyReview).filter(item => item.id) : []
  return {
    items,
    total: toCount(raw.total == null ? items.length : raw.total),
    page: toPositiveInteger(raw.page, 1, 1000000),
    page_size: toPositiveInteger(raw.page_size, items.length || 20, 100)
  }
}

function mapMyFeedback(rawItem) {
  const raw = rawItem && typeof rawItem === 'object' ? rawItem : {}
  return {
    id: toText(raw.id),
    title: toText(raw.title),
    content: toText(raw.content),
    type: toText(raw.type),
    status: toText(raw.status) || 'open',
    hidden: raw.hidden === true,
    resourceRef: toText(raw.resourceRef),
    reply: toText(raw.reply),
    repliedAt: raw.repliedAt || '',
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || ''
  }
}

function mapMyFeedbackList(rawData) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const items = Array.isArray(raw.items) ? raw.items.map(mapMyFeedback).filter(item => item.id) : []
  return {
    items,
    total: toCount(raw.total == null ? items.length : raw.total),
    page: toPositiveInteger(raw.page, 1, 1000000),
    page_size: toPositiveInteger(raw.page_size, items.length || 20, 100)
  }
}

function authenticatedFeatureUnavailable() {
  const error = new Error('本地参考服务未提供微信登录和个人数据。')
  error.code = 'REFERENCE_MOCK_UNAVAILABLE'
  throw error
}

function mapCourseSearchItem(course) {
  const subtitle = [course.group, course.term, course.assessment].filter(Boolean).join(' · ')
  return {
    id: course.id,
    type: 'course',
    type_label: '课',
    badge: '课',
    name: course.name,
    short_name: course.short_name,
    aliases: course.aliases,
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
  const apiProfile = Object.hasOwn(options, 'apiProfile')
    ? (options.apiProfile === 'reference' ? 'reference' : 'production')
    : config.apiProfile
  const isReference = apiProfile === 'reference'
  const courseQuery = input => isReference ? buildDevelopCourseQuery(input) : buildCourseQuery(input)

  return {
    async getHealth() {
      const data = await client.get('/health')
      return { status: toText(data && data.status) }
    },
    async getHome() {
      return mapHome(await client.get('/home'))
    },
    async getSearchIndex() {
      return mapSearchIndex(await client.get('/search-index'))
    },
    async getGuides(query) {
      return mapGuideList(await client.get('/guides', buildGuidesQuery(query)))
    },
    async getGuide(guideId) {
      return mapGuide(await client.get(`/guides/${encodePathSegment(guideId)}`))
    },
    async getCatalog(query = {}) {
      if (isReference) return { items: [], total: 0 }
      const params = []
      const keyword = String(query.q || '').trim()
      if (keyword) params.push(`q=${encodeURIComponent(keyword)}`)
      params.push(`page_size=${Math.min(100, Math.max(1, Number(query.page_size) || 30))}`)
      const data = await client.get(`/catalog?${params.join('&')}`)
      const raw = data && typeof data === 'object' ? data : {}
      return {
        items: (Array.isArray(raw.items) ? raw.items : []).map(item => ({
          id: toText(item.id),
          name: toText(item.name),
          categories: toTextArray(item.categories),
          teachers: toTextArray(item.teachers)
        })),
        total: toCount(raw.total)
      }
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
      if (isReference) return unavailableReferenceResult()
      return mapReviewGroupList(await client.get('/review-groups'))
    },
    async getReviewGroup(groupKey) {
      if (isReference) {
        const error = new Error('本地参考服务未提供公开评价分组。')
        error.code = 'REFERENCE_MOCK_UNAVAILABLE'
        throw error
      }
      return mapReviewGroup(await client.get(`/review-groups/${encodePathSegment(groupKey)}`, undefined, { auth: 'optional' }), true)
    },
    async getCourseReviewGroups(course = {}) {
      if (isReference) return []
      const groups = Array.isArray(course.teacher_groups) ? course.teacher_groups : []
      return Promise.all(groups.filter(group => group && group.group_key).map(async group => (
        mapReviewGroup(await client.get(`/review-groups/${encodePathSegment(group.group_key)}`, undefined, { auth: 'optional' }), true)
      )))
    },
    async setReviewReaction(reviewId, reaction) {
      if (isReference) return authenticatedFeatureUnavailable()
      const normalized = reaction === 'up' ? 'up' : null
      const data = await client.put(`/reviews/${encodePathSegment(reviewId)}/reaction`, { reaction: normalized }, { auth: 'required' })
      return {
        review_id: toText(data && data.review_id),
        helpful_count: toCount(data && data.helpful_count),
        viewer_reaction: data && data.viewer_reaction === 'up' ? 'up' : null
      }
    },
    async searchCourses(keyword, options = {}) {
      const result = mapCourseList(await client.get('/courses', courseQuery({ ...options, q: keyword })))
      return { ...result, items: result.items.map(mapCourseSearchItem) }
    },
    async loginWechat(code) {
      if (isReference) return authenticatedFeatureUnavailable()
      return mapAuthResult(await client.post('/auth/wechat', { code: toText(code) }))
    },
    async getMe() {
      if (isReference) return authenticatedFeatureUnavailable()
      const data = await client.get('/me', undefined, { auth: 'required' })
      return mapUser(data && data.user)
    },
    async updateProfile(input = {}) {
      if (isReference) return authenticatedFeatureUnavailable()
      const data = await client.post('/me/profile', {
        nickname: toText(input.nickname).slice(0, 32),
        ...(input.avatar_url === undefined ? {} : { avatar_url: validatePublicHttpsUrl(input.avatar_url) })
      }, { auth: 'required' })
      return mapUser(data && data.user)
    },
    async setWebPassword(password) {
      if (isReference) return authenticatedFeatureUnavailable()
      const value = password == null ? '' : String(password)
      const data = await client.post('/me/web-password', { password: value }, { auth: 'required' })
      return { ok: data && data.ok === true }
    },
    async deleteMyAccount() {
      if (isReference) return authenticatedFeatureUnavailable()
      const data = await client.post('/me/delete-account', undefined, { auth: 'required' })
      return { deleted: data && data.deleted === true, note: toText(data && data.note) }
    },
    async logout() {
      if (isReference) return authenticatedFeatureUnavailable()
      const data = await client.post('/auth/logout', undefined, { auth: 'required' })
      return { revoked: data && data.revoked === true }
    },
    async getFavorites(query = {}) {
      if (isReference) return authenticatedFeatureUnavailable()
      return mapFavoriteList(await client.get('/me/favorites', {
        page: toPositiveInteger(query.page, 1, 1000000),
        page_size: toPositiveInteger(query.page_size, 20, 100)
      }, { auth: 'required' }))
    },
    async addFavorite(courseId) {
      if (isReference) return authenticatedFeatureUnavailable()
      const data = await client.post('/favorites', { course_id: toText(courseId) }, { auth: 'required' })
      return { favorited: data && data.favorited === true, created: data && data.created === true, total: toCount(data && data.total) }
    },
    async removeFavorite(courseId) {
      if (isReference) return authenticatedFeatureUnavailable()
      const data = await client.delete(`/favorites/${encodePathSegment(courseId)}`, undefined, { auth: 'required' })
      return { favorited: false, removed: data && data.removed === true, total: toCount(data && data.total) }
    },
    async getMyReviews(query = {}) {
      if (isReference) return authenticatedFeatureUnavailable()
      return mapMyReviewList(await client.get('/me/reviews', {
        page: toPositiveInteger(query.page, 1, 1000000),
        page_size: toPositiveInteger(query.page_size, 20, 100)
      }, { auth: 'required' }))
    },
    async getMyFeedback(query = {}) {
      if (isReference) return authenticatedFeatureUnavailable()
      return mapMyFeedbackList(await client.get('/me/feedback', {
        page: toPositiveInteger(query.page, 1, 1000000),
        page_size: toPositiveInteger(query.page_size, 20, 100)
      }, { auth: 'required' }))
    },
    async submitReview(input = {}) {
      if (isReference) {
        const error = new Error('本地参考服务未提供评价提交。')
        error.code = 'REFERENCE_MOCK_UNAVAILABLE'
        throw error
      }
      return client.post('/reviews', {
        course_id: toText(input.course_id),
        teacher: toText(input.teacher),
        rating: toCount(input.rating),
        tags: toTextArray(input.tags),
        body: toText(input.body),
        anonymous: input.anonymous === true
      }, { auth: 'optional' })
    },
    validateResourceDownloadUrl,
    isAllowedResourceDownloadUrl(value) { return Boolean(validateResourceDownloadUrl(value)) },
    validatePublicHttpsUrl,
    isAllowedPublicHttpsUrl(value) { return Boolean(validatePublicHttpsUrl(value)) }
  }
}

const publicApi = createPublicApi()

module.exports = Object.assign(publicApi, {
  publicApi,
  RESOURCE_DOWNLOAD_HOST,
  COURSE_QUERY_KEYS,
  GUIDE_QUERY_KEYS,
  GUIDE_CATEGORIES,
  buildCourseQuery,
  buildDevelopCourseQuery,
  buildGuidesQuery,
  encodePathSegment,
  validateResourceDownloadUrl,
  validatePublicHttpsUrl,
  mapCourse,
  mapCourseList,
  mapHome,
  mapSearchIndexItem,
  mapSearchIndex,
  mapGuideSummary,
  mapGuideList,
  mapGuide,
  mapResource,
  mapCourseResources,
  mapReviewGroup,
  mapReviewGroupList,
  mapUser,
  mapAuthResult,
  mapFavoriteItem,
  mapFavoriteList,
  mapMyReview,
  mapMyReviewList,
  mapMyFeedback,
  mapMyFeedbackList,
  mapCourseSearchItem,
  createPublicApi,
  adaptCourse: mapCourse,
  adaptCourseList: mapCourseList,
  adaptHome: mapHome,
  adaptResourceList: mapCourseResources,
  adaptReviewGroup: mapReviewGroup,
  allowedCourseQuery: buildCourseQuery
})
