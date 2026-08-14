const api = require('../../utils/request')
const navigation = require('../../utils/navigation')

Page({
  data: {
    loading: true,
    error: '',
    courses: [],
    total: 0,
    categories: ['全部', 'A', 'B', 'C', 'D', 'E'],
    category: '',
    requirementType: '',
    sort: 'comprehensive'
  },

  onLoad() { this.loadCourses() },
  onPullDownRefresh() { this.loadCourses().finally(() => wx.stopPullDownRefresh()) },

  async loadCourses() {
    this.setData({ loading: true, error: '' })
    try {
      const result = await api.get('/courses', {
        category: this.data.category,
        requirement_type: this.data.requirementType,
        sort: this.data.sort,
        page: 1,
        page_size: 50
      })
      this.setData({ courses: result.items, total: result.total, loading: false })
    } catch (error) {
      this.setData({ loading: false, error: error.message })
    }
  },

  chooseCategory(event) {
    const value = event.currentTarget.dataset.value
    this.setData({ category: value === '全部' ? '' : value }, () => this.loadCourses())
  },
  chooseRequirement() {
    const items = ['全部属性', '公共必修', '专业必修', '专业选修', '通识课']
    wx.showActionSheet({ itemList: items, success: ({ tapIndex }) => this.setData({ requirementType: tapIndex ? items[tapIndex] : '' }, () => this.loadCourses()) })
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
