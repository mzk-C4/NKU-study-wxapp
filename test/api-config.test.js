const test = require('node:test')
const assert = require('node:assert/strict')

const config = require('../miniprogram/config')

function loadConfigWithWx(wxApi) {
  const modulePath = require.resolve('../miniprogram/config')
  const hadWx = Object.hasOwn(global, 'wx')
  const previousWx = global.wx
  global.wx = wxApi
  delete require.cache[modulePath]
  try {
    return require(modulePath)
  } finally {
    delete require.cache[modulePath]
    if (hadWx) global.wx = previousWx
    else delete global.wx
  }
}

test('develop defaults to production and only the fixed reference profile opts in', () => {
  assert.equal(config.resolveApiProfile('develop'), 'production')
  assert.equal(config.resolveApiProfile('develop', ''), 'production')
  assert.equal(config.resolveApiProfile('develop', 'reference'), 'reference')
  assert.equal(config.resolveApiProfile('develop', 'https://attacker.example/api'), 'production')
})

test('trial release unknown and failed environment values always use production', () => {
  for (const envVersion of ['trial', 'release', 'unknown', '', undefined, null]) {
    assert.equal(config.resolveApiProfile(envVersion, 'reference'), 'production')
    assert.equal(config.resolveApiBaseUrl(envVersion, 'reference'), 'https://nkustudy.top/api/v1')
  }
})

test('API bases are fixed and release preflight compatibility remains HTTPS', () => {
  assert.deepEqual(config.API_PROFILES, {
    production: 'https://nkustudy.top/api/v1',
    reference: 'http://127.0.0.1:3000/api/v1'
  })
  assert.equal(config.resolveApiBaseUrl('develop', 'reference'), 'http://127.0.0.1:3000/api/v1')
  assert.equal(config.resolveApiBaseUrl('trial'), 'https://nkustudy.top/api/v1')
  assert.equal(config.resolveApiBaseUrl('release', 'reference'), 'https://nkustudy.top/api/v1')
  assert.equal(config.apiProfile, 'production')
  assert.equal(config.apiBaseUrl, 'https://nkustudy.top/api/v1')
})

test('runtime storage opts only develop into reference and cannot override trial', () => {
  const develop = loadConfigWithWx({
    getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } },
    getStorageSync(key) {
      assert.equal(key, 'nkustudy_api_profile')
      return 'reference'
    }
  })
  let trialStorageReads = 0
  const trial = loadConfigWithWx({
    getAccountInfoSync() { return { miniProgram: { envVersion: 'trial' } } },
    getStorageSync() {
      trialStorageReads += 1
      return 'reference'
    }
  })

  assert.equal(develop.apiProfile, 'reference')
  assert.equal(develop.apiBaseUrl, 'http://127.0.0.1:3000/api/v1')
  assert.equal(trial.apiProfile, 'production')
  assert.equal(trial.apiBaseUrl, 'https://nkustudy.top/api/v1')
  assert.equal(trialStorageReads, 0)
})

test('runtime environment and storage read failures fall back to production', () => {
  const accountFailure = loadConfigWithWx({
    getAccountInfoSync() { throw new Error('unavailable') },
    getStorageSync() { return 'reference' }
  })
  const storageFailure = loadConfigWithWx({
    getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } },
    getStorageSync() { throw new Error('unavailable') }
  })

  assert.equal(accountFailure.apiProfile, 'production')
  assert.equal(storageFailure.apiProfile, 'production')
})
