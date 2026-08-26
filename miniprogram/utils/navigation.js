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

function openGuideAssistant(question = '', options = {}) {
  const normalized = String(question == null ? '' : question).trim().slice(0, 1000)
  const params = []
  if (normalized) params.push(`question=${encodeURIComponent(normalized)}`)
  if (options.previewAnswer === true) params.push('preview=answer')
  else if (options.previewNetworkError === true) params.push('preview=network-error')
  const suffix = params.length ? `?${params.join('&')}` : ''
  wx.navigateTo({ url: `/pages/guide-assistant/index${suffix}` })
}

module.exports = {
  openCourse,
  openSearch,
  openCourseResources,
  openGuide,
  openGuideCategory,
  openGuideAssistant
}
