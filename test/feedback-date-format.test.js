const test = require('node:test')
const assert = require('node:assert/strict')

global.wx = { showToast: () => {} }
global.Page = () => {}
const { beijingDateLabel } = require('../miniprogram/pages/feedback/index.js')

test('UTC timestamps render as Beijing dates (year-month-day only)', () => {
  assert.equal(beijingDateLabel('2026-08-27T06:07:17.581Z'), '2026-08-27', '06:07 UTC = 14:07 北京，同日')
  assert.equal(beijingDateLabel('2026-08-27T17:30:00.000Z'), '2026-08-28', '17:30 UTC = 次日 01:30 北京，日期进一天')
  assert.equal(beijingDateLabel('2026-01-01T00:00:00.000Z'), '2026-01-01', '0点 UTC = 8点 北京')
  assert.equal(beijingDateLabel('2026-12-31T16:59:59.999Z'), '2027-01-01', '跨年也要进位')
  assert.equal(beijingDateLabel(''), '')
  assert.equal(beijingDateLabel(undefined), '')
  assert.equal(beijingDateLabel('not-a-date'), '')
})
