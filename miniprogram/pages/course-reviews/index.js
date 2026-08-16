const api = require('../../utils/request')

function uniqueOptions(offerings, valueKey, labelKey = valueKey) {
  const seen = new Set()
  return offerings.reduce((options, offering) => {
    const value = offering[valueKey]
    if (!value || seen.has(value)) return options
    seen.add(value)
    options.push({ value, label: offering[labelKey] || value })
    return options
  }, [])
}

function ratings(reviews) {
  const showAggregate = reviews.length >= 3
  const average = key => Math.round(reviews.reduce((sum, item) => sum + Number(item[key] || 0), 0) / reviews.length * 10) / 10
  return {
    show_aggregate: showAggregate,
    recommend: showAggregate ? average('recommend') : null,
    difficulty: showAggregate ? average('difficulty') : null,
    workload: showAggregate ? average('workload') : null,
    gain: showAggregate ? average('gain') : null
  }
}

Page({
  data: {
    id: '', loading: true, error: '', course: null, reviews: [], visibleReviews: [], offerings: [],
    teacherOptions: [{ value: '', label: '全部教师' }],
    yearOptions: [{ value: '', label: '全部学年' }],
    semesterOptions: [{ value: '', label: '全部学期' }],
    teacherFilterLabel: '全部教师', yearFilterLabel: '全部学年', semesterFilterLabel: '全部学期',
    filterIndexes: { teacher: 0, year: 0, semester: 0 },
    filteredRatings: ratings([]), hasActiveFilters: false
  },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadReviews() },

  async loadReviews() {
    this.setData({ loading: true, error: '' })
    try {
      const [course, data] = await Promise.all([api.get(`/courses/${this.data.id}`), api.get(`/courses/${this.data.id}/reviews`)])
      const teacherOptions = [{ value: '', label: '全部教师' }, ...uniqueOptions(data.offerings, 'teacher_id', 'teacher_name')]
      const yearOptions = [{ value: '', label: '全部学年' }, ...uniqueOptions(data.offerings, 'academic_year')]
      const semesterOptions = [{ value: '', label: '全部学期' }, ...uniqueOptions(data.offerings, 'semester', 'semester_label')]
      this.setData({
        course, reviews: data.items, visibleReviews: data.items, offerings: data.offerings,
        teacherOptions, yearOptions, semesterOptions, filteredRatings: ratings(data.items), loading: false
      })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  changeFilter(event) {
    const field = event.currentTarget.dataset.field
    const filterIndexes = { ...this.data.filterIndexes, [field]: Number(event.detail.value) }
    this.applyFilters(filterIndexes)
  },
  clearFilters() {
    this.applyFilters({ teacher: 0, year: 0, semester: 0 })
  },
  applyFilters(filterIndexes) {
    const teacherId = this.data.teacherOptions[filterIndexes.teacher].value
    const academicYear = this.data.yearOptions[filterIndexes.year].value
    const semester = this.data.semesterOptions[filterIndexes.semester].value
    const offeringIds = new Set(this.data.offerings.filter(item => (
      (!teacherId || item.teacher_id === teacherId) &&
      (!academicYear || item.academic_year === academicYear) &&
      (!semester || item.semester === semester)
    )).map(item => item.id))
    const visibleReviews = this.data.reviews.filter(item => offeringIds.has(item.offering_id))
    this.setData({
      filterIndexes,
      visibleReviews,
      filteredRatings: ratings(visibleReviews),
      teacherFilterLabel: this.data.teacherOptions[filterIndexes.teacher].label,
      yearFilterLabel: this.data.yearOptions[filterIndexes.year].label,
      semesterFilterLabel: this.data.semesterOptions[filterIndexes.semester].label,
      hasActiveFilters: Boolean(teacherId || academicYear || semester)
    })
  },
  openTab(event) {
    const page = event.currentTarget.dataset.tab === 'overview' ? 'course-overview' : 'course-resources'
    wx.redirectTo({ url: `/pages/${page}/index?id=${this.data.id}` })
  },
  async writeReview() {
    try { await getApp().ensureLogin(); wx.navigateTo({ url: `/pages/write-review/index?course_id=${this.data.id}` }) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  }
})
