const publicApi = require('../../features/learning-compass/api')
const navigation = require('../../utils/navigation')
const { CATEGORY_ORDER, getCategoryInfo, cleanSourceText } = require('../../utils/learning-compass')

const PAGE_SIZE = 20
const TIME_STATUS_LABELS = Object.freeze({ long_term: '长期有效', current: '当前适用', ended: '已结束', historical: '历史内容' })

function decodeCategory(value) {
  const source = String(value == null ? '' : value)
  try {
    return decodeURIComponent(source).trim()
  } catch (_) {
    return source.trim()
  }
}

function getStatusBarHeight() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (Number.isFinite(Number(info.statusBarHeight))) return Number(info.statusBarHeight)
    }
    if (typeof wx.getSystemInfoSync === 'function') {
      const info = wx.getSystemInfoSync()
      if (Number.isFinite(Number(info.statusBarHeight))) return Number(info.statusBarHeight)
    }
  } catch (_) {
    // 使用稳定默认值，避免系统信息读取失败阻塞普通浏览。
  }
  return 20
}

function userErrorMessage(error) {
  if (error && (error.code === 'NETWORK_ERROR' || error.kind === 'network_error')) return '网络连接失败，请检查网络后重试。'
  return '暂时无法加载本分类指南，请稍后重试。'
}

function buildTabs(activeCategory) {
  return CATEGORY_ORDER.map(category => ({
    value: category,
    label: category,
    active: category === activeCategory
  }))
}

function categoryModel(category, total) {
  const info = getCategoryInfo(category)
  const title = category || '全部指南'
  const description = category
    ? info.description
    : '浏览南开本科生学习事务相关的已整理学校文件与原文内容。'
  return {
    title,
    description,
    tone: info.tone,
    symbol: info.symbol,
    countLabel: total > 0 ? `共 ${total} 篇已发布指南` : '暂无已发布指南'
  }
}

function presentGuide(guide, index) {
  const raw = guide && typeof guide === 'object' ? guide : {}
  const sourceCount = Number(raw.source_count)
  const minutes = Number(raw.read_minutes)
  const statusLabel = TIME_STATUS_LABELS[String(raw.time_status || '')] || ''
  return {
    id: String(raw.id || ''),
    title: String(raw.title || ''),
    number: index + 1,
    preview: cleanSourceText(raw.summary, 110) || '查看已整理的学校文件原文内容。',
    sourceLabel: Number.isFinite(sourceCount) && sourceCount > 0 ? `${Math.floor(sourceCount)} 份学校文件` : '已整理学校文件',
    scopeLabel: String(raw.applicable_scope || raw.category || '南开大学本科生'),
    readLabel: [statusLabel, Number.isFinite(minutes) && minutes > 0 ? `约 ${Math.floor(minutes)} 分钟阅读` : ''].filter(Boolean).join(' · ')
  }
}

Page({
  data: {
    statusBarHeight: 20,
    category: '考试与成绩',
    header: categoryModel('考试与成绩', 0),
    tabs: buildTabs('考试与成绩'),
    loading: true,
    error: '',
    isEmpty: false,
    guides: []
  },

  onLoad(options = {}) {
    this._isUnloaded = false
    this._requestId = 0
    const requestedCategory = decodeCategory(options.category)
    const hasRequestedCategory = Object.prototype.hasOwnProperty.call(options, 'category')
    const category = CATEGORY_ORDER.includes(requestedCategory)
      ? requestedCategory
      : hasRequestedCategory ? '' : '考试与成绩'
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      category,
      header: categoryModel(category, 0),
      tabs: buildTabs(category)
    })
    return this.loadGuides()
  },

  onUnload() {
    this._isUnloaded = true
    this._requestId = (this._requestId || 0) + 1
  },

  chooseCategory(event) {
    const category = String(event && event.currentTarget && event.currentTarget.dataset.category || '')
    if (!CATEGORY_ORDER.includes(category) || category === this.data.category || this._isUnloaded) return
    this._requestId = (this._requestId || 0) + 1
    this.setData({
      category,
      header: categoryModel(category, 0),
      tabs: buildTabs(category),
      guides: [],
      loading: true,
      error: '',
      isEmpty: false
    }, () => this.loadGuides())
  },

  retry() {
    return this.loadGuides()
  },

  async loadGuides() {
    if (this._isUnloaded) return
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    const category = this.data.category
    this.setData({ loading: true, error: '', isEmpty: false, guides: [] })
    try {
      const result = await publicApi.getGuides({ category, page: 1, page_size: PAGE_SIZE })
      if (this._isUnloaded || this._requestId !== requestId) return
      const rawItems = Array.isArray(result.items) ? result.items : []
      const categoryItems = category ? rawItems.filter(item => item && item.category === category) : rawItems
      const guides = categoryItems.map(presentGuide).filter(item => item.id && item.title)
      const total = Number(result.total)
      const scopedTotal = Number.isFinite(total) && categoryItems.length === rawItems.length ? Math.max(0, total) : guides.length
      this.setData({
        header: categoryModel(category, scopedTotal),
        guides,
        loading: false,
        error: '',
        isEmpty: guides.length === 0
      })
    } catch (error) {
      if (this._isUnloaded || this._requestId !== requestId) return
      this.setData({ loading: false, error: userErrorMessage(error), isEmpty: false, guides: [] })
    }
  },

  openGuide(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset.id || '').trim()
    if (id) navigation.openGuide(id)
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.switchTab({ url: '/pages/guides/index' })
      }
    })
  }
})
