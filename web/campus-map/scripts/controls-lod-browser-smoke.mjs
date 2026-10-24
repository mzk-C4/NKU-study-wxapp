/** Dedicated loopback Chrome CDP checks. Simulated touch, not a real phone benchmark. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const origin = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:4178/campus-map/'
assert(['http://127.0.0.1:4178', 'http://127.0.0.1:4180'].includes(new URL(origin).origin))
const targets = await (await fetch('http://127.0.0.1:9229/json')).json()
const target = targets.find(t => t.type === 'page' && ['4178', '4180'].some(p => t.url.includes(`127.0.0.1:${p}/campus-map/`)))
assert(target)
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => socket.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map(), exceptions = []
socket.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails)
  const p = pending.get(m.id)
  if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result) }
})
socket.addEventListener('close', () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Browser disconnected')) } pending.clear() })
function call(method, params = {}) { return new Promise((resolve, reject) => {
  const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(new Error(`Timeout: ${method}`)) }, 30000)
  pending.set(n, { resolve, reject, timer }); socket.send(JSON.stringify({ id: n, method, params }))
}) }
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
const delay = ms => new Promise(r => setTimeout(r, ms))
async function navigate(query = '') {
  await call('Page.navigate', { url: origin + query })
  await delay(600)
  for (let n = 0; n < 120; n++) {
    if (await evaluate("Boolean(window.campusMapLab && document.body.dataset.mapReady==='true')")) return
    await delay(250)
  }
  throw new Error('Map not ready')
}
const out = process.env.CAMPUS_MAP_ARTIFACT_DIR || '../../artifacts/campus-map/browser'
async function snapshot(name) {
  await delay(1000)
  const data = await evaluate(`(()=>{const m=window.campusMapLab;let meshes=0,triangles=0;m.scene.traverseVisible(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.count??1)}});return {meshes,triangles,stats:document.getElementById('render-stats').textContent,render:m.performance?.(),lod:m.lod?.stats(),camera:m.camera.position.toArray(),target:m.controls.target.toArray()}})()`)
  const shot = await call('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${out}/${name}.png`, Buffer.from(shot.data, 'base64'))
  return data
}
async function gesture(start, end) {
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: start.map(([x,y], id) => ({x,y,id})) })
  for (let i = 1; i <= 8; i++) {
    await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: start.map(([x,y],id)=>({x:x+(end[id][0]-x)*i/8,y:y+(end[id][1]-y)*i/8,id})) })
    await delay(25)
  }
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await delay(600)
}
try {
  await call('Runtime.enable'); await call('Page.enable')
  await call('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})
  await call('Emulation.setTouchEmulationEnabled', {enabled:true,maxTouchPoints:2})
  await navigate('?embed=wechat')
  if (process.argv.includes('--baseline')) {
    const baseline = await snapshot('controls-lod-before')
    await writeFile(`${out}/controls-lod-before.json`, JSON.stringify(baseline,null,2))
    console.log(JSON.stringify(baseline));
  } else {
    assert.equal(await evaluate('window.campusMapLab.mode'), '3d')
    const overview = await snapshot('controls-lod-overview')
    assert(overview.lod.coarse > 0 && overview.lod.fine === 0, JSON.stringify(overview))
    await delay(1000)
    const idleFrames=await evaluate('window.campusMapLab.performance().frames')
    await delay(1000)
    assert.equal(await evaluate('window.campusMapLab.performance().frames'),idleFrames,'Idle map must stop drawing')
    const before = await evaluate('window.campusMapLab.controls.target.toArray()')
    await gesture([[140,330],[230,330]], [[195,345],[285,345]])
    const after = await evaluate('window.campusMapLab.controls.target.toArray()')
    assert(Math.hypot(after[0]-before[0],after[2]-before[2]) > 10, 'Two-finger drag pans')
    assert.equal(after[1], 0, 'Pan stays on ground')
    assert.equal(await evaluate('window.campusMapLab.selected()?.id'), undefined)
    const distance = await evaluate('window.campusMapLab.controls.getDistance()')
    await gesture([[145,350],[235,350]], [[90,350],[290,350]])
    assert(await evaluate('window.campusMapLab.controls.getDistance()') < distance*.8, 'Pinch zooms in')
    const azimuth = await evaluate('window.campusMapLab.controls.getAzimuthalAngle()')
    await gesture([[190,370]], [[235,440]])
    assert(Math.abs(await evaluate('window.campusMapLab.controls.getAzimuthalAngle()')-azimuth)<.001, 'One-finger pans rather than orbiting')
    await evaluate("window.campusMapLab.selectBuilding(window.campusMapLab.campusModel.buildings.find(b=>b.id==='osm-building-616829077'))")
    await evaluate('window.campusMapLab.zoom(.4)')
    const near = await snapshot('controls-lod-library-near')
    assert(near.lod.fine > 0, 'Nearby authored model is visible')
    const targetBeforePan = await evaluate('window.campusMapLab.controls.target.toArray()')
    await gesture([[140,330],[230,330]], [[190,380],[280,380]])
    const panTarget = await evaluate('window.campusMapLab.controls.target.toArray()')
    assert(Math.hypot(panTarget[0]-targetBeforePan[0],panTarget[2]-targetBeforePan[2])>1)
    await evaluate('window.campusMapLab.zoom(.9)')
    const zoomTarget = await evaluate('window.campusMapLab.controls.target.toArray()')
    assert(Math.hypot(zoomTarget[0]-panTarget[0],zoomTarget[2]-panTarget[2])<1, 'Zoom never snaps to stale selection')
    // Force hostile values through real controls.update, then inspect safety guard.
    await evaluate('window.campusMapLab.controls.target.set(-100000,-500,-100000);window.campusMapLab.camera.position.set(-100001,-700,-100001);window.campusMapLab.controls.update()')
    const safe = await evaluate('({y:window.campusMapLab.camera.position.y,target:window.campusMapLab.controls.target.toArray(),polar:window.campusMapLab.controls.getPolarAngle()})')
    assert(safe.y>=3 && safe.target[1]===0 && safe.polar<=Math.PI*.46+.00001, JSON.stringify(safe))
    await navigate('?embed=wechat&buildingId=reference-monument-zhou-enlai')
    assert.equal(await evaluate('window.campusMapLab.selected()?.name'), '周总理雕像')
    assert(await evaluate('window.campusMapLab.camera.position.y')>=3)
    await snapshot('controls-lod-statue-near')
    await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true})
    await delay(200)
    await evaluate("window.campusMapLab.selectBuilding(window.campusMapLab.campusModel.buildings.find(b=>b.id==='reference-monument-zhou-enlai'))")
    assert.equal(await evaluate('document.documentElement.scrollWidth'),844)
    assert(await evaluate("document.querySelector('.side-panel').getBoundingClientRect().right")<350,'Landscape toolbar stays aside')
    await snapshot('controls-lod-mobile-landscape')
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    await delay(200)
    await evaluate('window.campusMapLab.resetView()')
    assert.equal(await evaluate("new URL(location.href).searchParams.has('buildingId')"),false)
    // A menu toggle invalidates the on-demand render; controls need not move.
    const beforeLayer=await evaluate('window.campusMapLab.performance().frames')
    await evaluate("{const c=document.getElementById('layer-buildings');c.checked=false;c.dispatchEvent(new Event('change'))}")
    await delay(200)
    assert(await evaluate('window.campusMapLab.performance().frames')>beforeLayer)
    await evaluate("{const c=document.getElementById('layer-buildings');c.checked=true;c.dispatchEvent(new Event('change'));document.getElementById('detail-mode').value='full';document.getElementById('detail-mode').dispatchEvent(new Event('change'))}")
    await delay(200)
    assert.equal(await evaluate('window.campusMapLab.lod.stats().coarse'),0)
    assert.equal(await evaluate("new URL(location.href).searchParams.get('detail')"),'full')
    await navigate('?embed=wechat&mode=2d')
    assert.equal(await evaluate("document.getElementById('detail-mode').closest('label').hidden"),true)
    // Production desktop entry remains separate from the compact WeChat layout.
    await call('Emulation.setTouchEmulationEnabled', {enabled:false})
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
    await navigate('?detail=full')
    const full = await snapshot('controls-lod-desktop-full')
    assert(full.lod.fine>0 && full.lod.coarse===0 && full.lod.medium===0)
    assert.equal(await evaluate("document.body.classList.contains('map-compact')"),false)
    assert.equal(await evaluate('window.campusMapLab.controls.mouseButtons.LEFT'),0, 'Desktop left-drag rotation preserved')
    assert.equal(exceptions.length,0,JSON.stringify(exceptions))
    const report = { overview, near, full, safe, checks:'two-finger pan, pinch, single-finger pan, ground/campus limits, no stale anchor, near/far LOD, full-detail desktop, selection/reset, idle draw suspension, layer/quality redraw and 2D controls', realPhonePerformance:'pending' }
    await writeFile(`${out}/controls-lod-results.json`,JSON.stringify(report,null,2))
    console.log(JSON.stringify(report))
  }
} finally {socket.close()}
