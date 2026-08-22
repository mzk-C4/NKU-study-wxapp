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

test('optional authentication attaches the stored bearer token', async () => {
  authSession.saveSession({ token, expires_in: 60, user: { id: 1 } })
  await request.post('/reviews', { body: 'test' }, { auth: 'optional' })
  assert.equal(lastRequest.header.authorization, `Bearer ${token}`)
})

test('a 401 response clears the rejected local session', async () => {
  authSession.saveSession({ token, expires_in: 60, user: { id: 1 } })
  response = { statusCode: 401, data: { code: 'AUTH_REQUIRED', message: '请先登录。' } }
  await assert.rejects(request.get('/me', undefined, { auth: 'required' }), error => error.statusCode === 401)
  assert.equal(authSession.readSession(), null)
})