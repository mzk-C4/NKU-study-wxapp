const { reportVisit } = require('../../utils/visit-report')

Page({
  data: { url: 'https://nkustudy.top/feedback' },
  onLoad() { reportVisit('/mp/feedback-web') }
})
