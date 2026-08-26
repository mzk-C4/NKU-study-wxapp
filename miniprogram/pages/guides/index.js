const publicApi = require('../../features/learning-compass/api')
const navigation = require('../../utils/navigation')
const { CATEGORY_ORDER, getCategoryInfo } = require('../../utils/learning-compass')
const learningProfile = require('../../utils/learning-profile')

const PAGE_SIZE = 20
const CATEGORY_CONFIG = Object.freeze(CATEGORY_ORDER.map(value => ({ value, label: value })))
const CATEGORY_LABELS = Object.freeze({
  '选课与修读': '选课与修读',
  '考试与成绩': '考试与成绩',
  '学籍与毕业': '学籍与毕业',
  '学业拓展': '学业拓展',
  '规范与权益': '规范与权益',
  'course-selection': '选课流程',
  'training-program': '培养方案',
  'add-drop': '退补选',
  'exam-grade': '考试成绩'
})
const HOME_CATEGORIES = Object.freeze(CATEGORY_ORDER.map(value => {
  const info = getCategoryInfo(value)
  return { value, label: value, symbol: info.symbol, tone: info.tone }
}))
function categoryOptions(facets = [], resolved = false) {
  const available = new Set(Array.isArray(facets) ? facets : [])
  return [
    { value: '', label: '全部', unavailable: false },
    ...CATEGORY_CONFIG.map(item => ({ ...item, unavailable: resolved && !available.has(item.value) }))
  ]
}

function presentGuide(guide) {
  const presentation = getCategoryInfo(guide.category)
  const dateMatch = String(guide.updated_at || '').match(/^\d{4}-\d{2}-\d{2}/)
  return {
    ...guide,
    category_label: CATEGORY_LABELS[guide.category] || '学习事务',
    updated_label: dateMatch ? `更新于 ${dateMatch[0]}` : '',
    scope_label: guide.applicable_scope || '适用范围待补充',
    symbol: presentation.symbol,
    tone: presentation.tone
  }
}

function dedupeGuides(guides) {
  const seen = new Set()
  return guides.filter(guide => {
    const id = guide && guide.id
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function userErrorMessage(error) {
  if (error && (error.code === 'NETWORK_ERROR' || error.kind === 'network_error')) {
    return '网络连接失败，请检查网络后重试。'
  }
  return '暂时无法加载指南，请稍后重试。'
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    error: '',
    loadMoreError: '',
    isEmpty: false,
    guides: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: false,
    category: '',
    categories: categoryOptions(),
    homeCategories: HOME_CATEGORIES,
    activeHomeCategory: HOME_CATEGORIES[0].value,
    guideContextLabel: learningProfile.formatLabel(learningProfile.emptyProfile()),
    dataUpdatedAt: ''
  },

  onLoad() {
    this._isUnloaded = false
    this._requestId = 0
    this.refreshLearningProfile()
    return this.loadGuides()
  },
  onShow() {
    // Tab 页会被缓存：切回时只恢复已有状态，不能覆盖 error/empty/ready，
    // 也不能为同一个初始请求再发一次读取。
    this._isVisible = true
    this.refreshLearningProfile()
  },
  onHide() {
    this._isVisible = false
  },
  onUnload() {
    this._isUnloaded = true
    this._requestId = (this._requestId || 0) + 1
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      return this.loadGuides({ append: true })
    }
  },

  chooseCategory(event) {
    if (this._isUnloaded) return
    const category = String(event && event.currentTarget && event.currentTarget.dataset.category || '')
    if (category && !CATEGORY_LABELS[category]) return
    if (category === this.data.category && !this.data.error) return
    this._requestId = (this._requestId || 0) + 1
    return new Promise(resolve => {
      this.setData({ category }, () => resolve(this.loadGuides()))
    })
  },
  retry() {
    return this.loadGuides()
  },
  retryLoadMore() {
    if (this.data.hasMore && !this.data.loadingMore) return this.loadGuides({ append: true })
  },
  refreshLearningProfile() {
    if (this._isUnloaded) return
    const guideContextLabel = learningProfile.formatLabel(learningProfile.read())
    if (guideContextLabel !== this.data.guideContextLabel) this.setData({ guideContextLabel })
  },
  openSearch() {
    navigation.openSearch('')
  },
  openAllGuides() {
    navigation.openGuideCategory('')
  },
  openHomeCategory(event) {
    const value = String(event && event.currentTarget && event.currentTarget.dataset.value || '')
    const category = HOME_CATEGORIES.find(item => item.value === value)
    if (!category || this._isUnloaded) return
    this.setData({ activeHomeCategory: category.value }, () => navigation.openGuideCategory(category.value))
  },
  openAssistant() {
    navigation.openGuideAssistant()
  },

  async loadGuides(options = {}) {
    if (this._isUnloaded) return
    const append = options.append === true
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    const snapshot = {
      category: this.data.category,
      page: append ? this.data.page + 1 : 1,
      pageSize: this.data.pageSize,
      guides: append ? [...this.data.guides] : []
    }
    if (append) {
      this.setData({ loadingMore: true, loadMoreError: '' })
    } else {
      this.setData({
        loading: true,
        loadingMore: false,
        error: '',
        loadMoreError: '',
        isEmpty: false,
        guides: [],
        total: 0,
        page: 1,
        hasMore: false
      })
    }

    try {
      const result = await publicApi.getGuides({
        category: snapshot.category,
        page: snapshot.page,
        page_size: snapshot.pageSize
      })
      if (this._isUnloaded || this._requestId !== requestId) return
      const pageItems = (Array.isArray(result.items) ? result.items : []).map(presentGuide)
      const guides = dedupeGuides(append ? [...snapshot.guides, ...pageItems] : pageItems)
      const total = Number.isFinite(Number(result.total)) ? Math.max(0, Number(result.total)) : guides.length
      const page = Number.isInteger(Number(result.page)) && Number(result.page) > 0 ? Number(result.page) : snapshot.page
      const hasInconsistentPage = pageItems.length === 0 && guides.length < total
      if (hasInconsistentPage) {
        if (append) {
          this.setData({ loadingMore: false, loadMoreError: '加载更多失败，请重试。' })
          return
        }
        this.setData({
          loading: false,
          loadingMore: false,
          error: '暂时无法加载指南，请稍后重试。',
          loadMoreError: '',
          isEmpty: false
        })
        return
      }
      this.setData({
        guides,
        total,
        page,
        hasMore: pageItems.length > 0 && guides.length < total,
        categories: categoryOptions(result.facets && result.facets.categories, true),
        dataUpdatedAt: result.data_updated_at || '',
        loading: false,
        loadingMore: false,
        error: '',
        loadMoreError: '',
        isEmpty: !append && pageItems.length === 0 && total === 0
      })
    } catch (error) {
      if (this._isUnloaded || this._requestId !== requestId) return
      if (append) {
        this.setData({ loadingMore: false, loadMoreError: '加载更多失败，请重试。' })
        return
      }
      this.setData({
        loading: false,
        loadingMore: false,
        error: userErrorMessage(error),
        loadMoreError: '',
        isEmpty: false
      })
    }
  },

  openGuide(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset.id || '').trim()
    if (!id) return
    wx.navigateTo({ url: `/pages/guide-detail/index?id=${encodeURIComponent(id)}` })
  }
})
