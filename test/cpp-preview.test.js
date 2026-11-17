const test = require('node:test')
const assert = require('node:assert/strict')
const preview = require('../miniprogram/features/learning-compass/cpp-preview')
test('local C++ fixture survives module reload, but never runs on devices or release', t => {
  const previous = global.wx
  t.after(() => { global.wx = previous })
  let version = 'develop', platform = 'devtools', active = true
  const files = { 'manifest.json': [{ id: 'cpp-notes-003', title: '数制转换' }], 'cpp-notes-003.json': { id: 'cpp-notes-003', sections: [] } }
  global.wx = { env: { USER_DATA_PATH: 'http://usr' }, getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }), getSystemInfoSync: () => ({ platform }), getStorageSync: () => active, getFileSystemManager: () => ({ readFileSync: p => JSON.stringify(files[p.split('/').pop()]) }) }
  assert.equal(preview.chapters().length, 1)
  delete require.cache[require.resolve('../miniprogram/features/learning-compass/cpp-preview')]
  assert.equal(require('../miniprogram/features/learning-compass/cpp-preview').guide('cpp-notes-003').id, 'cpp-notes-003')
  assert.equal(preview.guide('../manifest'), null)
  for (const v of ['trial', 'release', '']) { version = v; assert.equal(preview.chapters(), null) }
  version = 'develop'; platform = 'ios'; assert.equal(preview.chapters(), null)
  platform = 'devtools'; active = false; assert.equal(preview.chapters(), null)
  active = true; delete files['manifest.json']; assert.throws(() => preview.chapters(), /缓存缺失/)
})
