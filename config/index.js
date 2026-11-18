/**
 * NKUStudy 小程序配置
 * 模块: 资料与投稿 (feat/hxr-resource-flow)
 */

const app = getApp()

module.exports = {
  // API 基址
  API_BASE_URL: app ? app.globalData.API_BASE_URL : 'https://nkustudy.top/api/v1',
  
  // 资源下载域名
  RESOURCE_DOMAIN: 'https://resources.nkustudy.top',

  // 请求超时 (ms)
  REQUEST_TIMEOUT: 10000,

  // 是否使用模拟数据 (API未开放时)
  MOCK_MODE: false,

  // 资料类型列表 (HXR-01)
  RESOURCE_TYPES: [
    { key: 'all',      label: '全部' },
    { key: '试卷',      label: '试卷' },
    { key: '笔记',      label: '笔记' },
    { key: '课件',      label: '课件' },
    { key: '作业',      label: '作业' },
    { key: '教材',      label: '教材' }
  ],

  // 资料类型对应的扩展名颜色映射
  TYPE_COLORS: {
    '试卷': { bg: '#efe8f4', color: '#4b1f6f' },
    '笔记': { bg: '#e8f5ef', color: '#27865f' },
    '课件': { bg: '#f8efd9', color: '#795514' },
    '作业': { bg: '#eef0f8', color: '#3b4a8a' },
    '教材': { bg: '#fbeaea', color: '#bf4b55' }
  },

  // 网盘平台列表 (HXR-04)
  PLATFORMS: [
    '百度网盘', '夸克网盘', '阿里云盘', '腾讯微云', '蓝奏云', '123云盘', '其他'
  ],

  // 投稿状态 (HXR-05)
  SUBMISSION_STATUS: {
    pending:  { label: '审核中', color: '#d7a63c', bg: '#f8efd9' },
    approved: { label: '已通过', color: '#27865f', bg: '#e8f5ef' },
    revision: { label: '需修改', color: '#3b4a8a', bg: '#eef0f8' },
    rejected: { label: '未通过', color: '#bf4b55', bg: '#fbeaea' }
  },

  // 链接状态
  LINK_STATUS: {
    ok:      { label: '正常',   color: '#27865f', bg: '#e8f5ef' },
    expired: { label: '已失效', color: '#bf4b55', bg: '#fbeaea' },
    unknown: { label: '未知',   color: '#6f6972', bg: '#e8e2ec' }
  },

  // ===== 指南针 AI（HXR-COMPASS） =====
  COMPASS: {
    // 最多连续轮次
    ROUND_LIMIT: 10,
    // 示例问题（首页与欢迎态）
    SUGGESTIONS: [
      '如何申请课程缓考？',
      '转专业的流程和条件是什么？',
      '本科生奖学金有哪些类型？',
      '毕业论文提交的截止时间怎么算？'
    ]
  }
}
