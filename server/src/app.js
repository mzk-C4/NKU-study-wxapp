const http = require('node:http')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { URL } = require('node:url')
const { JsonStore } = require('./store')
const { signToken, verifyToken, exchangeWechatCode } = require('./auth')
const { courseView, offeringView, resourceView, reviewView, guideView, buildSearchIndex } = require('./model')

class HttpError extends Error {
  constructor(status, message, code = status * 100) { super(message); this.status = status; this.code = code }
}

function send(res, status, data, message = 'ok', code = status >= 400 ? status * 100 : 0) {
  const body = JSON.stringify({ code, message, data })
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, x-admin-key', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' })
  res.end(body)
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk; if (body.length > limit) reject(new HttpError(413, '请求内容过大')) })
    req.on('end', () => {
      if (!body) return resolve({})
      try { resolve(JSON.parse(body)) } catch { reject(new HttpError(400, 'JSON 格式无效')) }
    })
    req.on('error', reject)
  })
}

function text(value, field, min = 0, max = 500) {
  const output = String(value == null ? '' : value).trim()
  if (output.length < min) throw new HttpError(400, `${field}至少需要 ${min} 个字符`)
  if (output.length > max) throw new HttpError(400, `${field}不能超过 ${max} 个字符`)
  return output
}

function score(value, field) {
  const output = Number(value)
  if (!Number.isInteger(output) || output < 1 || output > 5) throw new HttpError(400, `${field}必须是 1 至 5 的整数`)
  return output
}

function makeId(prefix) { return `${prefix}_${crypto.randomUUID()}` }
function now() { return new Date().toISOString() }
function routeParam(pathname, pattern) { const match = pathname.match(pattern); return match ? decodeURIComponent(match[1]) : null }

function paginate(items, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get('page_size') || 20)))
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize }
}

function createApp(options) {
  const config = {
    tokenSecret: options.tokenSecret,
    adminKey: options.adminKey || '',
    allowDevLogin: Boolean(options.allowDevLogin),
    wechatAppId: options.wechatAppId || '',
    wechatSecret: options.wechatSecret || ''
  }
  const store = new JsonStore({ dbPath: options.dbPath, seedPath: options.seedPath })

  function requireUser(req, data) {
    const authorization = req.headers.authorization || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    const userId = verifyToken(token, config.tokenSecret)
    const user = data.users.find(item => item.id === userId && item.status === 'active')
    if (!user) throw new HttpError(401, '请先微信登录', 40101)
    return user
  }

  function requireAdmin(req) {
    if (!config.adminKey) throw new HttpError(503, '管理功能未配置')
    if (req.headers['x-admin-key'] !== config.adminKey) throw new HttpError(401, '管理密钥无效')
  }

  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, x-admin-key', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' }); return res.end() }
    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname.replace(/\/$/, '') || '/'

    try {
      if ((pathname === '/admin' || pathname === '/admin/index.html') && req.method === 'GET') {
        const html = fs.readFileSync(options.adminPath)
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length })
        return res.end(html)
      }
      if (pathname === '/admin-logo' && req.method === 'GET') {
        const image = fs.readFileSync(options.adminLogoPath)
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': image.length, 'cache-control': 'public, max-age=86400' })
        return res.end(image)
      }
      if (pathname === '/health' && req.method === 'GET') return send(res, 200, { status: 'ok', time: now() })
      if (!pathname.startsWith('/api/v1')) throw new HttpError(404, '接口不存在')

      if (pathname === '/api/v1/home' && req.method === 'GET') {
        const data = store.read()
        const courses = data.courses.filter(item => item.status === 'published').map(item => courseView(data, item))
        const hotCourses = [...courses].sort((a, b) => (b.resource_count + b.review_count) - (a.resource_count + a.review_count)).slice(0, 4)
        const latest = [...data.resources].filter(item => item.status === 'published').sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 3).map(item => ({ id: item.id, title: item.title, summary: `${item.type} · ${data.courses.find(course => course.id === item.course_id)?.name || '课程待补充'}` }))
        return send(res, 200, { hot_courses: hotCourses, latest_updates: latest, selection_season: { title: '选课前先确认', summary: '培养方案、课程容量、时间冲突与退补选安排' } })
      }

      if (pathname === '/api/v1/courses' && req.method === 'GET') {
        const data = store.read()
        let courses = data.courses.filter(item => item.status === 'published').map(item => courseView(data, item))
        const query = String(url.searchParams.get('query') || '').trim().toLowerCase()
        const category = url.searchParams.get('category')
        const requirementType = url.searchParams.get('requirement_type')
        if (query) courses = courses.filter(item => [item.name, ...(item.aliases || []), ...(item.tags || [])].join(' ').toLowerCase().includes(query))
        if (category) courses = courses.filter(item => item.category_code === category)
        if (requirementType) courses = courses.filter(item => item.requirement_type === requirementType)
        const sort = url.searchParams.get('sort')
        if (sort === 'resources') courses.sort((a, b) => b.resource_count - a.resource_count)
        else if (sort === 'reviews') courses.sort((a, b) => b.review_count - a.review_count)
        else if (sort === 'updated') courses.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        else courses.sort((a, b) => (b.resource_count + b.review_count) - (a.resource_count + a.review_count))
        return send(res, 200, paginate(courses, url))
      }

      const courseResourceId = routeParam(pathname, /^\/api\/v1\/courses\/([^/]+)\/resources$/)
      if (courseResourceId && req.method === 'GET') {
        const data = store.read()
        if (!data.courses.some(item => item.id === courseResourceId && item.status === 'published')) throw new HttpError(404, '课程不存在')
        let resources = data.resources.filter(item => item.course_id === courseResourceId && item.status === 'published').map(item => resourceView(data, item))
        const type = url.searchParams.get('type'); if (type) resources = resources.filter(item => item.type === type)
        resources.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        return send(res, 200, { items: resources, total: resources.length })
      }

      const courseReviewId = routeParam(pathname, /^\/api\/v1\/courses\/([^/]+)\/reviews$/)
      if (courseReviewId && req.method === 'GET') {
        const data = store.read()
        const offerings = data.offerings.filter(item => item.course_id === courseReviewId).map(item => offeringView(data, item))
        const offeringIds = new Set(offerings.map(item => item.id))
        let reviews = data.reviews.filter(item => offeringIds.has(item.offering_id) && item.status === 'published').map(item => reviewView(data, item))
        const offeringId = url.searchParams.get('offering_id'); if (offeringId) reviews = reviews.filter(item => item.offering_id === offeringId)
        reviews.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        return send(res, 200, { items: reviews, total: reviews.length, offerings })
      }

      const courseId = routeParam(pathname, /^\/api\/v1\/courses\/([^/]+)$/)
      if (courseId && req.method === 'GET') {
        const data = store.read(); const course = data.courses.find(item => item.id === courseId && item.status === 'published')
        if (!course) throw new HttpError(404, '课程不存在')
        return send(res, 200, courseView(data, course, true))
      }

      if (pathname === '/api/v1/search-index' && req.method === 'GET') {
        const data = store.read(); return send(res, 200, { items: buildSearchIndex(data), generated_at: now() })
      }

      if (pathname === '/api/v1/guides' && req.method === 'GET') {
        const data = store.read(); let guides = data.guides.filter(item => item.status === 'published').map(item => guideView(data, item))
        const category = url.searchParams.get('category'); if (category) guides = guides.filter(item => item.category === category)
        return send(res, 200, { items: guides, total: guides.length })
      }

      const guideId = routeParam(pathname, /^\/api\/v1\/guides\/([^/]+)$/)
      if (guideId && req.method === 'GET') {
        const data = store.read(); const guide = data.guides.find(item => item.id === guideId && item.status === 'published')
        if (!guide) throw new HttpError(404, '指南不存在')
        return send(res, 200, guideView(data, guide, true))
      }

      const resourceReportId = routeParam(pathname, /^\/api\/v1\/resources\/([^/]+)\/reports$/)
      if (resourceReportId && req.method === 'POST') {
        const body = await readBody(req)
        const result = await store.mutate(data => {
          const user = requireUser(req, data)
          if (!data.resources.some(item => item.id === resourceReportId && item.status === 'published')) throw new HttpError(404, '资料不存在')
          const report = { id: makeId('report'), resource_id: resourceReportId, user_id: user.id, reason: text(body.reason || 'link_invalid', '原因', 1, 80), status: 'pending', created_at: now() }
          data.reports.push(report); return { id: report.id, status: report.status }
        })
        return send(res, 201, result)
      }

      const resourceId = routeParam(pathname, /^\/api\/v1\/resources\/([^/]+)$/)
      if (resourceId && req.method === 'GET') {
        const data = store.read(); const resource = data.resources.find(item => item.id === resourceId && item.status === 'published')
        if (!resource) throw new HttpError(404, '资料不存在')
        const view = resourceView(data, resource, true)
        view.related = data.resources.filter(item => item.course_id === resource.course_id && item.id !== resource.id && item.status === 'published').slice(0, 3).map(item => resourceView(data, item))
        return send(res, 200, view)
      }

      if (pathname === '/api/v1/auth/wechat' && req.method === 'POST') {
        const body = await readBody(req); const code = text(body.code, '微信登录凭证', 1, 256)
        const openid = await exchangeWechatCode(code, config)
        const user = await store.mutate(data => {
          let existing = data.users.find(item => item.openid === openid)
          if (!existing) { existing = { id: makeId('user'), openid, status: 'active', created_at: now(), updated_at: now() }; data.users.push(existing) }
          existing.updated_at = now(); return { id: existing.id, status: existing.status }
        })
        return send(res, 200, { token: signToken(user.id, config.tokenSecret), user })
      }

      if (pathname === '/api/v1/favorites' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await store.mutate(data => {
          const user = requireUser(req, data); const courseId = text(body.course_id, '课程编号', 1, 100)
          if (!data.courses.some(item => item.id === courseId && item.status === 'published')) throw new HttpError(404, '课程不存在')
          let favorite = data.favorites.find(item => item.user_id === user.id && item.course_id === courseId)
          if (!favorite) { favorite = { id: makeId('favorite'), user_id: user.id, course_id: courseId, created_at: now() }; data.favorites.push(favorite) }
          return { id: favorite.id, course_id: courseId }
        })
        return send(res, 201, result)
      }

      const favoriteCourseId = routeParam(pathname, /^\/api\/v1\/favorites\/([^/]+)$/)
      if (favoriteCourseId && req.method === 'DELETE') {
        const result = await store.mutate(data => { const user = requireUser(req, data); const before = data.favorites.length; data.favorites = data.favorites.filter(item => !(item.user_id === user.id && item.course_id === favoriteCourseId)); return { removed: before !== data.favorites.length } })
        return send(res, 200, result)
      }

      if (pathname === '/api/v1/resource-submissions' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await store.mutate(data => {
          const user = requireUser(req, data); const courseId = text(body.course_id, '课程编号', 1, 100)
          if (!data.courses.some(item => item.id === courseId && item.status === 'published')) throw new HttpError(404, '课程不存在')
          const shareUrl = text(body.share_url, '分享链接', 8, 1000); try { const parsed = new URL(shareUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error() } catch { throw new HttpError(400, '分享链接必须是有效的 HTTP 或 HTTPS 地址') }
          const submission = { id: makeId('submission'), user_id: user.id, course_id: courseId, title: text(body.title, '资料标题', 2, 120), type: text(body.type, '资料类型', 1, 30), storage_provider: text(body.storage_provider, '网盘平台', 1, 30), share_url: shareUrl, extraction_code: text(body.extraction_code, '提取码', 0, 20), description: text(body.description, '补充说明', 0, 500), academic_year: text(body.academic_year, '学年', 0, 20), semester: text(body.semester, '学期', 0, 20), status: 'pending', created_at: now(), updated_at: now() }
          data.submissions.push(submission); return { id: submission.id, status: submission.status }
        })
        return send(res, 201, result)
      }

      if (pathname === '/api/v1/reviews' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await store.mutate(data => {
          const user = requireUser(req, data); const offeringId = text(body.offering_id, '开课实例', 1, 100)
          if (!data.offerings.some(item => item.id === offeringId)) throw new HttpError(404, '开课实例不存在')
          if (data.reviews.some(item => item.user_id === user.id && item.offering_id === offeringId && ['pending', 'published'].includes(item.status))) throw new HttpError(409, '你已经评价过该开课实例')
          const review = { id: makeId('review'), user_id: user.id, offering_id: offeringId, difficulty: score(body.difficulty, '课程难度'), workload: score(body.workload, '作业量'), gain: score(body.gain, '收获程度'), recommend: score(body.recommend, '推荐程度'), tags: Array.isArray(body.tags) ? body.tags.slice(0, 8).map(item => text(item, '标签', 1, 20)) : [], body: text(body.body, '评价内容', 20, 800), anonymous: true, status: 'pending', helpful_count: 0, created_at: now(), updated_at: now() }
          data.reviews.push(review); return { id: review.id, status: review.status }
        })
        return send(res, 201, result)
      }

      if (pathname === '/api/v1/me/favorites' && req.method === 'GET') {
        const data = store.read(); const user = requireUser(req, data); const courseIds = new Set(data.favorites.filter(item => item.user_id === user.id).map(item => item.course_id)); const items = data.courses.filter(item => courseIds.has(item.id)).map(item => courseView(data, item)); return send(res, 200, { items, total: items.length })
      }
      if (pathname === '/api/v1/me/submissions' && req.method === 'GET') {
        const data = store.read(); const user = requireUser(req, data); const items = data.submissions.filter(item => item.user_id === user.id).map(item => ({ ...item, share_url: undefined, extraction_code: undefined, course_name: data.courses.find(course => course.id === item.course_id)?.name || '课程待补充' })); return send(res, 200, { items, total: items.length })
      }
      if (pathname === '/api/v1/me/reviews' && req.method === 'GET') {
        const data = store.read(); const user = requireUser(req, data); const items = data.reviews.filter(item => item.user_id === user.id).map(item => reviewView(data, item)); return send(res, 200, { items, total: items.length })
      }

      if (pathname.startsWith('/api/v1/admin')) {
        requireAdmin(req)
        if (pathname === '/api/v1/admin/summary' && req.method === 'GET') { const data = store.read(); return send(res, 200, { courses: data.courses.length, pending_submissions: data.submissions.filter(item => item.status === 'pending').length, pending_reviews: data.reviews.filter(item => item.status === 'pending').length }) }
        if (pathname === '/api/v1/admin/courses' && req.method === 'GET') { const data = store.read(); return send(res, 200, { items: data.courses.map(item => courseView(data, item)), total: data.courses.length }) }
        if (pathname === '/api/v1/admin/courses' && req.method === 'POST') {
          const body = await readBody(req); const result = await store.mutate(data => { const course = { id: makeId('course'), slug: text(body.slug || body.name, '课程别名', 1, 100).toLowerCase().replace(/\s+/g, '-'), name: text(body.name, '课程名称', 2, 100), aliases: Array.isArray(body.aliases) ? body.aliases.slice(0, 10) : [], category_code: text(body.category_code, 'A-E 分类', 1, 1).toUpperCase(), tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [], department: text(body.department, '学院', 0, 100), requirement_type: text(body.requirement_type, '课程属性', 0, 30), scope: text(body.scope, '课程范围', 0, 30), recommended_stage: text(body.recommended_stage, '建议修读阶段', 0, 40), description: text(body.description, '课程简介', 0, 1000), status: 'draft', created_at: now(), updated_at: now() }; if (!/^[A-E]$/.test(course.category_code)) throw new HttpError(400, 'A-E 分类无效'); data.courses.push(course); return course }); return send(res, 201, result)
        }
        const adminCourseId = routeParam(pathname, /^\/api\/v1\/admin\/courses\/([^/]+)$/)
        if (adminCourseId && req.method === 'PATCH') { const body = await readBody(req); const result = await store.mutate(data => { const course = data.courses.find(item => item.id === adminCourseId); if (!course) throw new HttpError(404, '课程不存在'); const allowed = ['name', 'aliases', 'category_code', 'tags', 'department', 'requirement_type', 'scope', 'recommended_stage', 'description', 'status']; allowed.forEach(key => { if (body[key] !== undefined) course[key] = body[key] }); if (!['draft', 'published', 'archived'].includes(course.status)) throw new HttpError(400, '课程状态无效'); if (!/^[A-E]$/.test(course.category_code)) throw new HttpError(400, 'A-E 分类无效'); course.updated_at = now(); return course }); return send(res, 200, result) }
        if (pathname === '/api/v1/admin/submissions' && req.method === 'GET') { const data = store.read(); return send(res, 200, { items: data.submissions.map(item => ({ ...item, course_name: data.courses.find(course => course.id === item.course_id)?.name || '课程待补充' })), total: data.submissions.length }) }
        const adminSubmissionId = routeParam(pathname, /^\/api\/v1\/admin\/submissions\/([^/]+)$/)
        if (adminSubmissionId && req.method === 'PATCH') { const body = await readBody(req); const result = await store.mutate(data => { const item = data.submissions.find(entry => entry.id === adminSubmissionId); if (!item) throw new HttpError(404, '投稿不存在'); if (!['approved', 'needs_changes', 'rejected'].includes(body.status)) throw new HttpError(400, '审核状态无效'); item.status = body.status; item.review_note = text(body.review_note, '审核说明', 0, 300); item.updated_at = now(); if (item.status === 'approved' && !item.resource_id) { const resource = { id: makeId('resource'), course_id: item.course_id, offering_id: null, type: item.type, title: item.title, description: item.description, academic_year: item.academic_year, semester: item.semester, storage_provider: item.storage_provider, share_url: item.share_url, extraction_code: item.extraction_code, extension: 'LINK', size_label: '网盘资料', contributor: '匿名同学', status: 'published', created_at: now(), updated_at: now() }; data.resources.push(resource); item.resource_id = resource.id } return item }); return send(res, 200, result) }
        if (pathname === '/api/v1/admin/reviews' && req.method === 'GET') { const data = store.read(); return send(res, 200, { items: data.reviews.map(item => reviewView(data, item)), total: data.reviews.length }) }
        const adminReviewId = routeParam(pathname, /^\/api\/v1\/admin\/reviews\/([^/]+)$/)
        if (adminReviewId && req.method === 'PATCH') { const body = await readBody(req); const result = await store.mutate(data => { const item = data.reviews.find(entry => entry.id === adminReviewId); if (!item) throw new HttpError(404, '评价不存在'); if (!['published', 'rejected', 'hidden'].includes(body.status)) throw new HttpError(400, '审核状态无效'); item.status = body.status; item.review_note = text(body.review_note, '审核说明', 0, 300); item.updated_at = now(); return reviewView(data, item) }); return send(res, 200, result) }
      }

      throw new HttpError(404, '接口不存在')
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof HttpError ? error.message : '服务器内部错误'
      if (!(error instanceof HttpError)) console.error(error)
      return send(res, status, null, message, error.code || 50000)
    }
  })
}

module.exports = { createApp }
