const { createHash } = require('node:crypto')

class AdapterValidationError extends Error {
  constructor(issues) {
    super(`Website data cannot be published: ${issues.length} mapping issue(s)`)
    this.name = 'AdapterValidationError'
    this.issues = issues
  }
}

const clean = value => String(value ?? '').trim()

function stableId(namespace, ...parts) {
  const source = parts.map(clean).join('\u0000')
  const digest = createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 16)
  return `${namespace}_web_${digest}`
}

function encodePath(value) {
  return clean(value).split('/').filter(Boolean).map(part => encodeURIComponent(part)).join('/')
}

function joinPublicUrl(root, ...parts) {
  const base = `${clean(root).replace(/\/+$/, '')}/`
  return `${base}${parts.map(encodePath).filter(Boolean).join('/')}`
}

function formatBytes(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function unique(values) {
  return Array.from(new Set(values.map(clean).filter(Boolean)))
}

function extensionOf(pathname) {
  const match = clean(pathname).match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toUpperCase() : ''
}

function resourceType(sectionTitle, extension) {
  const title = clean(sectionTitle)
  if (/试题|真题|试卷|考试/.test(title)) return '试卷'
  if (/答案|解析/.test(title)) return '答案'
  if (/课件|PPT|讲义/.test(title)) return '课件'
  if (/大纲/.test(title)) return '大纲'
  if (/作业/.test(title)) return '作业'
  return extension || '其他'
}

function adaptWebsiteData({ manifest, reviews = [], catalogMetadata = {}, guides = [] }, options = {}) {
  const strict = options.strict !== false
  const issues = []
  const allowedResourceHosts = options.allowedResourceHosts || ['resources.nkustudy.top']
  try {
    const resourceRoot = new URL(clean(manifest?.resourceRoot))
    if (resourceRoot.protocol !== 'https:' || !allowedResourceHosts.includes(resourceRoot.hostname)) {
      issues.push({ severity: 'error', code: 'RESOURCE_ROOT_NOT_ALLOWED', message: '资源根地址必须使用 HTTPS 且位于受控域名。' })
    }
  } catch {
    issues.push({ severity: 'error', code: 'RESOURCE_ROOT_NOT_ALLOWED', message: '资源根地址无效。' })
  }

  const sourceCourses = Array.isArray(manifest?.courses) ? manifest.courses : []
  const sourceReviews = (Array.isArray(reviews) ? reviews : []).filter(review => !review?.hidden && ['approved', '通过'].includes(clean(review?.status)))
  const courseByTitle = new Map()
  const courseIds = new Set()
  const courses = []
  const resources = []

  for (const source of sourceCourses) {
    const sourceId = clean(source.id || source.title)
    const metadata = catalogMetadata[sourceId] || {}
    const id = stableId('course', sourceId)
    if (courseIds.has(id)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_COURSE_ID', source_id: sourceId, message: '课程源 ID 重复。' })
      continue
    }
    courseIds.add(id)
    const title = clean(source.title || sourceId)
    courseByTitle.set(title, id)
    courses.push({
      id,
      source_id: sourceId,
      slug: clean(metadata.slug) || id,
      name: title,
      aliases: unique(metadata.aliases || []),
      category_name: clean(source.group),
      category_code: /^[A-E]$/.test(clean(metadata.category_code).toUpperCase()) ? clean(metadata.category_code).toUpperCase() : null,
      term: clean(source.term),
      tags: unique(source.tags || []),
      extra_tags: unique(metadata.extra_tags || []),
      department: clean(metadata.department),
      scope: clean(source.group),
      recommended_stage: clean(source.term),
      description: clean(source.summary),
      status: metadata.status === 'draft' ? 'draft' : 'published',
      source_updated_at: clean(source.updated),
      created_at: clean(metadata.created_at) || null,
      updated_at: clean(source.updated) || clean(manifest?.updated) || null
    })

    for (const section of source.sections || []) {
      for (const file of section.files || []) {
        if (`${clean(file?.title)}/${clean(file?.path)}`.toLowerCase().includes('.openlist')) continue
        const extension = extensionOf(file.path || file.title)
        resources.push({
          id: stableId('resource', sourceId, section.title, file.path || file.title),
          course_id: id,
          type: resourceType(section.title, extension),
          source_section: clean(section.title),
          source_term: clean(source.term),
          title: clean(file.title || file.path),
          description: clean(file.description || section.note),
          storage_provider: 'NKUStudy object storage',
          share_url: joinPublicUrl(manifest?.resourceRoot, source.basePath, file.path),
          extraction_code: '',
          extension,
          size_label: formatBytes(file.size),
          contributor: unique(source.contributors || []).join('、'),
          status: 'published',
          created_at: null,
          updated_at: clean(source.updated) || clean(manifest?.updated) || null
        })
      }
    }
  }

  const mappedReviews = sourceReviews.map(sourceReview => {
    const courseTitle = clean(sourceReview.courseTitle)
    const teacher = clean(sourceReview.teacher)
    const rating = Number(sourceReview.rating)
    return {
      id: clean(sourceReview.id) || stableId('review', courseTitle, teacher, sourceReview.createdAt, sourceReview.content),
      user_id: null,
      course_id: courseByTitle.get(courseTitle) || null,
      course_title: courseTitle,
      teacher,
      review_group_id: stableId('review_group', courseTitle, teacher),
      rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, rating)) : null,
      tags: [],
      body: clean(sourceReview.content),
      anonymous: true,
      status: 'published',
      helpful_count: 0,
      created_at: clean(sourceReview.createdAt) || null,
      updated_at: clean(sourceReview.updatedAt || sourceReview.createdAt) || null
    }
  })

  const blockingIssues = issues.filter(issue => issue.severity === 'error')
  if (strict && blockingIssues.length) throw new AdapterValidationError(blockingIssues)
  return {
    data: {
      courses,
      teachers: [],
      offerings: [],
      resources,
      reviews: mappedReviews,
      guides: Array.isArray(guides) ? guides : []
    },
    report: {
      source_updated_at: clean(manifest?.updated) || null,
      counts: { courses: courses.length, resources: resources.length, reviews: mappedReviews.length, guides: Array.isArray(guides) ? guides.length : 0 },
      unmatched_review_count: mappedReviews.filter(review => !review.course_id).length,
      issues,
      contract_notes: [
        { code: 'SERVER_CATEGORY_REUSED', message: '课程分组、学期和标签直接使用网站字段。' },
        { code: 'WEBSITE_REVIEW_GROUPS_REUSED', message: '教师沿用网站做法，作为评价中的文本，并按课程名 + 教师名分组。' },
        { code: 'UNMATCHED_REVIEWS_ARE_VALID', message: '课程清单外的公开评价正常保留，不视为映射错误。' },
        { code: 'SINGLE_RATING_REUSED', message: 'rating 直接使用网站单一评分，不生成四维评分。' },
        { code: 'ACADEMIC_YEAR_AND_CAMPUS_OMITTED', message: 'API 不提供学年和校区字段。' },
        { code: 'GUIDE_SOURCE_MISSING', message: '网站当前没有独立 Guide 数据源，本地指南仅可作为静态占位内容。' }
      ]
    }
  }
}

module.exports = { AdapterValidationError, adaptWebsiteData, stableId }
