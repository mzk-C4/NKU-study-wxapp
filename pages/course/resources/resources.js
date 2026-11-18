const api = require('../../../utils/api')
const config = require('../../../config/index')
const { ERROR_MESSAGES } = require('../../../utils/constants')

Page({
  data: {
    courseUid: '',
    courseName: '概率论与数理统计',
    courseTerm: '2025-2026 秋',
    resourceCount: 0,
    // 筛选
    typeList: config.RESOURCE_TYPES,
    activeType: 'all',
    sortMode: 'update', // 'term' | 'update'
    keyword: '', // 搜索关键词
    // 数据
    allResources: [],
    filteredResources: [],
    // 状态
    loading: true,
    error: false,
    errorText: '',
    refreshing: false
  },

  onLoad(options) {
    // 接收课程ID参数
    const courseUid = options.courseUid || options.id || 'course-demo'
    const courseName = options.courseName || '概率论与数理统计'
    this.setData({ courseUid, courseName })
    this.loadResources()
  },

  /**
   * 加载资料列表 (HXR-01)
   */
  loadResources() {
    this.setData({ loading: true, error: false })
    api.getCourseResources(this.data.courseUid)
      .then(data => {
        const resources = data.items || []
        this.setData({
          allResources: resources,
          resourceCount: resources.length,
          loading: false,
          refreshing: false
        })
        this.applyFilter()
      })
      .catch(err => {
        this.setData({
          loading: false,
          error: true,
          errorText: ERROR_MESSAGES[err.type] || ERROR_MESSAGES.unknown,
          refreshing: false
        })
      })
  },

  /**
   * 类型筛选 (HXR-01)
   */
  onTypeTap(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ activeType: key })
    this.applyFilter()
  },

  /**
   * 排序切换
   */
  onSortTap(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ sortMode: mode })
    this.applyFilter()
  },

  /**
   * 应用筛选和排序
   */
  applyFilter() {
    const { allResources, activeType, sortMode, keyword } = this.data
    let list = [...allResources]

    // 类型筛选
    if (activeType !== 'all') {
      list = list.filter(r => r.type === activeType)
    }

    // 关键词筛选（客户端，基于已加载资料）
    const kw = (keyword || '').trim().toLowerCase()
    if (kw) {
      list = list.filter(r =>
        (r.title || '').toLowerCase().includes(kw) ||
        (r.type || '').toLowerCase().includes(kw) ||
        (r.section || '').toLowerCase().includes(kw) ||
        (r.description || '').toLowerCase().includes(kw)
      )
    }

    // 排序
    if (sortMode === 'update') {
      // 最近更新排在前面（这里用原顺序模拟）
    } else {
      // 按学期
    }

    this.setData({ filteredResources: list })
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    this.applyFilter()
  },

  /**
   * 清空搜索
   */
  onClearSearch() {
    this.setData({ keyword: '' })
    this.applyFilter()
  },

  /**
   * 指南针首页入口
   */
  onOpenCompass() {
    wx.navigateTo({ url: '/pages/compass/index/index' })
  },

  /**
   * 搜索词带入 AI 页（仅作草稿，不自动发送 / 不混入旧话题）
   */
  onAskAI() {
    const kw = (this.data.keyword || '').trim() || this.data.courseName
    wx.navigateTo({
      url: '/pages/compass/chat/chat?draft=' + encodeURIComponent(kw)
    })
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.setData({ refreshing: true })
    this.loadResources()
  },

  /**
   * 点击资料卡片 -> 跳转详情页 (HXR-02)
   */
  onResourceTap(e) {
    const resource = e.detail.resource
    wx.navigateTo({
      url: `/pages/resource/detail/detail?resourceId=${resource.id}&courseUid=${this.data.courseUid}`
    })
  },

  /**
   * 点击"打开网盘" (HXR-03)
   */
  onResourceAction(e) {
    const resource = e.detail.resource
    if (resource.download_url) {
      wx.setClipboardData({
        data: resource.download_url,
        success: () => {
          wx.showToast({ title: '链接已复制', icon: 'success' })
        }
      })
    }
  },

  /**
   * 分享资料按钮 -> 跳转投稿表单 (HXR-04)
   */
  onShareTap() {
    wx.navigateTo({
      url: `/pages/resource/share/share?courseUid=${this.data.courseUid}&courseName=${encodeURIComponent(this.data.courseName)}`
    })
  }
})
