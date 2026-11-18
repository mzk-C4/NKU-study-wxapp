/**
 * NKUStudy 常量定义
 */

// 错误类型
const ERROR_TYPES = {
  NETWORK: 'network',       // 网络失败
  TIMEOUT: 'timeout',       // 接口超时
  NOT_FOUND: 'not_found',   // 无资料/课程不存在
  LINK_EXPIRED: 'expired',  // 链接失效
  SERVER: 'server',         // 服务器错误
  UNKNOWN: 'unknown'        // 未知错误
}

// 错误提示文案
const ERROR_MESSAGES = {
  network: '网络连接失败，请检查网络后重试',
  timeout: '请求超时，请稍后重试',
  not_found: '暂无资料',
  expired: '该资源链接已失效',
  server: '服务器繁忙，请稍后重试',
  unknown: '出错了，请重试'
}

// 空状态文案
const EMPTY_TEXTS = {
  noResource: '该课程还没有资料',
  noSubmission: '暂无投稿记录',
  noResult: '没有找到匹配的资料'
}

// 隐私提示文案 (HXR-04)
const PRIVACY_NOTICE = '请先删除资料中的姓名、学号等个人信息，并确认拥有分享权限。'

// 详情页提示文案 (HXR-03)
const DETAIL_NOTICE = '点击主按钮后复制分享链接与提取码，再前往对应网盘打开。'

// 草稿存储 key
const DRAFT_KEY = 'hxr_resource_draft'

// 指南针 AI（HXR-COMPASS）
const COMPASS_DRAFT_KEY = 'hxr_compass_draft' // 搜索词带入问答页的草稿
const COMPASS_THEME_KEY = 'hxr_compass_theme' // 浅色/深色
const COMPASS_FONT_KEY = 'hxr_compass_large'  // 大字体

module.exports = {
  ERROR_TYPES,
  ERROR_MESSAGES,
  EMPTY_TEXTS,
  PRIVACY_NOTICE,
  DETAIL_NOTICE,
  DRAFT_KEY,
  COMPASS_DRAFT_KEY,
  COMPASS_THEME_KEY,
  COMPASS_FONT_KEY
}
