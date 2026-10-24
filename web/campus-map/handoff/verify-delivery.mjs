import assert from 'node:assert/strict'
import {readFile,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {dirname,resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
const root=dirname(fileURLToPath(import.meta.url)),manifest=JSON.parse(await readFile(resolve(root,'SHA256SUMS.json'),'utf8'))
for(const item of manifest.files){
  const path=resolve(root,item.path)
  assert(path.startsWith(root+sep),'Manifest path must stay in package')
  const bytes=await readFile(path)
  assert.equal(bytes.length,item.bytes,`File size mismatch: ${item.path}`)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,`Checksum mismatch: ${item.path}`)
}
const models=JSON.parse(await readFile(resolve(root,'models/model-catalog.json'),'utf8'))
const places=JSON.parse(await readFile(resolve(root,'models/place-catalog.json'),'utf8'))
assert.equal(models.buildings.length,93);assert.equal(models.roads.length,282)
assert.equal(places.places.filter(p=>p.labelVisible).length,78)
const build=await readFile(resolve(root,'web-dist/index.html'),'utf8')
for(const match of build.matchAll(/(?:src|href)="(\/campus-map\/[^"?#]+)"/g)){
  const relative=decodeURIComponent(match[1].slice('/campus-map/'.length))
  assert(!relative.includes('..'))
  assert((await stat(resolve(root,'web-dist',relative))).isFile())
}
const require=createRequire(import.meta.url),links=require(resolve(root,'wechat-demo/utils/campus-map-links.js'))
const config=require(resolve(root,'wechat-demo/config/map-config.js'))
assert.match(config.MAP_ORIGIN,/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/)
const id='reference-monument-zhou-enlai'
assert(links.campusMapUrl(id).endsWith('buildingId='+id))
for(const invalid of ['../../admin','<script>','a'.repeat(101)])assert.equal(links.validMapBuildingId(invalid),'')
assert.equal(links.sharedMapBuildingId(`https://evil.example/campus-map/?buildingId=${id}`),'')
assert.equal(links.sharedMapBuildingId(config.MAP_ORIGIN+'.evil.example/campus-map/?buildingId='+id),'')
assert.equal(links.sharedMapBuildingId(links.campusMapUrl(id)),id)
let page,returned=''
runInNewContext(await readFile(resolve(root,'wechat-demo/pages/campus-map/index.js'),'utf8'),{
  require:name=>{assert.equal(name,'../../utils/campus-map-links');return links},
  Page:options=>{page=options},wx:{navigateBack:options=>options.fail(),reLaunch:options=>{returned=options.url}},
})
page.setData=values=>Object.assign(page.data,values)
page.onLoad({buildingId:id});assert.equal(page.data.url,links.campusMapUrl(id))
assert(page.onShareAppMessage({webViewUrl:links.campusMapUrl('place-cainiao')}).path.endsWith('buildingId=place-cainiao'))
assert.equal(page.onShareAppMessage({webViewUrl:links.campusMapUrl()}).path,'/pages/campus-map/index')
page.onError();assert.equal(page.data.failed,true);page.retry();assert.equal(page.data.failed,false)
page.onLoad({buildingId:'../../admin',url:'https://evil.example/'});assert.equal(page.data.url,links.campusMapUrl())
page.goBack();assert.equal(returned,'/pages/home/index')
const app=JSON.parse(await readFile(resolve(root,'wechat-demo/app.json'),'utf8'))
for(const name of app.pages)for(const ext of ['js','json','wxml','wxss'])assert((await stat(resolve(root,'wechat-demo',name+'.'+ext))).isFile())
console.log(`Delivery verified: ${manifest.files.length} SHA-256 files; 93 models / 78 named labels; web resources and native demo fixed-origin/share/retry/back logic. Real WeChat/HTTPS deployment still pending.`)
