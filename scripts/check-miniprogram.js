const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')

const root = path.resolve(__dirname, '..')
const miniRoot = path.join(root, 'miniprogram')
const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'))
const failures = []

function fail(message) { failures.push(message) }
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

function checkComponentReferences(file) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const [name, reference] of Object.entries(config.usingComponents || {})) {
    if (reference.startsWith('/')) {
      fail(`组件 ${name} 使用了当前开发者工具无法解析的绝对路径：${path.relative(root, file)} -> ${reference}`)
      continue
    }
    const componentConfig = path.resolve(path.dirname(file), `${reference}.json`)
    if (!fs.existsSync(componentConfig)) {
      fail(`组件配置缺失：${path.relative(root, file)} -> ${path.relative(root, componentConfig)}`)
    }
  }
}

for (const page of app.pages) {
  for (const extension of ['json', 'js', 'wxml', 'wxss']) {
    const file = path.join(miniRoot, `${page}.${extension}`)
    if (!fs.existsSync(file)) fail(`页面文件缺失：${path.relative(root, file)}`)
  }
}

const tabPages = new Set((app.tabBar?.list || []).map(item => item.pagePath))
for (const page of tabPages) if (!app.pages.includes(page)) fail(`TabBar 页面未注册：${page}`)

for (const file of walk(miniRoot)) {
  const relative = path.relative(root, file)
  if (file.endsWith('.json')) checkComponentReferences(file)
  if (file.endsWith('.js')) {
    const result = childProcess.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (result.status !== 0) fail(`JavaScript 语法错误：${relative}\n${result.stderr}`)
  }
  if (file.endsWith('.wxml')) {
    const source = fs.readFileSync(file, 'utf8')
    if (/\.includes\s*\(/.test(source)) fail(`WXML 不支持方法调用：${relative}`)
    if (/wx:for="\{\{\s*\[/.test(source)) fail(`WXML 中不应使用数组字面量：${relative}`)
    if (/wx:key="[^"]*[+][^"]*"/.test(source)) fail(`wx:key 不应使用表达式：${relative}`)
    if (/<br\s*\/?\s*>/i.test(source)) fail(`请用 view 控制换行：${relative}`)
  }
}

if (!fs.existsSync(path.join(miniRoot, 'lib/fuse.js'))) fail('缺少本地 Fuse.js 搜索库')

const miniConfig = require(path.join(miniRoot, 'config.js'))
const trialApiBaseUrl = miniConfig.resolveApiBaseUrl('trial')
const releaseApiBaseUrl = miniConfig.resolveApiBaseUrl('release')
if (!trialApiBaseUrl.startsWith('https://')) fail('体验版 API 必须使用 HTTPS')
if (!releaseApiBaseUrl.startsWith('https://')) fail('正式版 API 必须使用 HTTPS')
if (/127\.0\.0\.1|localhost|\d+\.\d+\.\d+\.\d+/.test(`${trialApiBaseUrl}${releaseApiBaseUrl}`)) {
  fail('体验版和正式版 API 不得使用 localhost 或服务器 IP')
}

const trackedText = walk(root).filter(file => !file.includes(`${path.sep}.git${path.sep}`) && !/\.(png|jpg|jpeg|gif|ico)$/i.test(file) && !file.endsWith('runtime.json'))
const secretPatterns = [
  { name: '服务器明文密码', pattern: /pwd\s*[:=]\s*\S+/i },
  { name: '私钥', pattern: /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/ },
  { name: '微信密钥赋值', pattern: /WECHAT_SECRET\s*=\s*[^\s#][^\r\n]*/ }
]
for (const file of trackedText) {
  const source = fs.readFileSync(file, 'utf8')
  for (const check of secretPatterns) {
    if (check.pattern.test(source) && !file.endsWith('.env.example') && !file.endsWith('check-miniprogram.js')) fail(`${check.name}疑似写入：${path.relative(root, file)}`)
  }
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log(`NKUStudy 小程序静态检查通过：${app.pages.length} 个页面，${tabPages.size} 个 Tab。`)
