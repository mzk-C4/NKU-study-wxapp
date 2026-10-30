// Conservative local source budget. WeChat's compiled/uploaded size can differ.
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
const miniRoot = path.resolve(root, config.miniprogramRoot || '.')
const rules = config.packOptions?.ignore || []
const LIMIT = 2 * 1024 * 1024
const normalize = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')
function ignored(file) {
  return rules.some(rule => {
    const value = normalize(rule.value)
    if (!value) return false
    if (rule.type === 'file') return file === value
    if (rule.type === 'folder') return file.startsWith(value + '/')
    // Unsupported rule types are conservatively counted, never silently excluded.
    return false
  })
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}
const files = walk(miniRoot).map(file => ({
  path: normalize(path.relative(miniRoot, file)),
  absolute: file,
  bytes: fs.statSync(file).size
}))
const included = files.filter(file => !ignored(file.path))
const excluded = files.filter(file => ignored(file.path))
const bytes = included.reduce((sum, file) => sum + file.bytes, 0)
const source = included.filter(file => /\.(?:js|json|wxml|wxss|svg)$/.test(file.path))
  .map(file => fs.readFileSync(file.absolute, 'utf8')).join('\n')
const referencedExcluded = excluded.filter(file => /\.(?:png|jpe?g|webp|svg)$/.test(file.path) && source.includes(file.path))
if (referencedExcluded.length) {
  console.error('打包排除项仍被运行代码引用：' + referencedExcluded.map(file => file.path).join(', '))
  process.exit(1)
}
console.log(`小程序本地源码保守统计：${(bytes / 1024).toFixed(1)} KiB / ${LIMIT / 1024} KiB；已排除 ${(excluded.reduce((sum, file) => sum + file.bytes, 0) / 1024).toFixed(1)} KiB。微信编译后的实际包大小以开发者工具为准。`)
if (bytes > LIMIT) {
  console.error('源码预算超过2MiB，请排除旧稿或压缩资源后再上传。')
  process.exit(1)
}
