const { reportVisit } = require('../../utils/visit-report')

Page({
  data: { url: 'https://nkustudy.top/participate/' },
  onLoad() { reportVisit('/mp/participate-web') }
})
