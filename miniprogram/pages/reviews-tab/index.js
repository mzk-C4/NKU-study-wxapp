const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')
const {
  buildReviewGroupUrl,
  getReviewListState,
  getReviewSearchStats,
  searchReviewGroups
} = require('./search')

Page({
  data: { loading: true, error: '', keyword: '', hasSearchQuery: false, allGroups: [], filteredGroups: [], visibleGroups: [], page: 1, pageSize: 20, hasMore: false, statCourses: 0, statReviews: 0 },
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
    const rawKeyword = String(keyword == null ? '' : keyword).slice(0, 80)
    const searched = searchReviewGroups(groups, rawKeyword)
    const filtered = searched.results
    const list = getReviewListState(filtered, this.data.pageSize)
    const stats = getReviewSearchStats(filtered)
    this.setData({
      allGroups: groups,
      filteredGroups: filtered,
      visibleGroups: list.visibleGroups,
      page: list.page,
      hasMore: list.hasMore,
      keyword: rawKeyword,
      hasSearchQuery: Boolean(searched.query),
      statCourses: stats.statCourses,
      statReviews: stats.statReviews,
      loading: false
    })
  },
  inputKeyword(event) { this.applyFilter(this.data.allGroups, event.detail.value) },
  clearKeyword() { this.applyFilter(this.data.allGroups, '') },
  dismissKeyboard() { if (wx.hideKeyboard) wx.hideKeyboard() },
  writeReview() {
    if (!require('../../utils/auth-session').getToken()) {
      wx.showModal({
        title: '需要先登录',
        content: '写评价需要先登录，登录后即可提交评价。',
        confirmText: '去登录',
        success: (res) => { if (res.confirm) wx.switchTab({ url: '/pages/profile/index' }) }
      })
      return
    }
    wx.navigateTo({ url: '/pages/write-review/index' })
  },

  loadMore() {
    const next = this.data.page + 1
    const list = getReviewListState(this.data.filteredGroups, this.data.pageSize, next)
    this.setData(list)
  },
  openGroup(event) {
    const group = event.currentTarget.dataset.group
    const url = buildReviewGroupUrl(group)
    if (url) wx.navigateTo({ url })
  }
})
