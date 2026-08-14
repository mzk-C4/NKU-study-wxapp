function round(value) {
  return value == null ? null : Math.round(value * 10) / 10
}

function average(items, key) {
  const values = items.map(item => item[key]).filter(value => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite)
  if (!values.length) return null
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function termLabel(offering) {
  if (!offering) return '学期待补充'
  return offering.term || offering.source_term || offering.semester || '学期待补充'
}

function offeringView(data, offering) {
  const teacher = data.teachers.find(item => item.id === offering.teacher_id)
  const reviewCount = data.reviews.filter(item => item.offering_id === offering.id && item.status === 'published').length
  const teacherName = teacher ? teacher.name : '教师待补充'
  const { academic_year, semester, campus, ...publicOffering } = offering
  return {
    ...publicOffering,
    teacher_name: teacherName,
    teacher_name_short: teacherName.slice(0, 1),
    display_name: teacherName,
    review_count: reviewCount
  }
}

function legacyCourseId(data, review) {
  const offering = review.offering_id && data.offerings.find(item => item.id === review.offering_id)
  return offering?.course_id || null
}

function courseReviews(data, courseId) {
  return data.reviews.filter(review => {
    if (review.status !== 'published') return false
    return review.course_id === courseId || legacyCourseId(data, review) === courseId
  })
}

function teacherGroups(data, course) {
  const groups = new Map()
  for (const review of courseReviews(data, course.id)) {
    const legacyOffering = review.offering_id && data.offerings.find(item => item.id === review.offering_id)
    const legacyTeacher = legacyOffering && data.teachers.find(item => item.id === legacyOffering.teacher_id)
    const teacherName = review.teacher || legacyTeacher?.name || '教师待补充'
    const key = teacherName
    if (!groups.has(key)) {
      groups.set(key, {
        id: review.review_group_id || legacyOffering?.id || `teacher:${teacherName}`,
        course_id: course.id,
        teacher_name: teacherName,
        teacher_name_short: teacherName.slice(0, 1),
        display_name: teacherName,
        review_count: 0
      })
    }
    groups.get(key).review_count += 1
  }
  return Array.from(groups.values()).sort((a, b) => b.review_count - a.review_count || a.teacher_name.localeCompare(b.teacher_name, 'zh-CN'))
}

function ratingsView(reviews) {
  const showAggregate = reviews.length >= 3
  const normalized = reviews.map(review => ({ rating: review.rating ?? review.recommend }))
  const rating = showAggregate ? average(normalized, 'rating') : null
  return { show_aggregate: showAggregate, average: rating, rating, recommend: rating }
}

function courseView(data, course, includeDetails = false) {
  const resources = data.resources.filter(item => item.course_id === course.id && item.status === 'published')
  const reviews = courseReviews(data, course.id)
  const groups = teacherGroups(data, course)
  const base = {
    ...course,
    resource_count: resources.length,
    review_count: reviews.length,
    offering_count: groups.length,
    ratings: ratingsView(reviews)
  }
  return includeDetails ? { ...base, teacher_groups: groups, offerings: groups } : base
}

function resourceView(data, resource, includeSensitive = false) {
  const course = data.courses.find(item => item.id === resource.course_id)
  const { academic_year, semester, campus, offering_id, ...publicResource } = resource
  const base = {
    ...publicResource,
    course_name: course ? course.name : '课程待补充',
    term_label: resource.source_term || course?.term || course?.recommended_stage || '',
    size_label: resource.size_label || '大小未知',
    contributor: resource.contributor || '匿名同学'
  }
  if (!includeSensitive) {
    const { share_url, extraction_code, ...listView } = base
    return listView
  }
  return base
}

function reviewView(data, review) {
  const offering = review.offering_id && data.offerings.find(item => item.id === review.offering_id)
  const legacyTeacher = offering && data.teachers.find(item => item.id === offering.teacher_id)
  const courseId = review.course_id || offering?.course_id || null
  const course = courseId && data.courses.find(item => item.id === courseId)
  return {
    id: review.id,
    course_id: courseId,
    course_name: review.course_title || course?.name || '课程待补充',
    teacher_name: review.teacher || legacyTeacher?.name || '教师待补充',
    teacher_group_id: review.review_group_id || offering?.id || null,
    term_label: course?.term || course?.recommended_stage || '',
    rating: review.rating ?? review.recommend,
    tags: review.tags || [],
    body: review.body,
    anonymous: true,
    helpful_count: review.helpful_count || 0,
    status: review.status,
    created_at: review.created_at
  }
}

function guideView(data, guide, includeDetails = false) {
  const base = { ...guide }
  if (!includeDetails) {
    const { steps, related_course_ids, ...summary } = base
    return summary
  }
  return {
    ...base,
    steps: (guide.steps || []).map((step, index) => typeof step === 'string' ? { title: `第 ${index + 1} 步`, body: step } : step),
    related_courses: (guide.related_course_ids || []).map(id => data.courses.find(course => course.id === id)).filter(Boolean).map(course => ({ id: course.id, name: course.name }))
  }
}

function buildSearchIndex(data) {
  const items = []
  data.courses.filter(course => course.status === 'published').forEach(course => {
    const teachers = teacherGroups(data, course).map(group => group.teacher_name)
    items.push({ id: course.id, type: 'course', type_label: '课', badge: course.category_name || course.scope || course.requirement_type || course.category_code, name: course.name, aliases: course.aliases || [], tags: course.tags || [], teachers, search_text: [course.name, ...(course.aliases || []), ...(course.tags || []), ...teachers].join(' '), subtitle: [course.term || course.recommended_stage, course.department].filter(Boolean).join(' · ') })
  })
  const seenTeachers = new Set()
  for (const course of data.courses) {
    for (const group of teacherGroups(data, course)) {
      const key = `${course.id}\u0000${group.teacher_name}`
      if (seenTeachers.has(key)) continue
      seenTeachers.add(key)
      items.push({ id: group.id, course_id: course.id, type: 'teacher', type_label: '师', badge: '师', name: group.teacher_name, aliases: [], tags: [], teachers: [group.teacher_name], search_text: `${group.teacher_name} ${course.name}`, subtitle: `评价课程：${course.name}` })
    }
  }
  data.resources.filter(item => item.status === 'published').forEach(resource => {
    const course = data.courses.find(item => item.id === resource.course_id)
    items.push({ id: resource.id, course_id: resource.course_id, type: 'resource', type_label: '资', badge: '资', name: resource.title, aliases: [], tags: [resource.type, ...(course ? course.tags : [])], teachers: [], search_text: `${resource.title} ${resource.type} ${course ? course.name : ''}`, subtitle: `${course ? course.name : '课程待补充'} · ${resource.type}` })
  })
  data.guides.filter(item => item.status === 'published').forEach(guide => items.push({ id: guide.id, type: 'guide', type_label: '指', badge: '指', name: guide.title, aliases: [], tags: [guide.category], teachers: [], search_text: `${guide.title} ${guide.category} ${guide.summary}`, subtitle: `${guide.category} · 约 ${guide.read_minutes} 分钟` }))
  return items
}

module.exports = { courseView, courseReviews, teacherGroups, offeringView, resourceView, reviewView, guideView, buildSearchIndex, termLabel }
