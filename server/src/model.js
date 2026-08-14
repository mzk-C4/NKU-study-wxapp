function round(value) {
  return value == null ? null : Math.round(value * 10) / 10
}

function average(items, key) {
  if (!items.length) return null
  return round(items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length)
}

function termLabel(offering) {
  if (!offering) return '学期未知'
  const labels = { fall: '秋', spring: '春', summer: '夏' }
  return `${offering.academic_year} ${labels[offering.semester] || offering.semester}`
}

function offeringView(data, offering) {
  const teacher = data.teachers.find(item => item.id === offering.teacher_id)
  const reviewCount = data.reviews.filter(item => item.offering_id === offering.id && item.status === 'published').length
  const teacherName = teacher ? teacher.name : '教师待补充'
  return {
    ...offering,
    teacher_name: teacherName,
    teacher_name_short: teacherName.slice(0, 1),
    semester_label: { fall: '秋', spring: '春', summer: '夏' }[offering.semester] || offering.semester,
    display_name: `${teacherName} · ${termLabel(offering)}`,
    review_count: reviewCount
  }
}

function courseReviews(data, courseId) {
  const offeringIds = new Set(data.offerings.filter(item => item.course_id === courseId).map(item => item.id))
  return data.reviews.filter(item => offeringIds.has(item.offering_id) && item.status === 'published')
}

function ratingsView(reviews) {
  const showAggregate = reviews.length >= 3
  return {
    show_aggregate: showAggregate,
    recommend: showAggregate ? average(reviews, 'recommend') : null,
    difficulty: showAggregate ? average(reviews, 'difficulty') : null,
    workload: showAggregate ? average(reviews, 'workload') : null,
    gain: showAggregate ? average(reviews, 'gain') : null
  }
}

function courseView(data, course, includeDetails = false) {
  const resources = data.resources.filter(item => item.course_id === course.id && item.status === 'published')
  const reviews = courseReviews(data, course.id)
  const offerings = data.offerings.filter(item => item.course_id === course.id).map(item => offeringView(data, item))
  const base = {
    ...course,
    resource_count: resources.length,
    review_count: reviews.length,
    offering_count: offerings.length,
    ratings: ratingsView(reviews)
  }
  return includeDetails ? { ...base, offerings } : base
}

function resourceView(data, resource, includeSensitive = false) {
  const course = data.courses.find(item => item.id === resource.course_id)
  const offering = resource.offering_id ? data.offerings.find(item => item.id === resource.offering_id) : null
  const base = {
    ...resource,
    course_name: course ? course.name : '课程待补充',
    term_label: resource.academic_year ? `${resource.academic_year} ${{ fall: '秋', spring: '春', summer: '夏' }[resource.semester] || ''}`.trim() : termLabel(offering),
    size_label: resource.size_label || '大小未知',
    contributor: resource.contributor || '匿名同学'
  }
  if (!includeSensitive) {
    const { share_url, extraction_code, ...publicBase } = base
    return publicBase
  }
  return base
}

function reviewView(data, review) {
  const offering = data.offerings.find(item => item.id === review.offering_id)
  const teacher = offering ? data.teachers.find(item => item.id === offering.teacher_id) : null
  const course = offering ? data.courses.find(item => item.id === offering.course_id) : null
  return {
    id: review.id,
    offering_id: review.offering_id,
    course_id: course ? course.id : null,
    course_name: course ? course.name : '课程待补充',
    teacher_name: teacher ? teacher.name : '教师待补充',
    term_label: termLabel(offering),
    difficulty: review.difficulty,
    workload: review.workload,
    gain: review.gain,
    recommend: review.recommend,
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
    const offerings = data.offerings.filter(item => item.course_id === course.id)
    const teachers = offerings.map(offering => data.teachers.find(teacher => teacher.id === offering.teacher_id)).filter(Boolean).map(teacher => teacher.name)
    items.push({ id: course.id, type: 'course', type_label: '课', badge: course.category_code, name: course.name, aliases: course.aliases || [], tags: course.tags || [], teachers, search_text: [course.name, ...(course.aliases || []), ...(course.tags || []), ...teachers].join(' '), subtitle: `${course.department} · ${course.requirement_type}` })
  })
  data.teachers.forEach(teacher => {
    const offering = data.offerings.find(item => item.teacher_id === teacher.id)
    const course = offering && data.courses.find(item => item.id === offering.course_id)
    items.push({ id: teacher.id, course_id: course && course.id, type: 'teacher', type_label: '师', badge: '师', name: teacher.name, aliases: [], tags: teacher.tags || [], teachers: [teacher.name], search_text: `${teacher.name} ${(teacher.tags || []).join(' ')}`, subtitle: course ? `教授课程：${course.name}` : teacher.department })
  })
  data.resources.filter(item => item.status === 'published').forEach(resource => {
    const course = data.courses.find(item => item.id === resource.course_id)
    items.push({ id: resource.id, course_id: resource.course_id, type: 'resource', type_label: '资', badge: '资', name: resource.title, aliases: [], tags: [resource.type, ...(course ? course.tags : [])], teachers: [], search_text: `${resource.title} ${resource.type} ${course ? course.name : ''}`, subtitle: `${course ? course.name : '课程待补充'} · ${resource.type}` })
  })
  data.guides.filter(item => item.status === 'published').forEach(guide => items.push({ id: guide.id, type: 'guide', type_label: '指', badge: '指', name: guide.title, aliases: [], tags: [guide.category], teachers: [], search_text: `${guide.title} ${guide.category} ${guide.summary}`, subtitle: `${guide.category} · 约 ${guide.read_minutes} 分钟` }))
  return items
}

module.exports = { courseView, offeringView, resourceView, reviewView, guideView, buildSearchIndex, termLabel }
