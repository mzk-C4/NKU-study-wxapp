/** Local desktop browser checks, not a substitute for real WeChat device testing. */
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const origin = process.argv[2] || process.env.CAMPUS_MAP_TEST_ORIGIN || 'http://127.0.0.1:4178/campus-map/'
assert(['http://127.0.0.1:4178', 'http://127.0.0.1:4180'].includes(new URL(origin).origin), 'Use a dedicated local dev or production preview')
const targets = await (await fetch('http://127.0.0.1:9229/json')).json()
const target = targets.find(t => t.type === 'page' && ['http://127.0.0.1:4178/campus-map/', 'http://127.0.0.1:4180/campus-map/'].some(prefix => t.url.startsWith(prefix)))
assert(target, 'Start the dedicated local preview browser first')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let sequence = 0
const pending = new Map(), exceptions = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails)
  if (message.id) { const pair = pending.get(message.id); if (!pair) return; pending.delete(message.id); clearTimeout(pair.timeout); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
socket.addEventListener('close', () => { for (const pair of pending.values()) { clearTimeout(pair.timeout); pair.reject(new Error('Preview browser disconnected')) } pending.clear() })
function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Preview call timed out: ${method}`)) }, 30000); pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params })) }) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
  return response.result.value
}
async function navigate(query) {
  await call('Page.navigate', { url: origin + query })
  await delay(1000)
  for (let i = 0; i < 100; i++) {
    if (await evaluate("Boolean(document.body?.dataset.mapReady === 'true' && window.campusMapLab)")) return
    await delay(300)
  }
  throw new Error('Map did not become ready')
}
const out = process.env.CAMPUS_MAP_ARTIFACT_DIR || '../../artifacts/campus-map/browser'
async function screenshot(name) {
  await delay(700)
  const shot = await call('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${out}/${name}.png`, Buffer.from(shot.data, 'base64'))
}
await call('Runtime.enable'); await call('Page.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
const monument = 'reference-monument-zhou-enlai'
try {
  await navigate(`?embed=wechat&buildingId=${monument}`)
  const three = await evaluate(`({ mode:window.campusMapLab.mode, selected:window.campusMapLab.selected()?.id, count:window.campusMapLab.campusModel.buildings.length, width:document.documentElement.scrollWidth, height:document.querySelector('.viewport-wrap').getBoundingClientRect().height, statusHidden:document.getElementById('map-status').hidden, image:performance.getEntriesByType('resource').find(e=>e.name.includes('nankai-emblem-source'))?.name })`)
  assert.equal(three.mode, '3d'); assert.equal(three.selected, monument); assert.equal(three.count, 93)
  assert(three.width <= 390 && Math.abs(three.height - 844) < 2 && three.statusHidden, JSON.stringify(three))
  assert(three.image?.includes('/campus-map/nankai-emblem-source.png'))
  await screenshot('wechat-map-mobile-3d')
  await evaluate("const input=document.getElementById('place-search');input.value='旅游与服务学院';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#search-results button').click()")
  assert.equal(await evaluate('window.campusMapLab.selected()?.name'), '旅游与服务学院')
  assert.equal(await evaluate("new URL(location.href).searchParams.get('buildingId')"), 'reference-building-tourism')
  await evaluate("document.getElementById('reset-view').click()")
  assert.equal(await evaluate('window.campusMapLab.selected()?.id'), undefined)
  assert.equal(await evaluate("new URL(location.href).searchParams.has('buildingId')"), false)

  // 真正丢失已创建的 WebGL 上下文，验证可继续搜索的降级，而非只测试 query 开关。
  await evaluate(`window.campusMapLab.selectBuilding(window.campusMapLab.campusModel.buildings.find(b=>b.id==='${monument}'));document.getElementById('map-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`)
  for (let i = 0; i < 30 && await evaluate('window.campusMapLab.mode') !== '2d'; i++) await delay(100)
  assert.equal(await evaluate('window.campusMapLab.mode'), '2d')
  assert.equal(await evaluate('window.campusMapLab.selected()?.id'), monument)
  assert.equal(await evaluate("document.querySelectorAll('#flat-map [data-building-id]').length"), 93)

  await navigate('?embed=wechat&mode=2d&buildingId=reference-building-dormitory-1')
  assert.equal(await evaluate('window.campusMapLab.selected()?.id'), 'reference-building-dormitory-1')
  assert.equal(await evaluate("document.querySelector('#flat-map [data-building-id=\"reference-building-dormitory-1\"]').querySelectorAll('path').length"), 8)
  await screenshot('wechat-map-mobile-2d')
  await evaluate("{document.getElementById('map-panel-toggle').click();const roads=document.getElementById('layer-roads');roads.checked=false;roads.dispatchEvent(new Event('change'))}")
  assert.equal(await evaluate("document.querySelector('#flat-map [data-map-layer=roads]').style.display"), 'none')
  assert.equal(await evaluate("document.getElementById('map-panel-toggle').getAttribute('aria-expanded')"), 'true')
  await evaluate("{const roads=document.getElementById('layer-roads');roads.checked=true;roads.dispatchEvent(new Event('change'));document.getElementById('map-panel-toggle').click()}")
  const previousView = await evaluate("document.getElementById('flat-map').getAttribute('viewBox')")
  const beforeSelection = await evaluate('window.campusMapLab.selected()?.id')
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y: 360, id: 0 }, { x: 230, y: 420, id: 1 }] })
  await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 135, y: 320, id: 0 }, { x: 265, y: 460, id: 1 }] })
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await delay(300)
  assert.notEqual(await evaluate("document.getElementById('flat-map').getAttribute('viewBox')"), previousView)
  assert.equal(await evaluate('window.campusMapLab.selected()?.id'), beforeSelection, 'Pinch must not select another building')
  await evaluate("document.getElementById('north-up').click()")
  assert.equal(await evaluate("new URL(location.href).searchParams.has('buildingId')"), false)

  const noWebGL = await call('Page.addScriptToEvaluateOnNewDocument', { source: "const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:getContext.call(this,type,...args)}" })
  await navigate(`?embed=wechat&buildingId=${monument}`)
  assert.equal(await evaluate('window.campusMapLab.mode'), '2d')
  assert.equal(await evaluate('window.campusMapLab.selected()?.id'), monument)
  assert.equal(await evaluate("document.querySelectorAll('#flat-map [data-building-id]').length"), 93)
  await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: noWebGL.identifier })
  await navigate('?embed=wechat&mode=2d&buildingId=..%2Fadmin')
  assert.equal(await evaluate("new URL(location.href).searchParams.has('buildingId')"), false)
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await navigate('?mode=2d')
  assert.equal(await evaluate("document.body.classList.contains('map-compact')"), false)
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.side-panel')).position"), 'static')
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions))
  console.log(JSON.stringify({ desktopBrowserMobileSimulation: 'passed', realWeChatDeviceTest: 'pending', three, tested: ['3D entry/search/reset', 'actual WebGL context loss', 'full 2D and compound courtyard shapes', 'layers and pinch without false selection', 'no-WebGL2 fallback', 'invalid deep links', 'desktop sidebar'], screenshots: ['wechat-map-mobile-3d.png', 'wechat-map-mobile-2d.png'] }))
} finally { socket.close() }
