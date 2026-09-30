const test = require('node:test')
const assert = require('node:assert/strict')
const auth = require('../miniprogram/utils/auth-session')
const request = require('../miniprogram/utils/request')
const { createPublicApi } = require('../miniprogram/services/public-api')
const previousPage = global.Page
global.Page = () => {}
const { createProfilePage } = require('../miniprogram/pages/profile/index')
global.Page = previousPage

const token = 'avatar-upload-fixture-abcdefghijklmnopqrstuvwxyz'
const avatarUrl = 'https://resources.nkustudy.top/avatars/abcdefghijklmnopqrstuv.jpg'
const filePath = 'wxfile://tmp/selected-avatar.png'
const initialUser = { id: 7, nickname: '原昵称', avatar_url: 'https://example.com/old.jpg' }

function setup(t) {
  const previousWx = global.wx
  const storage = new Map()
  const f = {
    uploads: [], requests: [], inspections: [], toasts: [],
    size: 1024, info: { type: 'jpeg', width: 512, height: 512 },
    response: { statusCode: 200, data: JSON.stringify({ code: 0, data: { avatar_url: avatarUrl } }) },
    user: { ...initialUser }
  }
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showToast: value => f.toasts.push(value),
    getFileSystemManager: () => ({ getFileInfo(options) {
      f.inspections.push(options.filePath)
      if (f.fileFail) options.fail({ errMsg: 'private local path' })
      else options.success({ size: f.size })
    } }),
    getImageInfo(options) {
      f.inspections.push(options.src)
      if (f.imageFail) options.fail({ errMsg: 'private image details' })
      else options.success(f.info)
    },
    uploadFile(options) { f.uploads.push(options); options.success(f.response) },
    request(options) {
      f.requests.push(options)
      const route = options.url.replace('https://nkustudy.top/api/v1', '')
      if (route === '/me/profile') {
        f.user = { ...f.user, ...options.data }
        options.success({ statusCode: 200, data: { code: 0, data: { user: f.user } } })
      } else if (route === '/me') {
        options.success({ statusCode: 200, data: { code: 0, data: { user: f.user } } })
      } else if (route === '/me/favorites' || route === '/me/reviews') {
        options.success({ statusCode: 200, data: { code: 0, data: { items: [], total: 0 } } })
      } else assert.fail(`Unexpected fixture request: ${route}`)
    }
  }
  t.after(() => { global.wx = previousWx })
  auth.saveSession({ token, expires_in: 3600, user: f.user })
  f.api = createPublicApi(request, { apiProfile: 'production' })
  f.page = () => {
    const page = createProfilePage(f.api, auth)
    page.data = { ...page.data, user: auth.readSession()?.user, isLoggedIn: Boolean(auth.readSession()), avatarSupported: true }
    page.setData = patch => Object.assign(page.data, patch)
    return page
  }
  return f
}

test('real adapter sends the documented multipart upload with the existing bearer token', async t => {
  const f = setup(t)
  assert.equal(f.api.isAvatarUploadAvailable(), true)
  assert.deepEqual(await f.api.uploadAvatar(filePath), { avatar_url: avatarUrl })
  const sent = f.uploads[0]
  assert.equal(sent.url, 'https://nkustudy.top/api/v1/me/avatar')
  assert.equal(sent.filePath, filePath)
  assert.equal(sent.name, 'file')
  assert.equal(sent.timeout, 60000)
  assert.deepEqual(sent.header, { authorization: `Bearer ${token}` })
  assert.equal(sent.formData, undefined)
  assert.equal(f.requests.length, 0, 'upload does not bind the profile')
})

test('missing and expired login prevent file inspection and upload', async t => {
  const f = setup(t)
  for (const session of [null, { token, expires_at: Date.now() - 1, user: initialUser }]) {
    if (session) wx.setStorageSync(auth.STORAGE_KEY, session)
    else auth.clearSession()
    await assert.rejects(f.api.uploadAvatar(filePath), { code: 'AUTH_REQUIRED' })
  }
  assert.equal(f.inspections.length + f.uploads.length, 0)
})

test('local file limits accept exactly 2 MiB and 4096 pixels including simulator paths', async t => {
  const f = setup(t)
  f.size = 2097152
  f.info = { type: 'png', width: 4096, height: 4096 }
  await f.api.uploadAvatar('http://tmp/selected.png')
  assert.equal(f.uploads[0].filePath, 'http://tmp/selected.png')
})

for (const [label, patch, code] of [
  ['oversized bytes', { size: 2097153 }, 'AVATAR_TOO_LARGE'],
  ['oversized width', { info: { type: 'jpeg', width: 4097, height: 20 } }, 'AVATAR_TOO_LARGE'],
  ['oversized height', { info: { type: 'jpeg', width: 20, height: 4097 } }, 'AVATAR_TOO_LARGE'],
  ['empty file', { size: 0 }, 'AVATAR_INVALID_IMAGE'],
  ['missing file', { fileFail: true }, 'AVATAR_INVALID_IMAGE'],
  ['decode failure', { imageFail: true }, 'AVATAR_INVALID_IMAGE'],
  ['GIF disguised as PNG', { info: { type: 'gif', width: 256, height: 256 } }, 'AVATAR_INVALID_IMAGE']
]) {
  test(`${label} is rejected before uploading and keeps the session`, async t => {
    const f = setup(t)
    Object.assign(f, patch)
    await assert.rejects(f.api.uploadAvatar(filePath), { code })
    assert.equal(f.uploads.length, 0)
    assert.equal(auth.getToken(), token)
    if (patch.fileFail || patch.size === 2097153) assert.equal(f.inspections.length, 1)
  })
}

test('a login change during image inspection cannot upload under the new account', async t => {
  const f = setup(t)
  wx.getImageInfo = options => {
    auth.saveSession({ token: `${token}-new`, expires_in: 3600, user: { id: 8 } })
    options.success(f.info)
  }
  await assert.rejects(f.api.uploadAvatar(filePath), { code: 'AVATAR_SESSION_CHANGED' })
  assert.equal(f.uploads.length, 0)
  assert.equal(auth.readSession().user.id, 8)
})

test('invalid HTTP, JSON and business responses never become upload success', async t => {
  const f = setup(t)
  for (const response of [
    { statusCode: '200', data: f.response.data },
    { statusCode: 500, data: f.response.data },
    { statusCode: 200, data: '<html>upstream private details</html>' },
    { statusCode: 200, data: JSON.stringify({ code: '0', data: { avatar_url: avatarUrl } }) },
    { statusCode: 200, data: JSON.stringify({ code: 0, data: [] }) },
    { statusCode: 503, data: JSON.stringify({ code: 'AUTH_REQUIRED' }) },
    { statusCode: 204, data: '' }
  ]) {
    f.response = response
    await assert.rejects(f.api.uploadAvatar(filePath), error => error.code === 'UPLOAD_FAILED' && !/private/.test(error.message))
  }
  assert.equal(auth.getToken(), token)
})

test('upload and profile binding reject URLs outside the documented avatar namespace', async t => {
  const f = setup(t)
  for (const url of [
    '', filePath, 'https://example.com/avatars/abcdefghijklmnopqrstuv.jpg',
    avatarUrl.replace('https:', 'http:'), avatarUrl.replace('/avatars/', '/resources/'),
    avatarUrl.replace('resources.nkustudy.top', 'resources.nkustudy.top.evil.test'),
    avatarUrl.replace('resources.nkustudy.top', 'resources.nkustudy.top@evil.test'),
    `${avatarUrl}?token=private`, `${avatarUrl}#fragment`, avatarUrl.replace('.jpg', '.png'),
    avatarUrl.replace('abcdefghijklmnopqrstuv', '../abcdefghijklmnopqrstuv')
  ]) {
    f.response = { statusCode: 200, data: JSON.stringify({ code: 0, data: { avatar_url: url } }) }
    await assert.rejects(f.api.uploadAvatar(filePath), { code: 'INVALID_AVATAR_URL' })
    await assert.rejects(f.api.updateProfile({ avatar_url: url }), { code: 'INVALID_AVATAR_URL' })
  }
  assert.equal(f.requests.length, 0)
})

test('documented server errors preserve login and never expose the server message', async t => {
  const f = setup(t)
  for (const [statusCode, code] of [[400, 'AVATAR_INVALID_IMAGE'], [403, 'AVATAR_CONTENT_REJECTED'], [413, 'AVATAR_TOO_LARGE'], [429, 'RATE_LIMITED'], [503, 'AVATAR_UPLOAD_UNAVAILABLE']]) {
    f.response = { statusCode, data: JSON.stringify({ code, message: 'private storage details' }) }
    await assert.rejects(f.api.uploadAvatar(filePath), error => error.code === code && error.statusCode === statusCode && !/private/.test(error.message))
    assert.equal(auth.getToken(), token)
  }
})

test('upload 401 clears its session even when the response is not JSON', async t => {
  const f = setup(t)
  f.response = { statusCode: 401, data: 'Unauthorized' }
  await assert.rejects(f.api.uploadAvatar(filePath), { code: 'AUTH_REQUIRED' })
  assert.equal(auth.readSession(), null)
})

test('a late upload 401 never clears a replacement session', async t => {
  const f = setup(t)
  wx.uploadFile = options => {
    auth.saveSession({ token: `${token}-new`, expires_in: 3600, user: { id: 8 } })
    options.success({ statusCode: 401, data: '' })
  }
  await assert.rejects(f.api.uploadAvatar(filePath), { code: 'AUTH_REQUIRED' })
  assert.equal(auth.readSession().user.id, 8)
})

test('domain, network, timeout and synchronous upload failures are safe and retryable', async t => {
  const f = setup(t)
  for (const errMsg of ['uploadFile:fail url not in domain list', 'uploadFile:fail timeout', 'private network details']) {
    wx.uploadFile = options => options.fail({ errMsg })
    await assert.rejects(f.api.uploadAvatar(filePath), error => !/private/.test(error.message))
    assert.equal(auth.getToken(), token)
  }
  wx.uploadFile = () => { throw new Error('private native exception') }
  await assert.rejects(f.api.uploadAvatar(filePath), { code: 'NETWORK_ERROR' })
  assert.equal(auth.getToken(), token)
})

test('profile page through real adapters uploads, binds once, preserves nickname and reloads from me', async t => {
  const f = setup(t)
  const page = f.page()
  await page.chooseAvatar({ detail: { avatarUrl: filePath } })
  assert.equal(f.uploads.length, 1)
  assert.equal(f.requests.length, 1)
  assert.deepEqual(f.requests[0].data, { avatar_url: avatarUrl })
  assert.equal(f.requests[0].header.authorization, `Bearer ${token}`)
  assert.equal(page.data.avatarPreviewUrl, '')
  assert.equal(page.data.user.avatar_url, avatarUrl)
  assert.equal(page.data.user.nickname, initialUser.nickname)
  assert.deepEqual(f.toasts, [{ title: '头像已保存', icon: 'success' }])
  // Replace the local user with stale data to prove reopening reads the API, not just the cache.
  auth.updateUser(initialUser)
  const reopened = f.page()
  await reopened.refresh()
  assert.equal(reopened.data.user.avatar_url, avatarUrl)
  assert.equal(auth.readSession().user.avatar_url, avatarUrl)
})

test('failed real upload never binds or claims success and leaves the old avatar retryable', async t => {
  const f = setup(t)
  const page = f.page()
  f.response = { statusCode: 503, data: JSON.stringify({ code: 'AVATAR_UPLOAD_UNAVAILABLE' }) }
  await page.chooseAvatar({ detail: { avatarUrl: filePath } })
  assert.equal(f.requests.length, 0)
  assert.equal(page.data.user.avatar_url, initialUser.avatar_url)
  assert.equal(page.data.avatarDraftUrl, filePath)
  assert.equal(page.data.avatarPreviewUrl, '')
  assert.equal(page.data.avatarSaving, false)
  assert.equal(f.toasts.length, 0)
  assert.equal(auth.getToken(), token)
})
