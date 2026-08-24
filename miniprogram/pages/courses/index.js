const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')
const navigation = require('../../utils/navigation')
const { createRequestGeneration } = require('../../utils/request-generation')

const CATALOG_PAGE_SIZE = 100
const VISIBLE_BATCH_SIZE = 50

function unique(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function createOptions(values, selectedValues) {
  const selected = new Set(selectedValues || [])
  return unique([...values, ...selected]).map(value => ({ value, label: value, selected: selected.has(value) }))
}

function filterCourses(courses, filters = {}) {
  const groups = new Set(filters.groups || [])
  const tags = new Set(filters.tags || [])
  return (courses || []).filter(course => {
    if (groups.size && !groups.has(course.group)) return false
    if (tags.size && !(course.tags || []).some(tag => tags.has(tag))) return false
    if (filters.term && course.term !== filters.term) return false
    if (filters.assessment && course.assessment !== filters.assessment) return false
    return true
  })
}

function mergeFacets(target, source = {}) {
  return {
    groups: unique([...(target.groups || []), ...(source.groups || [])]),
    terms: unique([...(target.terms || []), ...(source.terms || [])]),
    tags: unique([...(target.tags || []), ...(source.tags || [])]),
    assessments: unique([...(target.assessments || []), ...(source.assessments || [])])
  }
}

function selectionLabel(selectedValues, fallback, unit) {
  const selected = selectedValues || []
  if (!selected.length) return fallback
  if (selected.length === 1) return selected[0]
  return `已选 ${selected.length} 个${unit}`
}

function calculateScrollbar(scrollLeft, scrollWidth, viewportWidth) {
  const content = Number(scrollWidth) || 0
  const viewport = Number(viewportWidth) || 0
  if (!content || !viewport || content <= viewport) return { scrollable: false, thumbWidth: 100, thumbLeft: 0 }
  const thumbWidth = Math.max(24, Math.min(88, (viewport / content) * 100))
  const progress = Math.max(0, Math.min(1, (Number(scrollLeft) || 0) / (content - viewport)))
  return {
    scrollable: true,
    thumbWidth: Number(thumbWidth.toFixed(2)),
    thumbLeft: Number(((100 - thumbWidth) * progress).toFixed(2))
  }
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    error: '',
    allCourses: [],
    filteredCourses: [],
    courses: [],
    total: 0,
    visibleCount: VISIBLE_BATCH_SIZE,
    hasMore: false,
    groupOptions: [],
    selectedGroups: [],
    groupLabel: '全部类别',
    termOptions: ['全部学期'],
    term: '',
    tagOptions: [],
    selectedTags: [],
    tagLabel: '全部标签',
    assessmentOptions: ['全部考核'],
    assessment: '',
    filterPanel: '',
    filterScrollScrollable: true,
    filterScrollThumbWidth: 44,
    filterScrollThumbLeft: 0,
    hasFilters: false
  },

  requestGeneration: createRequestGeneration(),

  onLoad() {
    reportVisit('/mp/courses')
    this.loadCourses()
  },
    onShow() { theme.onPageShow() },

  onReady() { this.measureFilterScroll() },

  onUnload() { this.requestGeneration.begin({ newQuery: true }) },

  onPullDownRefresh() {
    this.loadCourses().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) this.showMore()
  },

  async loadCourses() {
    const token = this.requestGeneration.begin({ newQuery: true })
    this.setData({ loading: true, loadingMore: false, error: '' })
    try {
      let page = 1
      let total = 0
      let facets = { groups: [], terms: [], tags: [], assessments: [] }
      const coursesById = new Map()

      do {
        const result = await publicApi.getCourses({ page, page_size: CATALOG_PAGE_SIZE })
        if (!this.requestGeneration.isLatest(token)) return
        total = result.total
        facets = mergeFacets(facets, result.facets)
        for (const course of result.items) coursesById.set(course.id, course)
        if (!result.items.length || coursesById.size >= total) break
        page += 1
      } while (page <= 10000)

      const allCourses = [...coursesById.values()]
      this.setData({
        allCourses,
        groupOptions: createOptions(facets.groups, this.data.selectedGroups),
        termOptions: ['全部学期', ...unique(facets.terms)],
        tagOptions: createOptions(facets.tags, this.data.selectedTags),
        assessmentOptions: ['全部考核', ...unique(facets.assessments)],
        loading: false
      })
      this.applyFilters({ resetVisible: true })
    } catch (error) {
      if (this.requestGeneration.isLatest(token)) {
        this.setData({ loading: false, loadingMore: false, error: error.message || '课程加载失败，请重试。' })
      }
    }
  },

  applyFilters({ resetVisible = true } = {}) {
    const filteredCourses = filterCourses(this.data.allCourses, {
      groups: this.data.selectedGroups,
      tags: this.data.selectedTags,
      term: this.data.term,
      assessment: this.data.assessment
    })
    const visibleCount = resetVisible ? VISIBLE_BATCH_SIZE : this.data.visibleCount
    const courses = filteredCourses.slice(0, visibleCount)
    this.setData({
      filteredCourses,
      courses,
      total: filteredCourses.length,
      visibleCount,
      hasMore: courses.length < filteredCourses.length,
      hasFilters: Boolean(this.data.selectedGroups.length || this.data.selectedTags.length || this.data.term || this.data.assessment),
      groupLabel: selectionLabel(this.data.selectedGroups, '全部类别', '类别'),
      tagLabel: selectionLabel(this.data.selectedTags, '全部标签', '标签'),
      groupOptions: this.data.groupOptions.map(item => ({ ...item, selected: this.data.selectedGroups.includes(item.value) })),
      tagOptions: this.data.tagOptions.map(item => ({ ...item, selected: this.data.selectedTags.includes(item.value) }))
    }, () => this.measureFilterScroll())
  },

  measureFilterScroll() {
    if (typeof wx === 'undefined' || !wx.createSelectorQuery) return
    const query = wx.createSelectorQuery().in(this)
    query.select('.filter-scroll').boundingClientRect()
    query.select('.filter-bar').boundingClientRect()
    query.exec(result => {
      const viewport = result && result[0]
      const content = result && result[1]
      if (!viewport || !content) return
      this._filterViewportWidth = viewport.width
      this._filterContentWidth = content.width
      this.updateFilterScrollbar(0, content.width, viewport.width)
    })
  },

  updateFilterScrollbar(scrollLeft, scrollWidth, viewportWidth) {
    const next = calculateScrollbar(scrollLeft, scrollWidth, viewportWidth)
    this.setData({
      filterScrollScrollable: next.scrollable,
      filterScrollThumbWidth: next.thumbWidth,
      filterScrollThumbLeft: next.thumbLeft
    })
  },

  handleFilterScroll(event) {
    const detail = event.detail || {}
    const scrollWidth = Number(detail.scrollWidth) || this._filterContentWidth
    const viewportWidth = this._filterViewportWidth
    if (!scrollWidth || !viewportWidth) return
    this.updateFilterScrollbar(detail.scrollLeft, scrollWidth, viewportWidth)
  },

  showMore() {
    const visibleCount = this.data.visibleCount + VISIBLE_BATCH_SIZE
    const courses = this.data.filteredCourses.slice(0, visibleCount)
    this.setData({ courses, visibleCount, hasMore: courses.length < this.data.filteredCourses.length })
  },

  changeGroups(event) {
    const selectedGroups = unique(event.detail.value)
    this.setData({ selectedGroups }, () => this.applyFilters({ resetVisible: true }))
  },

  clearGroups() {
    this.setData({ selectedGroups: [] }, () => this.applyFilters({ resetVisible: true }))
  },

  toggleFilterPanel(event) {
    const panel = event.currentTarget.dataset.panel || ''
    this.setData({ filterPanel: this.data.filterPanel === panel ? '' : panel })
  },

  closeFilterPanel() { this.setData({ filterPanel: '' }) },

  chooseTerm(event) {
    const index = Number(event.detail.value)
    this.setData({ term: index ? this.data.termOptions[index] : '', filterPanel: '' }, () => this.applyFilters({ resetVisible: true }))
  },

  changeTags(event) {
    const selectedTags = unique(event.detail.value)
    this.setData({ selectedTags }, () => this.applyFilters({ resetVisible: true }))
  },

  clearTags() {
    this.setData({ selectedTags: [] }, () => this.applyFilters({ resetVisible: true }))
  },

  chooseAssessment(event) {
    const index = Number(event.detail.value)
    this.setData({ assessment: index ? this.data.assessmentOptions[index] : '', filterPanel: '' }, () => this.applyFilters({ resetVisible: true }))
  },

  clearFilters() {
    this.setData({ selectedGroups: [], selectedTags: [], term: '', assessment: '', filterPanel: '' }, () => this.applyFilters({ resetVisible: true }))
  },

  openSearch() { navigation.openSearch() },
  openCourse(event) { navigation.openCourse(event.detail.course.id) }
})

module.exports = { CATALOG_PAGE_SIZE, VISIBLE_BATCH_SIZE, unique, createOptions, filterCourses, mergeFacets, selectionLabel, calculateScrollbar }