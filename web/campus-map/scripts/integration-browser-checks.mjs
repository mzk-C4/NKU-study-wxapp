// Browser-independent runner: pass the supported browser tool's CDP transport.
// This only tests a dedicated local preview; it cannot target production.
import assert from 'node:assert/strict'

export function browserChecks({ send, viewport, screenshot = async () => {} }) {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  const origin = 'http://127.0.0.1:4180/campus-map/'
  async function navigate(query = '?embed=wechat') {
    assert.equal(await evaluate('location.origin'), new URL(origin).origin)
    if (await evaluate('location.href') === origin + query) await send('Page.reload', { ignoreCache: true })
    else await send('Page.navigate', { url: origin + query })
    // Wait for a new document, then its model, rather than the previous page.
    await pause(500)
    for (let n = 0; n < 150; n++) {
      if (await evaluate("location.href === " + JSON.stringify(origin + query) + " && document.body?.dataset.mapReady === 'true' && Boolean(window.campusMapLab)")) return
      // Unknown IDs are intentionally removed by the app.
      if (query.includes('unknown') && await evaluate("document.body?.dataset.mapReady === 'true' && !new URL(location.href).searchParams.has('buildingId')")) return
      await pause(200)
    }
    throw new Error('Preview did not become ready')
  }
  async function gesture(start, end) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: start.map(([x,y],id) => ({x,y,id})) })
    for (let n = 1; n <= 8; n++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: start.map(([x,y],id) => ({x:x+(end[id][0]-x)*n/8,y:y+(end[id][1]-y)*n/8,id})) })
      await pause(40)
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(200)
  }
  const selected = () => evaluate('window.campusMapLab.selected()?.id')
  return {
    async searchAndLayout() {
      await viewport({width:320,height:568}); await navigate()
      assert.equal(await evaluate('window.campusMapLab.mode'), '3d')
      assert.equal(await evaluate('document.documentElement.scrollWidth'), 320)
      assert.equal(await evaluate('window.campusMapLab.places.length'), 110)
      assert.equal(await evaluate('window.campusMapLab.campusModel.buildings.length'), 93)
      await screenshot('mobile-320-overview')
      for (const [query,id] of [['公教A','osm-building-1430904058'],['二食','osm-building-1412230608'],['图书管','osm-building-616829077'],['tsg','osm-building-616829077']]) {
        await evaluate(`{ const i=document.getElementById('place-search'); i.value=${JSON.stringify(query)}; i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#search-results button').click() }`)
        assert.equal(await selected(),id,query)
        assert.equal(await evaluate("new URL(location.href).searchParams.get('buildingId')"),id)
      }
      await evaluate("document.querySelector('[data-details]').click()")
      assert.equal(await evaluate("document.querySelector('.place-details').hidden"),false)
      // Work with the current preference, and restore it after this test.
      const wasFavorite = await evaluate("document.querySelector('[data-favorite]').getAttribute('aria-pressed') === 'true'")
      if (!wasFavorite) await evaluate("document.querySelector('[data-favorite]').click()")
      await evaluate("document.querySelector('[data-clear-selection]').click(); document.querySelector('[data-place-tab=favorites]').click()")
      assert(await evaluate("document.querySelector('.place-list').textContent.includes('中心图书馆')"))
      await evaluate("document.querySelector('[data-place-tab=recent]').click()")
      assert(await evaluate("document.querySelector('.place-list').textContent.includes('中心图书馆')"))
      await evaluate("document.querySelector('[data-place-tab=all]').click(); document.querySelector('[data-category=residence]').click()")
      assert(await evaluate("document.querySelector('.place-list').textContent.includes('宿舍')"))
      await navigate('?embed=wechat&mode=2d&buildingId=osm-building-616829077')
      assert.equal(await selected(),'osm-building-616829077')
      assert.equal(await evaluate("document.querySelector('[data-favorite]').getAttribute('aria-pressed')"),'true')
      if (!wasFavorite) await evaluate("document.querySelector('[data-favorite]').click()")
      await evaluate("document.getElementById('reset-view').click()")
      assert.equal(await selected(),undefined)
      assert.equal(await evaluate("new URL(location.href).searchParams.has('buildingId')"),false)
      for (const size of [{width:320,height:568},{width:844,height:390}]) {
        await viewport(size); await navigate()
        assert.equal(await evaluate('document.documentElement.scrollWidth'),size.width)
        await evaluate("document.getElementById('map-panel-toggle').click()")
        assert(await evaluate("(()=>{const b=document.getElementById('map-panel-close'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"),'Close stays reachable')
        await evaluate("document.getElementById('map-panel-close').click()")
        assert.equal(await evaluate("document.getElementById('map-panel-toggle').getAttribute('aria-expanded')"),'false')
        await screenshot(`layout-${size.width}`)
      }
      return {pass:true,queries:['公教A','二食','图书管','tsg'],layouts:[320,844],checks:'selection, details, category, favorites/recent, mode persistence, reset URL, panel close'}
    },
    async gestures() {
      await viewport({width:390,height:844}); await navigate()
      await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2})
      const state = () => evaluate('({target:window.campusMapLab.controls.target.toArray(),distance:window.campusMapLab.controls.getDistance(),azimuth:window.campusMapLab.controls.getAzimuthalAngle(),polar:window.campusMapLab.controls.getPolarAngle()})')
      const initial = await state()
      await gesture([[130,350],[250,350]],[[180,350],[300,350]])
      const pan = await state(); assert(Math.hypot(pan.target[0]-initial.target[0],pan.target[2]-initial.target[2])>10)
      await evaluate('window.campusMapLab.resetView()')
      await gesture([[150,410],[240,410]],[[100,410],[290,410]])
      assert((await state()).distance < initial.distance * .7)
      await evaluate('window.campusMapLab.resetView()')
      await gesture([[135,410],[255,410]],[[165,358],[225,462]])
      assert((await state()).azimuth - initial.azimuth > .8)
      assert.equal(await selected(),undefined)
      await evaluate('window.campusMapLab.resetView()')
      await gesture([[130,330],[250,330]],[[130,410],[250,410]])
      assert((await state()).polar > initial.polar + .2)
      await evaluate("{const q=document.getElementById('render-quality');q.value='battery';q.dispatchEvent(new Event('change'))}")
      assert((await evaluate('window.campusMapLab.rendering().pixelRatio'))<=1.25)
      await evaluate("{const q=document.getElementById('render-quality');q.value='clear';q.dispatchEvent(new Event('change'))}")
      await evaluate("{const c=document.getElementById('layer-buildings');c.checked=false;c.dispatchEvent(new Event('change'))}")
      await evaluate("{const c=document.getElementById('layer-buildings');c.checked=true;c.dispatchEvent(new Event('change'))}")
      // Real document freeze/resume, with selected place preserved.
      await navigate('?embed=wechat&buildingId=osm-building-616829077')
      await send('Page.setWebLifecycleState',{state:'frozen'}); await pause(300)
      await send('Page.setWebLifecycleState',{state:'active'})
      assert.equal(await selected(),'osm-building-616829077')
      await screenshot('mobile-390-library')
      return {pass:true,checks:'two-finger pan, pinch, twist, tilt, quality, layers, freeze/resume'}
    },
    async fallbackAndNetwork() {
      await viewport({width:390,height:844}); await navigate('?embed=wechat&buildingId=osm-building-616829077')
      await evaluate("document.querySelector('#map-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
      await pause(400)
      assert.equal(await evaluate('window.campusMapLab.mode'),'2d')
      assert.equal(await selected(),'osm-building-616829077')
      assert.equal(await evaluate("document.querySelectorAll('#flat-map [data-building-id]').length"),93)
      await screenshot('context-loss-2d')
      const injection = await send('Page.addScriptToEvaluateOnNewDocument',{source:"const original=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args)}"})
      try {
        await navigate()
        assert.equal(await evaluate('window.campusMapLab.mode'),'2d')
      } finally { await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier}) }
      await navigate('?embed=wechat&buildingId=unknown')
      assert.equal(await selected(),undefined)
      await send('Network.enable')
      await send('Network.setCacheDisabled',{cacheDisabled:true})
      await send('Network.emulateNetworkConditions',{offline:false,latency:400,downloadThroughput:128*1024,uploadThroughput:64*1024})
      try { await navigate(); assert.equal(await evaluate('window.campusMapLab.mode'),'3d') }
      finally {
        await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
        await send('Network.setCacheDisabled',{cacheDisabled:false})
        await send('Network.disable')
      }
      return {pass:true,checks:'context loss retains selection in 2D, missing WebGL2, unknown ID, cold throttled 128 KiB/s + 400 ms load',realWeChat:'pending'}
    }
  }
}
