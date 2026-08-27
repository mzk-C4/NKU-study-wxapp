const test = require('node:test')
const assert = require('node:assert/strict')

const { buildSiteStatus, formatRuntime, formatVisitCount } = require('../miniprogram/utils/site-status')

test('site status formats the shared total and runtime compactly', () => {
  const now = new Date('2026-08-25T16:00:00+08:00').getTime()
  assert.deepEqual(buildSiteStatus({
    total: 12345,
    startedAt: '2026-07-14T16:00:00+08:00'
  }, now), {
    runtimeValue: '42天',
    visitValue: '12,345'
  })
})

test('site status handles year boundaries and rejects invalid data', () => {
  const start = '2025-01-01T00:00:00Z'
  assert.equal(formatRuntime(start, new Date('2026-01-02T00:00:00Z').getTime()), '1年1天')
  assert.equal(formatVisitCount(618), '618')
  assert.equal(buildSiteStatus({ total: -1, startedAt: start }), null)
  assert.equal(buildSiteStatus({ total: 1, startedAt: 'not-a-date' }), null)
})

test('site status remains visible while the website rolls out startedAt', () => {
  const now = new Date('2026-08-25T16:00:00+08:00').getTime()
  assert.deepEqual(buildSiteStatus({ total: 618 }, now), {
    runtimeValue: '42天',
    visitValue: '618'
  })
})
