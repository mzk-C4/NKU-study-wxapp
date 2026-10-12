const { courseCardTags, formatBrowseCount } = require('../../utils/list-card-presentation')

Component({
  options: { styleIsolation: 'shared' },
  properties: { course: Object },
  data: { displayTags: [], browseCountLabel: '' },
  observers: {
    course(course) {
      this.setData({ displayTags: courseCardTags(course), browseCountLabel: formatBrowseCount(course && course.view_count) })
    }
  },
  methods: {
    select() { this.triggerEvent('select', { course: this.data.course }) }
  }
})
