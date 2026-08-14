const { publicApi } = require('../../services/public-api')

Page({
  data: { id: '', groupKey: '', loading: true, error: '', course: null, reviews: [], visibleReviews: [], teacherGroups: [], teacher: '', standaloneGroup: null },
  onLoad(options) { this.setData({ id: options.id || '', groupKey: options.group_key || '' }); this.loadReviews() },
  async loadReviews() {
    this.setData({ loading: true, error: '' })
    try {
      if (this.data.groupKey) {
        const group = await publicApi.getReviewGroup(this.data.groupKey)
        const course = group.matched ? await publicApi.getCourse(group.course_id) : null
        this.setData({ id: course?.id || '', course, standaloneGroup: group, reviews: group.items || [], visibleReviews: group.items || [], teacherGroups: [{ id: group.group_key, teacher_name: group.teacher_name }], teacher: group.teacher_name, loading: false })
        wx.setNavigationBarTitle({ title: `${group.course_name}评价` })
        return
      }
      if (!this.data.id) throw new Error('缺少课程编号或评价分组')
      const course = await publicApi.getCourse(this.data.id)
      const groups = await publicApi.getCourseReviewGroups(course)
      const reviews = groups.flatMap(group => group.items || [])
      this.setData({ course, reviews, visibleReviews: reviews, teacherGroups: course.teacher_groups, loading: false })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseTeacher(event) {
    const teacher = event.currentTarget.dataset.teacher || ''
    const visibleReviews = teacher ? this.data.reviews.filter(item => item.teacher_name === teacher) : this.data.reviews
    this.setData({ teacher, visibleReviews })
  },
  openTab(event) {
    const page = event.currentTarget.dataset.tab === 'overview' ? 'course-overview' : 'course-resources'
    wx.redirectTo({ url: `/pages/${page}/index?id=${this.data.id}` })
  },
  writeReview() {
    const courseId = this.data.course?.id || this.data.id
    if (!courseId) return wx.showToast({ title: '历史评价未匹配当前课程，暂不能投稿', icon: 'none' })
    wx.navigateTo({ url: `/pages/write-review/index?course_id=${encodeURIComponent(courseId)}` })
  }
})
