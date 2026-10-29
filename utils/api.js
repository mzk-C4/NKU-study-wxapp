/**
 * NKUStudy API 工具层
 * 负责: 资料列表、投稿、失效反馈等接口调用 (HXR-07)
 */

const config = require('../config/index')

const { API_BASE_URL, REQUEST_TIMEOUT, MOCK_MODE } = config

/**
 * 封装 wx.request 为 Promise
 */
function request(options) {
  const { url, method = 'GET', data = {}, header = {} } = options
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE_URL + url,
      method,
      data,
      header: Object.assign({ 'Content-Type': 'application/json' }, header),
      timeout: REQUEST_TIMEOUT,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const body = res.data
          if (body.code === 0 || body.code === '0') {
            resolve(body.data)
          } else {
            reject({
              type: 'api_error',
              code: body.code,
              message: body.message || '接口返回错误'
            })
          }
        } else if (res.statusCode === 401) {
          reject({ type: 'unauthorized', message: '登录已过期，请重新登录' })
        } else if (res.statusCode === 404) {
          reject({ type: 'not_found', message: '资源不存在' })
        } else if (res.statusCode === 429) {
          reject({ type: 'rate_limited', message: '操作过于频繁，请稍后再试' })
        } else {
          reject({ type: 'server', message: '服务器繁忙，请稍后重试' })
        }
      },
      fail(err) {
        const msg = err.errMsg || ''
        if (msg.includes('timeout')) {
          reject({ type: 'timeout', message: '请求超时，请稍后重试' })
        } else {
          reject({ type: 'network', message: '网络连接失败，请检查网络后重试' })
        }
      }
    })
  })
}

// ===== 资料相关 API =====

/**
 * 获取课程资源列表 (HXR-01)
 * GET /api/v1/courses/:courseUid/resources
 * @param {string} courseUid - 课程UUID
 * @returns {Promise<{course_id, items, total}>}
 */
function getCourseResources(courseUid) {
  return request({
    url: `/courses/${courseUid}/resources`,
    method: 'GET'
  })
}

// ===== 投稿相关 API =====

/**
 * 提交资料投稿 (HXR-04)
 * POST /api/v1/resource-submissions
 * @param {Object} payload - 投稿数据
 * @param {string} payload.course_id - 课程ID
 * @param {string} payload.title - 资料标题
 * @param {string} payload.type - 资料类型
 * @param {string} payload.platform - 网盘平台
 * @param {string} payload.url - 分享链接
 * @param {string} payload.code - 提取码(选填)
 * @param {string} payload.description - 补充说明(选填)
 * @returns {Promise<{submitted, pending}>}
 */
function submitResource(payload) {
  return request({
    url: '/resource-submissions',
    method: 'POST',
    data: payload
  })
}

/**
 * 获取我的投稿列表 (HXR-05)
 * GET /api/v1/me/submissions
 * @param {Object} params - { page, page_size }
 * @returns {Promise<{items, total, page, page_size}>}
 */
function getMySubmissions(params = {}) {
  return request({
    url: '/me/submissions',
    method: 'GET',
    data: { page: 1, page_size: 20, ...params }
  })
}

// ===== 失效反馈 API =====

/**
 * 反馈链接失效 (HXR-03)
 * POST /api/v1/resources/:resourceId/reports
 * @param {string} resourceId - 资源ID
 * @param {string} reason - 反馈原因
 * @returns {Promise<{reported}>}
 */
function reportResource(resourceId, reason = '') {
  return request({
    url: `/resources/${resourceId}/reports`,
    method: 'POST',
    data: { reason }
  })
}

// ===== 模拟数据 (API未开放时使用) =====

const MOCK_RESOURCES = [
  {
    id: 'res-001',
    course_id: 'course-demo',
    course_name: '概率论与数理统计',
    title: '2025 秋期中试题（回忆版）',
    size: 2936012,
    size_label: '2.8 MB',
    description: '期中考试回忆版试题',
    section: '往年真题',
    type: '试卷',
    term_label: '2025-2026 秋',
    extension: 'PDF',
    download_url: 'https://resources.nkustudy.top/demo/res-001.pdf',
    platform: '夸克网盘',
    link_status: 'ok',
    contributor: '匿名同学',
    updated_ago: '3 天前'
  },
  {
    id: 'res-002',
    course_id: 'course-demo',
    course_name: '概率论与数理统计',
    title: '第一至四章复习笔记',
    size: 6396313,
    size_label: '6.1 MB',
    description: '前四章重点复习笔记',
    section: '复习笔记',
    type: '笔记',
    term_label: '2025-2026 秋',
    extension: 'PDF',
    download_url: 'https://resources.nkustudy.top/demo/res-002.pdf',
    platform: '百度网盘',
    link_status: 'ok',
    contributor: '匿名同学',
    updated_ago: '32 人收藏'
  },
  {
    id: 'res-003',
    course_id: 'course-demo',
    course_name: '概率论与数理统计',
    title: '习题课重点题型整理',
    size: 4613734,
    size_label: '4.4 MB',
    description: '习题课重点题型',
    section: '作业',
    type: '作业',
    term_label: '2025-2026 秋',
    extension: 'PDF',
    download_url: 'https://resources.nkustudy.top/demo/res-003.pdf',
    platform: '阿里云盘',
    link_status: 'ok',
    contributor: '匿名同学',
    updated_ago: '最近更新'
  },
  {
    id: 'res-004',
    course_id: 'course-demo',
    course_name: '概率论与数理统计',
    title: '历年期末试题与参考答案',
    size: 19495424,
    size_label: '18.6 MB',
    description: '2021-2024历年期末试题',
    section: '往年真题',
    type: '试卷',
    term_label: '2021-2024',
    extension: 'ZIP',
    download_url: 'https://resources.nkustudy.top/demo/res-004.zip',
    platform: '夸克网盘',
    link_status: 'ok',
    contributor: '匿名同学',
    updated_ago: '2021-2024'
  }
]

const MOCK_SUBMISSIONS = [
  {
    id: 'sub-001',
    title: '2025 秋期中试题（回忆版）',
    course_name: '概率论与数理统计',
    type: '试卷',
    platform: '夸克网盘',
    status: 'pending',
    submitted_at: '2026-08-14 10:30',
    review_comment: ''
  },
  {
    id: 'sub-002',
    title: '线性代数课堂笔记',
    course_name: '线性代数',
    type: '笔记',
    platform: '百度网盘',
    status: 'approved',
    submitted_at: '2026-08-10 14:20',
    review_comment: '资料完整，通过审核。'
  },
  {
    id: 'sub-003',
    title: '数据结构课件 第三章',
    course_name: '数据结构',
    type: '课件',
    platform: '阿里云盘',
    status: 'revision',
    submitted_at: '2026-08-08 09:15',
    review_comment: '链接无法访问，请更新后重新提交。'
  }
]

/**
 * 模拟获取课程资源
 */
function mockGetCourseResources(courseUid) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        course_id: courseUid,
        items: MOCK_RESOURCES,
        total: MOCK_RESOURCES.length
      })
    }, 500)
  })
}

/**
 * 模拟提交投稿
 */
function mockSubmitResource(payload) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ submitted: true, pending: true })
    }, 500)
  })
}

/**
 * 模拟获取投稿列表
 */
function mockGetMySubmissions() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        items: MOCK_SUBMISSIONS,
        total: MOCK_SUBMISSIONS.length,
        page: 1,
        page_size: 20
      })
    }, 500)
  })
}

/**
 * 模拟反馈失效
 */
function mockReportResource(resourceId, reason) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ reported: true })
    }, 500)
  })
}

module.exports = {
  // 底层请求封装 (供 指南针 模块复用)
  request,

  // 真实接口
  getCourseResources: MOCK_MODE ? mockGetCourseResources : getCourseResources,
  submitResource: MOCK_MODE ? mockSubmitResource : submitResource,
  getMySubmissions: MOCK_MODE ? mockGetMySubmissions : getMySubmissions,
  reportResource: MOCK_MODE ? mockReportResource : reportResource,
  
  // 暴露模拟数据供开发调试
  _mockData: { MOCK_RESOURCES, MOCK_SUBMISSIONS }
}
