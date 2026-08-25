const ROUTES = {
  overview: '/pages/course-overview/index',
  resources: '/pages/course-resources/index',
  reviews: '/pages/course-reviews/index'
}

Component({
  properties: {
    courseId: { type: String, value: '' },
    active: { type: String, value: 'overview' },
    resourceCount: { type: Number, value: 0 },
    reviewCount: { type: Number, value: 0 }
  },
  methods: {
    selectTab(event) {
      const tab = event.currentTarget.dataset.tab
      const route = ROUTES[tab]
      if (!route || !this.data.courseId || tab === this.data.active) return
      wx.redirectTo({ url: `${route}?id=${encodeURIComponent(this.data.courseId)}` })
    }
  }
})
