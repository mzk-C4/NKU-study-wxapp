const api = require('../../utils/request')
const navigation = require('../../utils/navigation')

Page({
  data: {
    loading: true, error: '', courses: [], total: 0,
    categories: ['全部'], category: '',
    terms: [], term: '', tags: [], tag: '', sort: 'comprehensive'
  },
  onLoad() { this.loadCourses() },
  onPullDownRefresh() { this.loadCourses().finally(() => wx.stopPullDownRefresh()) },
  async loadCourses() {
    this.setData({ loading: true, error: '' })
    try {
      const result = await api.get('/courses', { category: this.data.category, term: this.data.term, tag: this.data.tag, sort: this.data.sort, page: 1, page_size: 50 })
      const facets = result.facets || {}
      this.setData({
        courses: result.items, total: result.total, loading: false,
        categories: ['全部', ...(facets.categories || [])],
        terms: facets.terms || [], tags: facets.tags || []
      })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseCategory(event) {
    const value = event.currentTarget.dataset.value
    this.setData({ category: value === '全部' ? '' : value }, () => this.loadCourses())
  },
  chooseTerm() {
    const items = ['全部学期', ...this.data.terms]
    wx.showActionSheet({ itemList: items, success: ({ tapIndex }) => this.setData({ term: tapIndex ? items[tapIndex] : '' }, () => this.loadCourses()) })
  },
  chooseTag() {
    const items = ['全部标签', ...this.data.tags]
    wx.showActionSheet({ itemList: items, success: ({ tapIndex }) => this.setData({ tag: tapIndex ? items[tapIndex] : '' }, () => this.loadCourses()) })
  },
  chooseSort() {
    const items = ['综合排序', '资料最多', '评价最多', '最近更新']
    const values = ['comprehensive', 'resources', 'reviews', 'updated']
    wx.showActionSheet({ itemList: items, success: ({ tapIndex }) => this.setData({ sort: values[tapIndex] }, () => this.loadCourses()) })
  },
  openSearch() { navigation.openSearch() },
  openCourse(event) { navigation.openCourse(event.detail.course.id) },
  submitCourse() { wx.showToast({ title: '请通过反馈申请收录', icon: 'none' }) }
})
