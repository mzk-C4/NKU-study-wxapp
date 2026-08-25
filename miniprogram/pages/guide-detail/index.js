const publicApi = require('../../features/learning-compass/api')
const navigation = require('../../utils/navigation')
const { getCategoryInfo, cleanSourceText } = require('../../utils/learning-compass')
const { createSourceOpener } = require('../../utils/source-opener')

const CHINESE_ORDINALS = Object.freeze(['一', '二', '三', '四', '五', '六', '七', '八'])
const TRANSFER_GUIDE_ID = 'transfer-major-2026'
const MATERIAL_SCIENCE_COLLEGE = '材料科学与工程学院'
const DEFAULT_TRANSFER_VARIANT_ID = 'materials-science'

function normalizeGuideId(value) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id || id.length > 200 || /[\s\\\u0000-\u001f\u007f]/.test(id)) return ''
  return id
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
    // 使用稳定默认值，避免系统信息读取失败阻塞内容阅读。
  }
  return 20
}

function userErrorMessage(error) {
  if (error && (error.code === 'NETWORK_ERROR' || error.kind === 'network_error')) return '网络连接失败，请检查网络后重试。'
  return '暂时无法加载指南详情，请稍后重试。'
}

function cleanArticleBody(value) {
  return String(value == null ? '' : value)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim())
    .filter(line => line && !line.includes('｜'))
    .join('\n')
    .trim()
}

function compactPreview(value, maximum = 170) {
  const text = cleanArticleBody(value)
  return text.length > maximum ? `${text.slice(0, maximum).trim()}…` : text
}

function sourceMeta(source) {
  const raw = source && typeof source === 'object' ? source : {}
  return {
    id: String(raw.id || ''),
    title: String(raw.title || ''),
    url: String(raw.file_url || raw.url || ''),
    fileUrl: String(raw.file_url || ''),
    officialPageUrl: String(raw.official_page_url || ''),
    locationLabel: String(raw.location_label || ''),
    number: String(raw.document_no || '学校文件'),
    publisher: String(raw.publisher || '南开大学相关发布单位'),
    issuedDate: String(raw.published_at || ''),
    fileStatus: String(raw.file_type || '原文件').toUpperCase(),
    fileType: String(raw.file_type || '').toUpperCase(),
    fileName: String(raw.file_name || '')
  }
}

function transferPanelsForVariant(variant) {
  const sections = variant && Array.isArray(variant.sections) ? variant.sections : []
  return sections.map((section, index) => ({
    key: String(section.id || `variant-section-${index + 1}`),
    title: String(section.title || `学院原文第${index + 1}节`),
    body: cleanArticleBody(section.body),
    expanded: index === 0
  }))
}

function buildTransferModel(sections, sources, variants) {
  const universitySection = sections[0] || { title: '校级转专业规则', body: '' }
  const colleges = (Array.isArray(variants) ? variants : []).map(item => ({ id: item.id, name: item.title, order: item.order }))
  const selectedIndex = Math.max(0, colleges.findIndex(item => item.id === DEFAULT_TRANSFER_VARIANT_ID || item.name === MATERIAL_SCIENCE_COLLEGE))
  const selected = colleges[selectedIndex] || { id: '', name: '' }
  const universitySource = sourceMeta(sources[0] || {})
  return {
    collegeNames: colleges.map(item => item.name),
    colleges,
    selectedIndex,
    selectedId: selected.id,
    selectedName: selected.name,
    selectedSourceName: '',
    panels: [],
    schoolRule: {
      title: universitySection.title || '学校层面统一规定',
      body: cleanArticleBody(universitySection.body),
      sourceTitle: universitySource.title,
      sourceNumber: universitySource.number,
      url: universitySource.url,
      source: universitySource
    },
    collegeSource: sourceMeta({}),
    loading: true
  }
}

function applyTransferVariant(guide, response) {
  const payload = response && response.variant && typeof response.variant === 'object' ? response.variant : {}
  const source = sourceMeta(Array.isArray(payload.sources) ? payload.sources[0] : {})
  const colleges = guide.transfer.colleges
  const selectedIndex = Math.max(0, colleges.findIndex(item => item.id === payload.id))
  return {
    ...guide,
    transfer: {
      ...guide.transfer,
      selectedIndex,
      selectedId: String(payload.id || ''),
      selectedName: String(payload.title || ''),
      selectedSourceName: source.fileName || source.title,
      panels: transferPanelsForVariant(payload),
      collegeSource: source,
      loading: false
    }
  }
}

function presentGuide(rawGuide) {
  const raw = rawGuide && typeof rawGuide === 'object' ? rawGuide : {}
  const category = String(raw.category || '')
  const categoryInfo = getCategoryInfo(category)
  const rawSections = Array.isArray(raw.sections) && raw.sections.length
    ? raw.sections
    : Array.isArray(raw.steps) ? raw.steps : []
  const sections = rawSections.map((section, index) => {
    const body = cleanArticleBody(section && section.body)
    const preview = compactPreview(body)
    return {
      id: String(section && section.id || `section-${index + 1}`),
      title: String(section && section.title || `正文第${index + 1}节`),
      ordinal: CHINESE_ORDINALS[index] || String(index + 1),
      body,
      preview,
      expanded: index === 0,
      hasMore: body.length > preview.length,
      highlights: []
    }
  })
  const source = Array.isArray(raw.sources) && raw.sources.length
    ? raw.sources[0]
    : { title: raw.source_title, file_url: raw.source_url, location_label: '' }
  const guide = {
    id: String(raw.id || ''),
    title: String(raw.title || ''),
    category,
    categoryTone: categoryInfo.tone,
    categorySymbol: categoryInfo.symbol,
    summary: cleanSourceText(raw.summary, 180),
    scope: String(raw.applicable_scope || '适用范围以相关学校文件为准'),
    updatedLabel: raw.updated_at ? `更新于 ${String(raw.updated_at).slice(0, 10)}` : '内容来自已整理学校文件',
    timeStatus: String(raw.time_status || ''),
    contentType: String(raw.content_type || 'standard'),
    source: sourceMeta(source),
    sections,
    sources: Array.isArray(raw.sources) ? raw.sources.map(sourceMeta) : [],
    related_courses: Array.isArray(raw.related_courses) ? raw.related_courses : [],
    correction_url: String(raw.correction_url || '')
  }
  if (guide.contentType === 'multi_variant' || guide.id === TRANSFER_GUIDE_ID) guide.transfer = buildTransferModel(sections, Array.isArray(raw.sources) ? raw.sources : [], raw.variants)
  return guide
}

function copyLink(url, successTitle) {
  if (!url || typeof wx.setClipboardData !== 'function') return Promise.resolve(false)
  return new Promise(resolve => {
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: successTitle, icon: 'success' })
        resolve(true)
      },
      fail() {
        wx.showToast({ title: '复制失败，请稍后重试。', icon: 'none' })
        resolve(false)
      }
    })
  })
}

function openSourceFile(source) {
  return createSourceOpener().open(source, {
    autoCopyFallback: true,
    failureTitle: '暂时无法打开该原文件'
  })
}

Page({
  data: {
    statusBarHeight: 20,
    id: '',
    loading: true,
    error: '',
    unavailable: false,
    guide: null,
    activeSectionId: '',
    feedback: ''
  },

  onLoad(options = {}) {
    this._isUnloaded = false
    this._requestId = 0
    this._variantRequestId = 0
    const id = normalizeGuideId(options.id || options.guideId)
    if (!id) {
      this.setData({ id: '', loading: false, error: '指南编号无效，请返回列表后重试。', unavailable: false, guide: null })
      return Promise.resolve()
    }
    this.setData({ id, statusBarHeight: getStatusBarHeight() })
    return this.loadGuide()
  },

  onUnload() {
    this._isUnloaded = true
    this._requestId = (this._requestId || 0) + 1
    this._variantRequestId = (this._variantRequestId || 0) + 1
  },

  retry() {
    return this.loadGuide()
  },

  async loadGuide() {
    if (this._isUnloaded) return
    const id = normalizeGuideId(this.data.id)
    if (!id) {
      this.setData({ loading: false, error: '指南编号无效，请返回列表后重试。', unavailable: false, guide: null })
      return
    }
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    this.setData({ loading: true, error: '', unavailable: false, guide: null, activeSectionId: '' })
    try {
      const rawGuide = await publicApi.getGuide(id)
      if (this._isUnloaded || this._requestId !== requestId) return
      if (!rawGuide || !rawGuide.id || !rawGuide.title) {
        this.setData({ loading: false, error: '', unavailable: true, guide: null })
        return
      }
      let guide = presentGuide(rawGuide)
      if (guide.transfer && guide.transfer.selectedId) {
        const variantResponse = await publicApi.getGuideVariant(guide.id, guide.transfer.selectedId)
        if (this._isUnloaded || this._requestId !== requestId) return
        guide = applyTransferVariant(guide, variantResponse)
      }
      this.setData({ loading: false, error: '', unavailable: false, guide, activeSectionId: guide.sections[0] ? guide.sections[0].id : '' })
      if (typeof wx.setNavigationBarTitle === 'function') wx.setNavigationBarTitle({ title: guide.title })
    } catch (error) {
      if (this._isUnloaded || this._requestId !== requestId) return
      if (error && (error.statusCode === 404 || error.code === 'GUIDE_NOT_FOUND')) {
        this.setData({ loading: false, error: '', unavailable: true, guide: null })
        return
      }
      this.setData({ loading: false, error: userErrorMessage(error), unavailable: false, guide: null })
    }
  },

  selectSection(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset.id || '')
    if (!id || !this.data.guide) return
    const sections = this.data.guide.sections.map(section => ({ ...section, expanded: section.id === id || section.expanded }))
    this.setData({ guide: { ...this.data.guide, sections }, activeSectionId: id })
  },

  toggleSection(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset.id || '')
    if (!id || !this.data.guide) return
    const sections = this.data.guide.sections.map(section => (section.id === id ? { ...section, expanded: !section.expanded } : section))
    this.setData({ guide: { ...this.data.guide, sections }, activeSectionId: id })
  },

  async chooseTransferCollege(event) {
    const selectedIndex = Number(event && event.detail && event.detail.value)
    const guide = this.data.guide
    if (!guide || !guide.transfer || !Number.isInteger(selectedIndex)) return
    const selected = guide.transfer.colleges[selectedIndex]
    if (!selected || !selected.id || selected.id === guide.transfer.selectedId) return
    const variantRequestId = (this._variantRequestId || 0) + 1
    this._variantRequestId = variantRequestId
    this.setData({ guide: { ...guide, transfer: { ...guide.transfer, selectedIndex, selectedId: selected.id, selectedName: selected.name, loading: true } } })
    try {
      const response = await publicApi.getGuideVariant(guide.id, selected.id)
      if (this._isUnloaded || this._variantRequestId !== variantRequestId || !this.data.guide) return
      this.setData({ guide: applyTransferVariant(this.data.guide, response) })
    } catch (_) {
      if (this._isUnloaded || this._variantRequestId !== variantRequestId || !this.data.guide) return
      const currentGuide = this.data.guide
      this.setData({ guide: { ...currentGuide, transfer: { ...currentGuide.transfer, loading: false } } })
      wx.showToast({ title: '暂时无法加载该学院要求', icon: 'none' })
    }
  },

  toggleTransferPanel(event) {
    const key = String(event && event.currentTarget && event.currentTarget.dataset.key || '')
    const guide = this.data.guide
    if (!guide || !guide.transfer || !key) return
    const panels = guide.transfer.panels.map(panel => (
      panel.key === key ? { ...panel, expanded: !panel.expanded } : panel
    ))
    this.setData({ guide: { ...guide, transfer: { ...guide.transfer, panels } } })
  },

  showTransferTopic() {
    wx.showToast({ title: '内容定位正在建设中', icon: 'none' })
  },

  copyTransferSource(event) {
    const kind = String(event && event.currentTarget && event.currentTarget.dataset.kind || '')
    const guide = this.data.guide
    if (!guide || !guide.transfer) return Promise.resolve(false)
    const source = kind === 'college' ? guide.transfer.collegeSource : guide.transfer.schoolRule.source
    return openSourceFile(source)
  },

  openRelatedCourse(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    if (id) navigation.openCourse(id)
  },

  copySourceUrl() {
    const guide = this.data.guide || {}
    return openSourceFile(guide.source)
  },

  copyCorrectionUrl() {
    return copyLink(this.data.guide && this.data.guide.correction_url, '纠错链接已复制')
  },

  rateGuide(event) {
    const value = String(event && event.currentTarget && event.currentTarget.dataset.value || '')
    if (value !== 'helpful' && value !== 'unhelpful') return
    this.setData({ feedback: value })
    wx.showToast({ title: value === 'helpful' ? '感谢反馈' : '已记录反馈', icon: 'none' })
  },

  showUnavailable() {
    wx.showToast({ title: '功能正在建设中', icon: 'none' })
  },

  goBack() {
    wx.navigateBack({ delta: 1, fail() { wx.switchTab({ url: '/pages/guides/index' }) } })
  }
})
