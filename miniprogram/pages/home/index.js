const publicApi = require('../../services/public-api')
const navigation = require('../../utils/navigation')

Page({
  data: { loading: true, error: '', home: null, hotCourses: [], hasPublicContent: false },

  onLoad() { this.loadHome() },
  onPullDownRefresh() { this.loadHome().finally(() => wx.stopPullDownRefresh()) },

  async loadHome() {
    this.setData({ loading: true, error: '' })
    try {
      const home = await publicApi.getHome()
      const hotCourses = home.hot_courses || []
      const hasPublicContent = Boolean(home.announcement || hotCourses.length || home.latest_updates.length)
      this.setData({ home, hotCourses, hasPublicContent, loading: false })
    } catch (error) {
      this.setData({ loading: false, error: error.message })
    }
  },

  openSearch() { navigation.openSearch() },
  openCourse(event) { navigation.openCourse(event.detail.course.id) },
  openPage(event) {
    const url = event.currentTarget.dataset.url
    if (url.startsWith('/pages/courses') || url.startsWith('/pages/guides')) wx.switchTab({ url })
    else wx.navigateTo({ url })
  }
})
