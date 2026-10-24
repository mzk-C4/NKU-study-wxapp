const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const contract = require('../miniprogram/features/community-support/contract')
const support = require('../miniprogram/features/community-support')
const { createPublicApi } = require('../miniprogram/services/public-api')
const valid = { version: 1, enabled: true, revision: 5, flowers: 25, coins: 12, review_rule: 'approved', download_reporting: true, personal_stats: true }
const resource = { id: 'resource-1', course_id: 'course-1' }
function setup(overrides = {}, token = '') {
  const calls = []
  let current = token
  const api = { getHome: async () => ({ community_support: valid }),
    recordCommunityDownload: async event => { calls.push(event); return { event_id: event.event_id, recorded: true, community_support: { ...valid, revision: 6, flowers: 26 } } },
    getMyCommunitySupport: async () => ({ flowers: 25, coins: 12 }), ...overrides }
  return { api, calls, service: support.createCommunitySupport(api, { getToken: () => current }), token(value) { current = value } }
}
test('support contract rejects invented/invalid totals, strips extras, and formats compact icon labels', () => {
  for (const raw of [undefined, {}, { ...valid, flowers: -1 }, { ...valid, coins: '12' }, { ...valid, revision: undefined }, { ...valid, enabled: false }, { ...valid, version: 2 }]) assert.equal(contract.publicStats(raw), null)
  assert.deepEqual(contract.publicStats({ ...valid, private: 'removed' }), valid)
  assert.equal(contract.countLabel(null), '—')
  assert.equal(contract.countLabel(0), '0')
  assert.equal(contract.countLabel(12500), '1.3万')
})
test('levels require BOTH ten flowers and ten coins per level, with carry-over', () => {
  for (const [flowers, coins, level, needFlowers, needCoins] of [[0, 0, 1, 10, 10], [10, 9, 1, 0, 1], [10, 10, 2, 10, 10], [25, 12, 2, 0, 8], [30, 30, 4, 10, 10], [100, 0, 1, 0, 10]]) {
    const result = contract.personalStats({ flowers, coins, level: 999 })
    assert.equal(result.level, level)
    assert.equal(result.flowersNeeded, needFlowers)
    assert.equal(result.coinsNeeded, needCoins)
    assert.ok(result.flowerProgress >= 0 && result.flowerProgress <= 100)
    assert.ok(result.coinProgress >= 0 && result.coinProgress <= 100)
  }
  assert.equal(contract.personalStats({ flowers: NaN, coins: 1 }), null)
})
test('missing capability makes zero writes and never claims an unavailable backend counted a flower', async () => {
  const h = setup({ getHome: async () => ({}) })
  assert.equal(await h.service.downloaded(resource), 'unavailable')
  assert.equal(h.calls.length, 0)
  assert.equal(h.service.snapshot(), null)
  assert.equal(h.service.takeNotice().state, 'unavailable')
})
test('download sends only a bounded asset reference, unique event, and account attribution; receipt sets totals', async () => {
  const h = setup({}, 'session-a')
  await h.service.downloaded({ ...resource, download_url: 'secret-file-location', title: 'private title' })
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].attribution, 'account')
  assert.equal(h.calls[0].kind, 'resource')
  assert.equal(h.calls[0].download_url, undefined)
  assert.equal(h.calls[0].title, undefined)
  assert.equal(h.service.snapshot().flowers, 26)
  assert.equal(h.service.takeNotice().state, 'recorded')
  await h.service.downloaded(resource)
  assert.notEqual(h.calls[0].event_id, h.calls[1].event_id)
})
test('anonymous and switched-account downloads never get credited to a later account', async () => {
  const anonymous = setup()
  await anonymous.service.downloaded(resource)
  assert.equal(anonymous.calls[0].attribution, 'community')
  let resolve
  const h = setup({ getHome: () => new Promise(r => { resolve = r }) }, 'a')
  const pending = h.service.downloaded(resource)
  h.token('b'); resolve({ community_support: valid }); await pending
  assert.equal(h.calls[0].attribution, 'community')
})
test('failed or mismatched receipts never increment totals and do not throw into download callers', async () => {
  for (const record of [async () => { throw Error('internal') }, async () => ({ recorded: true, event_id: 'other' }), async () => ({ recorded: false })]) {
    const h = setup({ recordCommunityDownload: record })
    assert.equal(await h.service.downloaded(resource), 'failed')
    assert.equal(h.service.snapshot().flowers, 25)
    assert.equal(h.service.takeNotice().message.includes('internal'), false)
  }
})

test('account captured at transfer start prevents crediting a later login', async () => {
  const h = setup({}, 'new-account')
  await h.service.downloaded(resource, 'resource', 'old-account')
  await h.service.downloaded({ id: 'source-1' }, 'guide_source', '')
  assert.deepEqual(h.calls.map(event => event.attribution), ['community', 'community'])
})
test('late lower-revision home totals cannot overwrite a newer ledger snapshot', () => {
  const h = setup()
  h.service.setPublic(valid)
  h.service.setPublic({ ...valid, revision: 4, flowers: 1 })
  assert.equal(h.service.snapshot().flowers, 25)
  h.service.setPublic({ ...valid, revision: 6, coins: 11 })
  assert.equal(h.service.snapshot().coins, 11, 'a newer moderation correction may lower totals')
})
test('personal statistics require capability and session, discard late responses after switch/logout', async () => {
  const anon = setup({ getMyCommunitySupport() { throw Error('must not call') } })
  assert.equal(await anon.service.loadPersonal(), null)
  const disabled = setup({ getHome: async () => ({}) }, 'a')
  assert.equal(await disabled.service.loadPersonal(), null)
  let resolve, called = false
  const h = setup({ getMyCommunitySupport: () => { called = true; return new Promise(r => { resolve = r }) } }, 'a')
  const pending = h.service.loadPersonal()
  for (let n = 0; n < 10 && !called; n++) await Promise.resolve()
  assert.equal(called, true)
  h.token('b'); resolve({ flowers: 900, coins: 900 })
  assert.equal(await pending, null)
  assert.equal((await setup({}, 'a').service.loadPersonal()).level, 2)
})
test('live review contract waits for moderation statistics and never trusts submission coin receipts', () => {
  const h = setup(), completed = []
  h.service.reviewSubmitted({}, () => completed.push('closed'))
  const notice = h.service.takeNotice()
  assert.equal(notice.state, 'pending')
  assert.equal(h.calls.length, 0)
  h.service.finishNotice(notice)
  assert.deepEqual(completed, ['closed'])
  h.service.reviewSubmitted({ community_support_receipt: { kind: 'coin', recorded: true, review_id: 'r1' } })
  assert.equal(h.service.takeNotice().state, 'pending')
  h.service.mute()
  h.service.reviewSubmitted({}, () => completed.push('muted'))
  assert.deepEqual(completed, ['closed', 'muted'])
  assert.equal(h.service.takeNotice(), null)
})

test('503 disables cached statistics and fences late download receipts until fresh capability recovers', async () => {
  let resolveFirst, count = 0
  const h = setup({ recordCommunityDownload: event => {
    if (++count === 1) return new Promise(resolve => { resolveFirst = () => resolve({ event_id: event.event_id, recorded: true, community_support: { ...valid, revision: 6 } }) })
    return Promise.reject(Object.assign(Error('unavailable'), { code: 'SUPPORT_UNAVAILABLE', statusCode: 503 }))
  } }, 'a')
  h.service.setPublic(valid)
  const first = h.service.downloaded(resource)
  for (let n = 0; n < 10 && !resolveFirst; n++) await Promise.resolve()
  assert.equal(await h.service.downloaded(resource), 'failed')
  assert.equal(h.service.snapshot(), null)
  resolveFirst(); await first
  assert.equal(h.service.snapshot(), null, 'late success must not revive disabled statistics')
  h.service.setPublic({ ...valid, revision: 4 })
  assert.equal(h.service.snapshot(), null, 'revision high-water mark survives disabled state')
  h.service.setPublic({ ...valid, revision: 7 })
  assert.equal(h.service.snapshot().revision, 7)
})

test('authenticated 401 and rate limits never retry as anonymous or invent an increment', async () => {
  for (const code of ['AUTH_REQUIRED', 'RATE_LIMITED']) {
    let calls = 0
    const h = setup({ recordCommunityDownload: async event => {
      calls++; assert.equal(event.attribution, 'account')
      throw Object.assign(Error('rejected'), { code })
    } }, 'a')
    assert.equal(await h.service.downloaded(resource), 'failed')
    assert.equal(calls, 1)
    assert.equal(h.service.snapshot().flowers, 25)
  }
  const expired = setup({}, '')
  assert.equal(await expired.service.downloaded(resource, 'resource', 'expired-account'), 'failed')
  assert.equal(expired.calls.length, 0, 'expired or cleared account cannot silently report anonymously')
})

test('live download contract requires matching resource course context and source events omit it', async () => {
  assert.equal(contract.downloadEvent({ event_id: 'mp_live_context_0001', kind: 'resource', resource_id: 'r1' }), null)
  assert.equal(contract.downloadEvent({ event_id: 'mp_live_context_0001', kind: 'guide_source', resource_id: 's1', course_id: 'c1' }), null)
  const api = createPublicApi({ get: async () => ({ course_id: 'c1', items: [{ id: 'r1', title: 'file' }] }) }, { apiProfile: 'production' })
  assert.equal((await api.getCourseResources('c1')).items[0].course_id, 'c1')
})
test('adapter protects personal endpoint, normalizes payloads and uses bounded timeout', async () => {
  const calls = []
  const client = {
    get: async (...args) => { calls.push(args); return { flowers: 2, coins: 1, private: 'removed' } },
    post: async (...args) => { calls.push(args); return { event_id: args[1].event_id, recorded: true, community_support: valid, private: 'removed' } }
  }
  const api = createPublicApi(client, { apiProfile: 'production' })
  assert.deepEqual(await api.getMyCommunitySupport(), { flowers: 2, coins: 1 })
  assert.equal(calls[0][0], '/me/community-support')
  assert.deepEqual(calls[0][2], { auth: 'required', timeout: 6000 })
  const event = { event_id: 'mp_test_event_12345', kind: 'resource', resource_id: 'r1', course_id: 'c1', attribution: 'account' }
  const receipt = await api.recordCommunityDownload({ ...event, user_id: 'forged', download_url: 'private' })
  assert.deepEqual(calls[1][1], event)
  assert.deepEqual(calls[1][2], { auth: 'required', timeout: 6000 })
  assert.equal(receipt.private, undefined)
  await api.recordCommunityDownload({ ...event, attribution: 'community' })
  assert.equal(calls[2][2].auth, 'none')
  await assert.rejects(api.recordCommunityDownload({ ...event, event_id: 'bad' }))
  assert.equal(calls.length, 3)
})
test('download hook fires only after HTTP 200 and a local file, even when preview fails; duplicate callback ignored', async t => {
  const original = global.wx
  t.after(() => { global.wx = original })
  let callback, counted = 0
  t.mock.method(support, 'downloaded', async () => { counted++ })
  global.wx = { showLoading() {}, hideLoading() {}, showModal() {}, downloadFile(options) { callback = options; return {} }, openDocument(options) { options.fail() } }
  const { downloadResource } = require('../miniprogram/utils/resource-download')
  const item = { id: 'r', extension: 'pdf', download_url: 'https://resources.nkustudy.top/test.pdf' }
  let task = downloadResource(item)
  callback.success({ statusCode: 404, tempFilePath: '/missing' }); await task
  assert.equal(counted, 0)
  task = downloadResource(item)
  callback.success({ statusCode: 200, tempFilePath: '/file' })
  callback.success({ statusCode: 200, tempFilePath: '/file' }); await task
  assert.equal(counted, 1)
})
test('header is icon-and-number only, rules follow collaborators, private card has no public profile route', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '../miniprogram', file), 'utf8')
  const template = read('components/community-support/index.wxml')
  const header = template.split('<view wx:if="{{mode === \'rules\'}}"')[0]
  assert.match(header, /flower.svg/)
  assert.match(header, /coin.svg/)
  assert.doesNotMatch(header, /<text>鲜花|<text>硬币/)
  const home = read('pages/home/index.wxml')
  assert.ok(home.indexOf('mode="rules"') > home.indexOf('class="collaborators section"'))
  assert.match(read('pages/profile/index.wxml'), /mode="personal" account=/)
  assert.doesNotMatch(read('features/community-support/index.js'), /setStorageSync|requestPayment/)
  for (const file of ['components/community-support/index.js', 'pages/home/index.js', 'pages/write-review/index.js', 'utils/resource-download.js', 'utils/source-opener.js']) {
    assert.match(read(file), /require\(['"][^'"]*features\/community-support\/index['"]\)/, 'native WeChat requires explicit module filename')
  }
})

test('component consumes notices only on visible unblocked pages and clears stale personal data', async t => {
  const componentPath = require.resolve('../miniprogram/components/community-support/index')
  const originalComponent = global.Component
  let definition
  global.Component = value => { definition = value }
  delete require.cache[componentPath]
  require(componentPath)
  global.Component = originalComponent
  t.after(() => { delete require.cache[componentPath]; global.Component = originalComponent })
  let taken = 0, closed = 0
  t.mock.method(support, 'snapshot', () => null)
  t.mock.method(support, 'takeNotice', () => { taken++; return { kind: 'flower', onClose: () => { closed++ } } })
  const component = { ...definition.methods, _attached: true, _active: false,
    properties: { mode: 'thanks', blocked: false }, data: { ...definition.data },
    setData(value) { Object.assign(this.data, value) } }
  component.refreshSupport()
  assert.equal(taken, 0)
  component._active = true; component.properties.blocked = true
  component.refreshSupport()
  assert.equal(taken, 0)
  component.properties.blocked = false
  component.refreshSupport(); component.refreshSupport()
  assert.equal(taken, 1)
  assert.equal(component.data.notice.onClose, undefined, 'functions never cross setData')
  component._active = false; component.closeThanks()
  assert.equal(closed, 1)

  const auth = require('../miniprogram/utils/auth-session')
  let token = 'a', resolve
  t.mock.method(auth, 'getToken', () => token)
  t.mock.method(support, 'loadPersonal', () => new Promise(r => { resolve = r }))
  component.properties = { mode: 'personal', account: 'a' }
  component.data.personal = { flowers: 500, coins: 500 }
  const loading = component.refreshPersonal()
  assert.equal(component.data.personal, null)
  token = 'b'
  resolve({ flowers: 10, coins: 10, level: 2 }); await loading
  assert.equal(component.data.personal, null)
  assert.equal(component.data.personalLoading, false)
})
