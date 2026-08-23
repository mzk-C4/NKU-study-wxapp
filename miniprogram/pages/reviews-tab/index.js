const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')

Page({
  data: { loading: true, error: '', keyword: '', allGroups: [], filteredGroups: [], visibleGroups: [], page: 1, pageSize: 20, hasMore: false, statCourses: 0, statReviews: 0 },
  onLoad() { reportVisit('/mp/reviews-tab'); this.loadGroups() },
  onPullDownRefresh() { this.loadGroups().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.loadMore() },
  async loadGroups() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await publicApi.getReviewGroups()
      const groups = Array.isArray(data) ? data : (data.items || [])
      this.applyFilter(groups, this.data.keyword)
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  applyFilter(groups, keyword) {
    const kw = String(keyword || '').trim().toLowerCase()
    const filtered = kw ? groups.filter(g => `${g.course_name} ${g.teacher_name}`.toLowerCase().includes(kw)) : groups
    this.setData({
      allGroups: groups,
      filteredGroups: filtered,
      visibleGroups: filtered.slice(0, this.data.pageSize),
      page: 1,
      hasMore: filtered.length > this.data.pageSize,
      statCourses: filtered.length,
      statReviews: filtered.reduce((sum, g) => sum + (g.review_count || 0), 0),
      loading: false
    })
  },
  inputKeyword(event) { this.applyFilter(this.data.allGroups, event.detail.value) },
  clearKeyword() { this.applyFilter(this.data.allGroups, '') },
  dismissKeyboard() { if (wx.hideKeyboard) wx.hideKeyboard() },
  loadMore() {
    const next = this.data.page + 1
    const end = next * this.data.pageSize
    const visible = this.data.filteredGroups.slice(0, end)
    this.setData({ visibleGroups: visible, page: next, hasMore: end < this.data.filteredGroups.length })
  },
  openGroup(event) {
    const group = event.currentTarget.dataset.group
    const key = group.group_key || group.key
    if (key) wx.navigateTo({ url: `/pages/course-reviews/index?group_key=${encodeURIComponent(key)}` })
  }
})
