function openCourse(courseId) {
  if (!courseId) return
  wx.navigateTo({ url: `/pages/course-overview/index?id=${encodeURIComponent(courseId)}` })
}

function openSearch(query = '') {
  wx.navigateTo({ url: `/pages/search/index?q=${encodeURIComponent(query)}` })
}

module.exports = { openCourse, openSearch }
