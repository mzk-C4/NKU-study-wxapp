/** Offline integration checks: no WeChat account, network or deployment changes. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import {loadLocalTs} from './load-local-ts.mjs'

async function moduleFrom(path, replacements = {}) {
  const source = await readFile(resolve(path), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/from (['"])([^'"]+)\1/g, (match, quote, name) => replacements[name] ? `from ${JSON.stringify(replacements[name])}` : match)
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  return { url, exports: await import(url) }
}
const source = await readFile(resolve('src/data/jinnan-model.ts'), 'utf8')
const model = new Function(source.replace(/^\/\*\*[^]*?\*\/\n/, '').replace(/^import[^\n]+\n/, '').replace('export const campusModel: CampusSeed =', 'return'))()
const { exports: supplements } = await moduleFrom('src/data/supplemental-buildings.ts')
const { exports: statue } = await moduleFrom('src/data/zhou-enlai-monument.ts')
model.buildings.push(...supplements.SUPPLEMENTAL_BUILDINGS, statue.ZHOU_ENLAI_STATUE_BUILDING)
const links = await moduleFrom('src/map-links.ts')
const { entryBuildingId, selectionUrl, modeUrl, escapeHtml } = links.exports
const href = 'https://nkulawer.cn/campus-map/?embed=wechat&mode=2d#map'
const monument = statue.ZHOU_ENLAI_STATUE_ID
assert.equal(entryBuildingId(selectionUrl(href, monument)), monument)
assert.equal(new URL(selectionUrl(href, monument)).searchParams.get('mode'), '2d')
assert.equal(new URL(selectionUrl(href, monument)).hash, '#map')
assert.equal(entryBuildingId(selectionUrl(selectionUrl(href, monument))), '')
assert.equal(new URL(modeUrl(href, '3d')).searchParams.get('mode'), null)
assert.equal(entryBuildingId('https://nkulawer.cn/campus-map/?buildingId=%E0'), '')
assert.equal(entryBuildingId(selectionUrl(href, '<script>')), '')
assert.equal(escapeHtml('<img "&\'>'), '&lt;img &quot;&amp;&#39;&gt;')

const flat = {exports:await loadLocalTs('src/flat-map.ts')}
const markup = flat.exports.flatMapMarkup(model)
assert.equal((markup.match(/data-building-id=/g) || []).length, model.buildings.length, '2D must include every building and named monument')
assert.equal((markup.match(/data-map-layer=/g) || []).length, 4)
assert(markup.includes('周总理雕像'))
for (const building of supplements.SUPPLEMENTAL_BUILDINGS) {
  const group = markup.split(`data-building-id="${building.id}"`)[1].split('</g>')[0]
  assert.equal((group.match(/<path /g) || []).length, building.volumes.length, 'Reconstruct compound wings without filling courtyard envelopes')
}
const maliciousModel = { ...model, buildings: [{ ...model.buildings[0], name: '<img src=x onerror=alert(1)>' }] }
assert(!flat.exports.flatMapMarkup(maliciousModel).includes('<img'), 'Do not interpolate executable markup from names')

const webOnly=process.argv.includes('--web-only')
if(!webOnly){
const env = await moduleFrom('../miniprogram/config/env.ts')
const mini = await moduleFrom('../miniprogram/utils/campus-map-links.ts', { '../config/env': env.url })
assert.equal(mini.exports.campusMapUrl(monument), `https://nkulawer.cn/campus-map/?embed=wechat&buildingId=${monument}`)
for (const id of ['../../admin', '<script>', 'name with spaces', 'a'.repeat(101)]) assert.equal(mini.exports.validMapBuildingId(id), '')
assert.equal(mini.exports.sharedMapBuildingId(`https://evil.example/campus-map/?buildingId=${monument}`), '')
assert.equal(mini.exports.sharedMapBuildingId(`https://nkulawer.cn.evil.example/campus-map/?buildingId=${monument}`), '')
assert.equal(mini.exports.sharedMapBuildingId(`https://nkulawer.cn/campus-map/?buildingId=${monument}`), monument)
assert.equal(mini.exports.sharedMapBuildingId('https://nkulawer.cn/campus-map/?embed=wechat'), '')

const pageSource = await readFile(resolve('../miniprogram/pages/campus-map/index.ts'), 'utf8')
const pageCode = ts.transpileModule(pageSource, { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS } }).outputText
let page
runInNewContext(pageCode, {
  exports: {},
  require: name => { assert.equal(name, '../../utils/campus-map-links'); return mini.exports },
  Page: options => { page = options },
  wx: { navigateBack: () => {}, switchTab: () => {} },
})
page.setData = updates => Object.assign(page.data, updates)
page.onLoad({ buildingId: monument })
assert(page.data.url.includes(monument))
assert.equal(page.onShareAppMessage({ webViewUrl: mini.exports.campusMapUrl('reference-building-tourism') }).path, '/pages/campus-map/index?buildingId=reference-building-tourism')
assert.equal(page.onShareAppMessage({ webViewUrl: mini.exports.campusMapUrl() }).path, '/pages/campus-map/index', 'After reset, share the whole campus rather than stale entry ID')
assert.equal(page.onShareAppMessage({}).path, `/pages/campus-map/index?buildingId=${monument}`)
page.onError(); assert.equal(page.data.failed, true)
page.retry(); assert.equal(page.data.failed, false)
page.onLoad({ buildingId: '../../admin', url: 'https://evil.example/' })
assert.equal(page.data.url, mini.exports.campusMapUrl(), 'The native page must not accept arbitrary web URLs')
const app = JSON.parse(await readFile(resolve('../miniprogram/app.json'), 'utf8'))
assert(app.pages.includes('pages/webview/index') && app.pages.includes('pages/campus-map/index'))
assert.equal(new Set(app.pages).size, app.pages.length)
const home = await readFile(resolve('../miniprogram/pages/home/index.wxml'), 'utf8')
assert(home.indexOf('/pages/campus-map/index') < home.indexOf('wx:if="{{hasData}}"'), 'Map entry should not depend on archive API data')
}
const main = await readFile(resolve('src/main.ts'), 'utf8')
assert(!main.includes("probe.getContext('webgl')"), 'WebGL1 is not sufficient for the installed renderer')
assert(main.includes('import.meta.env.BASE_URL'))
assert(main.includes('activePointers.size > 1') && main.includes('webglcontextlost'))
console.log(`WeChat integration checks passed: ${model.buildings.length} real 2D building groups, compound courtyards, safe deep links and reset/share; ${webOnly?'standalone web checks (native demo checked by delivery verifier)':'native fixed-origin page/retries and existing course web-view preserved'}.`)
