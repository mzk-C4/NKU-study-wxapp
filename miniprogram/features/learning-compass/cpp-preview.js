// Explicitly installed development fixture, stored outside the uploaded package.
const KEY = 'nkustudy_cpp_preview_v1'
function enabled() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion === 'develop' &&
      wx.getSystemInfoSync().platform === 'devtools' && wx.getStorageSync(KEY) === true
  } catch (_) { return false }
}
function read(name) {
  if (!enabled()) return null
  try {
    return JSON.parse(wx.getFileSystemManager().readFileSync(wx.env.USER_DATA_PATH + '/nkustudy-cpp-preview/' + name + '.json', 'utf8'))
  } catch (_) { throw new Error('本地 C++ 预览缓存缺失，请重新装载。') }
}
function chapters() {
  const value = read('manifest')
  if (!value) return null
  if (!Array.isArray(value) || !value.length || value.some(row => !/^cpp-notes-\d{3}$/.test(row.id) || typeof row.title !== 'string')) throw new Error('本地 C++ 目录无效')
  return value
}
function guide(id) {
  if (!/^cpp-notes-\d{3}$/.test(id)) return null
  const value = read(id)
  if (value && (value.id !== id || !Array.isArray(value.sections))) throw new Error('本地 C++ 章节无效')
  return value
}
module.exports = { enabled, chapters, guide }
