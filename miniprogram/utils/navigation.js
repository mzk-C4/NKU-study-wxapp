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

function openGuideCategory(category = '') {
  const normalized = String(category == null ? '' : category).trim().slice(0, 40)
  const suffix = normalized ? `?category=${encodeURIComponent(normalized)}` : ''
  wx.navigateTo({ url: `/pages/guide-category/index${suffix}` })
}

function openGuideSearch(query = '') {
  wx.navigateTo({ url: '/pages/guide-search/index?q=' + encodeURIComponent(String(query).slice(0, 80)) })
}

function openGuideDocuments() {
  wx.navigateTo({ url: '/pages/guide-documents/index' })
}

function openCampusMap() {
  wx.navigateTo({ url: '/pages/campus-map/index' })
}

module.exports = {
  openCampusMap,
  openCourse,
  openSearch,
  openCourseResources,
  openGuide,
  openGuideCategory,
  openGuideSearch,
  openGuideDocuments
}
