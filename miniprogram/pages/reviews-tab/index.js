const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')

Page({
  data: { loading: true, error: '', allGroups: [], visibleGroups: [], page: 1, pageSize: 20, hasMore: false },
  onLoad() { reportVisit('/mp/reviews-tab'); this.loadGroups() },
  onPullDownRefresh() { this.loadGroups().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.loadMore() },
  async loadGroups() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await publicApi.getReviewGroups()
      const groups = Array.isArray(data) ? data : (data.items || [])
      const visible = groups.slice(0, this.data.pageSize)
      this.setData({ allGroups: groups, visibleGroups: visible, page: 1, hasMore: groups.length > this.data.pageSize, loading: false })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  loadMore() {
    const next = this.data.page + 1
    const end = next * this.data.pageSize
    const visible = this.data.allGroups.slice(0, end)
    this.setData({ visibleGroups: visible, page: next, hasMore: end < this.data.allGroups.length })
  },
  openGroup(event) {
    const group = event.currentTarget.dataset.group
    const key = group.group_key || group.key
    if (key) wx.navigateTo({ url: `/pages/course-reviews/index?group_key=${encodeURIComponent(key)}` })
  }
})
