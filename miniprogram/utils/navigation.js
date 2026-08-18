function openCourse(courseId) {
  if (!courseId) return
  wx.navigateTo({ url: `/pages/course-overview/index?id=${encodeURIComponent(courseId)}` })
}

function openSearch(query = '') {
  wx.navigateTo({ url: `/pages/search/index?q=${encodeURIComponent(query)}` })
}

function openCourseResources(courseId) {
  if (!courseId) return
  wx.navigateTo({ url: `/pages/course-resources/index?id=${encodeURIComponent(courseId)}` })
}

function openGuide(guideId) {
  if (!guideId) return
  wx.navigateTo({ url: `/pages/guide-detail/index?id=${encodeURIComponent(guideId)}` })
}

module.exports = { openCourse, openSearch, openCourseResources, openGuide }
