const test = require('node:test')
const assert = require('node:assert/strict')

const storage = new Map()
let response = { statusCode: 200, data: { code: 0, data: { ok: true } } }
let lastRequest = null

global.wx = {
  getAccountInfoSync() { return { miniProgram: { envVersion: 'release' } } },
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) },
  request(options) { lastRequest = options; options.success(response) }
}

const authSession = require('../miniprogram/utils/auth-session')
const request = require('../miniprogram/utils/request')
const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890'

test.beforeEach(() => {
  storage.clear()
  lastRequest = null
  response = { statusCode: 200, data: { code: 0, data: { ok: true } } }
})

test('required authentication fails before a network request when logged out', async () => {
  await assert.rejects(request.get('/me', undefined, { auth: 'required' }), error => error.code === 'AUTH_REQUIRED')
  assert.equal(lastRequest, null)
})

test('optional authentication attaches the stored bearer token on browsing', async () => {
  authSession.saveSession({ token, expires_in: 60, user: { id: 1 } })
  await request.get('/review-groups', undefined, { auth: 'optional' })
  assert.equal(lastRequest.header.authorization, `Bearer ${token}`)
})

test('a 401 response clears the rejected local session', async () => {
  authSession.saveSession({ token, expires_in: 60, user: { id: 1 } })
  response = { statusCode: 401, data: { code: 'AUTH_REQUIRED', message: '请先登录。' } }
  await assert.rejects(request.get('/me', undefined, { auth: 'required' }), error => error.statusCode === 401)
  assert.equal(authSession.readSession(), null)
})

test('a late profile-save 401 cannot clear a replacement login session', async t => {
  const originalRequest = global.wx.request
  t.after(() => { global.wx.request = originalRequest })
  let pending
  global.wx.request = options => { pending = options }
  authSession.saveSession({ token, expires_in: 60, user: { id: 1 } })
  const saving = request.post('/me/profile', { avatar_url: 'https://example.com/avatar.jpg' }, { auth: 'required' })
  const rejected = assert.rejects(saving, error => error.statusCode === 401)
  const newToken = `${token}-replacement`
  authSession.saveSession({ token: newToken, expires_in: 60, user: { id: 2 } })
  pending.success({ statusCode: 401, data: { code: 'AUTH_REQUIRED' } })
  await rejected
  assert.equal(authSession.getToken(), newToken)
})

test('review API rejects missing and expired sessions before any network call', async () => {
  const { publicApi } = require('../miniprogram/services/public-api')
  for (const stored of [null, { token, expires_at: Date.now() - 1, user: { id: 1 } }]) {
    if (stored) storage.set(authSession.STORAGE_KEY, stored)
    await assert.rejects(publicApi.submitReview({ course_id: 'test', body: 'test' }), error => error.code === 'AUTH_REQUIRED')
    assert.equal(lastRequest, null)
  }
})

test('review API requires a bearer token, forces non-anonymous payload and clears rejected session', async () => {
  const { publicApi } = require('../miniprogram/services/public-api')
  authSession.saveSession({ token, expires_in: 60, user: { id: 1 } })
  await publicApi.submitReview({ course_id: 'test', body: 'test', anonymous: true })
  assert.equal(lastRequest.method, 'POST')
  assert.equal(lastRequest.header.authorization, `Bearer ${token}`)
  assert.equal(lastRequest.data.anonymous, false)
  response = { statusCode: 401, data: { code: 'AUTH_REQUIRED' } }
  await assert.rejects(publicApi.submitReview({ body: 'test' }), error => error.statusCode === 401)
  assert.equal(authSession.readSession(), null)
})
