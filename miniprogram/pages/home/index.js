const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const navigation = require('../../utils/navigation')

Page({
  data: { loading: true, error: '', home: null, hotCourses: [], latestUpdates: [] },

  onLoad() { reportVisit('/mp/home'); this.loadHome() },
  onPullDownRefresh() { this.loadHome().finally(() => wx.stopPullDownRefresh()) },

  async loadHome() {
    this.setData({ loading: true, error: '' })
    try {
      const home = await publicApi.getHome()
      this.setData({ home, hotCourses: home.hot_courses || [], latestUpdates: this.buildUpdates(home.latest_updates), loading: false })
    } catch (error) {
      this.setData({ loading: false, error: error.message })
    }
  },

  // 把多行简介整理为「引导语 + 分点要点」：带序号或圆点开头的行进入要点，其余按顺序归入引导语或上一个要点
  buildUpdates(items) {
    const POINT_PATTERN = /^([-*•]|(\d+[.、)]))\s*(.+)$/
    return (items || []).map(item => {
      const lines = String(item.summary || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      const lead = []
      const points = []
      for (const line of lines) {
        const match = POINT_PATTERN.exec(line)
        if (match) {
          points.push({ text: match[3] })
        } else if (points.length) {
          points[points.length - 1].text += line
        } else {
          lead.push(line)
        }
      }
      return {
        id: item.id,
        title: item.title,
        updated: item.updated,
        lead: lead.join(' '),
        points: points.map((point, index) => ({ id: index, text: point.text })),
        hasPoints: points.length > 0
      }
    })
  },

  openSearch() { navigation.openSearch() },
  openCourse(event) { navigation.openCourse(event.detail.course.id) },
  openUpdate(event) {
    const id = event.currentTarget.dataset.id
    if (id) navigation.openCourse(id)
  },
  openPage(event) {
    const url = event.currentTarget.dataset.url
    if (url.startsWith('/pages/courses') || url.startsWith('/pages/guides')) wx.switchTab({ url })
    else wx.navigateTo({ url })
  }
})