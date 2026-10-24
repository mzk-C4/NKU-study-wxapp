/** Simulated device tests against dedicated loopback previews; not real phone FPS. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const origin='http://127.0.0.1:4180/campus-map/',beforeOrigin='http://127.0.0.1:4178/campus-map/'
const targets=await(await fetch('http://127.0.0.1:9229/json')).json()
const target=targets.find(t=>t.type==='page'&&t.url.startsWith(origin))
assert(target)
const socket=new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r=>socket.addEventListener('open',r,{once:true}))
let sequence=0;const pending=new Map(),exceptions=[]
socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}})
socket.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Browser disconnected'))}pending.clear()})
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout: ${method}`))},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))})}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function navigate(query='',base=origin){await call('Page.navigate',{url:base+query});await delay(700);for(let n=0;n<150;n++){if(await evaluate("Boolean(window.campusMapLab&&document.body.dataset.mapReady==='true')"))return;await delay(200)}throw new Error('Map not ready')}
const out=process.env.CAMPUS_MAP_ARTIFACT_DIR || '../../artifacts/campus-map/browser'
async function screenshot(name){await delay(600);const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/${name}.png`,Buffer.from(shot.data,'base64'))}
const state=()=>evaluate('({target:window.campusMapLab.controls.target.toArray(),distance:window.campusMapLab.controls.getDistance(),azimuth:window.campusMapLab.controls.getAzimuthalAngle(),polar:window.campusMapLab.controls.getPolarAngle(),y:window.campusMapLab.camera.position.y,selected:window.campusMapLab.selected()?.id})')
async function touch(type,points){await call('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))})}
async function gesture(start,end){await touch('touchStart',start);for(let n=1;n<=10;n++){await touch('touchMove',start.map(([x,y],id)=>[x+(end[id][0]-x)*n/10,y+(end[id][1]-y)*n/10]));await delay(40)}await touch('touchEnd',[]);await delay(300)}
async function reset(){await evaluate('window.campusMapLab.resetView()');await delay(200)}
try{
  await call('Page.enable');await call('Runtime.enable')
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true})
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:3})
  const libraryQuery='?embed=wechat&buildingId=osm-building-616829077'
  if(!process.argv.includes('--skip-before')){
    await navigate(libraryQuery,beforeOrigin);await evaluate('window.campusMapLab.zoom(.65)')
    await screenshot('touch-aa-library-before')
    await navigate('?embed=wechat',beforeOrigin);await screenshot('touch-aa-overview-before')
  }
  await navigate(libraryQuery);await evaluate('window.campusMapLab.zoom(.65)');await screenshot('touch-aa-library-after')
  const clear=await evaluate('window.campusMapLab.rendering()')
  assert.equal(clear.pixelRatio,2);assert(clear.nativeAntialias);assert(clear.fxaa);assert(clear.samples>=2);assert.equal(clear.width,780);assert.equal(clear.height,1688)
  await reset();await screenshot('touch-aa-overview-after')
  const initial=await state()
  await gesture([[135,410],[255,410]],[[165,358],[225,462]])
  const rotated=await state()
  assert(rotated.azimuth-initial.azimuth>.8,'Clockwise screen twist increases camera bearing (user-preferred direction)')
  assert.equal(rotated.selected,undefined)
  await evaluate("document.getElementById('compass').click()")
  const north=await state();assert(Math.abs(north.azimuth)<1e-6)
  assert(Math.abs(north.distance-rotated.distance)<.001,'Compass does not zoom out')
  assert(Math.hypot(north.target[0]-rotated.target[0],north.target[2]-rotated.target[2])<.001,'Compass does not reset location')
  await reset()
  await gesture([[135,410],[255,410]],[[165,462],[225,358]])
  const counterRotated=await state()
  assert(counterRotated.azimuth<-.8,'Counterclockwise twist uses the opposite signed bearing')
  await reset()
  const beforePitch=await state()
  await gesture([[130,330],[250,330]],[[130,410],[250,410]])
  const pitched=await state();assert(pitched.polar>beforePitch.polar+.2,'Parallel vertical swipe tilts')
  assert(Math.hypot(pitched.target[0]-beforePitch.target[0],pitched.target[2]-beforePitch.target[2])<1,'Pitch must not also pan')
  assert(pitched.y>=3&&pitched.target[1]===0)
  await reset();const beforePan=await state()
  await gesture([[130,350],[250,350]],[[180,350],[300,350]])
  const panned=await state();assert(Math.hypot(panned.target[0]-beforePan.target[0],panned.target[2]-beforePan.target[2])>10)
  assert(Math.abs(panned.azimuth-beforePan.azimuth)<.01,'Parallel horizontal drag does not rotate')
  await reset();const beforePinch=await state()
  await gesture([[150,410],[240,410]],[[100,410],[290,410]])
  const pinched=await state();assert(pinched.distance<beforePinch.distance*.65)
  await gesture([[150,410],[240,410]],[[160,310],[260,490]])
  const combined=await state();assert(combined.azimuth-pinched.azimuth>.7&&combined.distance<pinched.distance*.6,'Combined pinch follows the same user-preferred rotation direction')
  // Release one finger, then continue pan: no jump and no accidental building tap.
  await touch('touchStart',[[130,350],[250,350]])
  await touch('touchMove',[[150,350],[270,350]]);await delay(100)
  const beforeRelease=await state();await touch('touchEnd',[[150,350]]);await delay(100)
  const afterRelease=await state();assert(Math.abs(beforeRelease.distance-afterRelease.distance)<.1)
  await touch('touchMove',[[175,375]]);await delay(100);await touch('touchEnd',[])
  assert.equal((await state()).selected,undefined)
  // Cancelled input must not leave controls disabled or select a building.
  await touch('touchStart',[[150,390],[240,390]]);await touch('touchCancel',[])
  const preSingle=await state();await gesture([[190,410]],[[230,430]])
  assert(Math.hypot((await state()).target[0]-preSingle.target[0],(await state()).target[2]-preSingle.target[2])>1)
  await evaluate("document.getElementById('render-quality').value='battery';document.getElementById('render-quality').dispatchEvent(new Event('change'))")
  await delay(300);const battery=await evaluate('window.campusMapLab.rendering()');assert.equal(battery.pixelRatio,1.25);assert(battery.fxaa)
  await evaluate("document.getElementById('render-quality').value='clear';document.getElementById('render-quality').dispatchEvent(new Event('change'))")
  await delay(300);assert.equal(await evaluate('window.campusMapLab.rendering().pixelRatio'),2)
  await reset();await delay(1200);const frames=await evaluate('window.campusMapLab.performance().frames');await delay(600);assert.equal(await evaluate('window.campusMapLab.performance().frames'),frames,'Static anti-aliased map stops drawing')
  // A postprocessing failure must retain the native 3D map rather than blank it.
  const injected=await call('Page.addScriptToEvaluateOnNewDocument',{source:"const originalBlit=WebGL2RenderingContext.prototype.blitFramebuffer;WebGL2RenderingContext.prototype.blitFramebuffer=function(...args){if(!window.__testAAFailure){window.__testAAFailure=true;throw new Error('Injected postprocessing failure')}return originalBlit.apply(this,args)}"})
  await navigate('?embed=wechat')
  const fallback=await evaluate('({mode:window.campusMapLab.mode,aa:window.campusMapLab.rendering(),injected:window.__testAAFailure})')
  assert(fallback.injected);assert.equal(fallback.mode,'3d');assert.equal(fallback.aa.fxaa,false);assert.equal(fallback.aa.nativeAntialias,true)
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected.identifier})
  const report={clear,battery,initial,rotated,counterRotated,pitched,pinched,combined,fallback,checks:'signed clockwise/counterclockwise twist, zoom/pitch/horizontal pan, combined rotate+zoom direction, compass preserves view, pointer transitions/cancel, clear/battery AA, idle suspension, postprocessing-failure native 3D fallback',realPhone:'pending'}
  assert.equal(exceptions.length,0,JSON.stringify(exceptions))
  await writeFile(`${out}/touch-aa-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{socket.close()}
