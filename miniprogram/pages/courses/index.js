const publicApi = require('../../services/public-api')
const navigation = require('../../utils/navigation')

function withAll(items) {
  return ['全部', ...(Array.isArray(items) ? items : [])]
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    error: '',
    courses: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
    groupOptions: ['全部'],
    termOptions: ['全部'],
    tagOptions: ['全部'],
    assessmentOptions: ['全部'],
    group: '',
    term: '',
    tag: '',
    assessment: ''
  },

  onLoad() {
    this._isUnloaded = false
    this._requestId = 0
    this.loadCourses()
  },
  onUnload() {
    this._isUnloaded = true
    this._requestId = (this._requestId || 0) + 1
  },
  onPullDownRefresh() { this.loadCourses().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) this.loadCourses({ append: true })
  },

  async loadCourses(options = {}) {
    if (this._isUnloaded) return
    const append = options.append === true
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    const snapshot = {
      group: this.data.group,
      term: this.data.term,
      tag: this.data.tag,
      assessment: this.data.assessment,
      page: append ? this.data.page + 1 : 1,
      pageSize: this.data.pageSize,
      courses: append ? [...this.data.courses] : []
    }
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, error: '' })
    try {
      const result = await publicApi.getCourses({
        group: snapshot.group,
        term: snapshot.term,
        tag: snapshot.tag,
        assessment: snapshot.assessment,
        page: snapshot.page,
        page_size: snapshot.pageSize
      })
      if (this._isUnloaded || this._requestId !== requestId) return
      const courses = append ? [...snapshot.courses, ...result.items] : result.items
      this.setData({
        courses,
        total: result.total,
        page: result.page,
        hasMore: courses.length < result.total,
        groupOptions: withAll(result.facets.groups),
        termOptions: withAll(result.facets.terms),
        tagOptions: withAll(result.facets.tags),
        assessmentOptions: withAll(result.facets.assessments),
        loading: false,
        loadingMore: false,
        error: ''
      })
    } catch (error) {
      if (this._isUnloaded || this._requestId !== requestId) return
      this.setData({ loading: false, loadingMore: false, error: append ? '' : error.message })
      if (append) wx.showToast({ title: error.message, icon: 'none' })
    }
  },

  chooseGroup(event) {
    const value = event.currentTarget.dataset.value
    this.setData({ group: value === '全部' ? '' : value }, () => this.loadCourses())
  },
  chooseFacet(title, optionsKey, valueKey) {
    const items = this.data[optionsKey]
    if (!items || items.length <= 1) {
      wx.showToast({ title: `暂无可用${title}`, icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: items,
      success: ({ tapIndex }) => this.setData({ [valueKey]: tapIndex ? items[tapIndex] : '' }, () => this.loadCourses())
    })
  },
  chooseTerm() { this.chooseFacet('修读阶段', 'termOptions', 'term') },
  chooseTag() { this.chooseFacet('标签', 'tagOptions', 'tag') },
  chooseAssessment() { this.chooseFacet('考核方式', 'assessmentOptions', 'assessment') },
  openSearch() { navigation.openSearch() },
  openCourse(event) { navigation.openCourse(event.detail.course.id) },
  submitCourse() { wx.showModal({ title: '课程补充暂未开放', content: '功能建设中，暂未连接线上服务。', showCancel: false }) }
})
