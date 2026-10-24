/** Explicit standalone handoff export. Never deploys or overwrites an existing destination. */
import {cp,mkdir,readFile,writeFile,readdir,lstat,access} from 'node:fs/promises'
import {dirname,resolve,relative,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {loadLocalTs} from './load-local-ts.mjs'
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const destination=process.argv[2]?resolve(process.argv[2]):null
if(!destination)throw new Error('Usage: node scripts/prepare-delivery.mjs <new-output-directory> [--seal]')
if(destination===project||destination.startsWith(project+sep)||project.startsWith(destination+sep))throw new Error('Output must be a separate handoff directory outside the source project')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
async function fileList(folder,base=folder){
  const output=[]
  for(const entry of await readdir(folder,{withFileTypes:true})){
    if(entry.name==='node_modules'||entry.name==='.git')continue
    const path=resolve(folder,entry.name)
    if((await lstat(path)).isSymbolicLink())throw new Error('Symlinks are not included in delivery: '+path)
    if(entry.isDirectory())output.push(...await fileList(path,base))
    else output.push(relative(base,path).split(sep).join('/'))
  }
  return output.sort()
}
async function seal(){
  const paths=(await fileList(destination)).filter(p=>p!=='SHA256SUMS.json')
  const files=[]
  for(const path of paths){const bytes=await readFile(resolve(destination,path));files.push({path,bytes:bytes.length,sha256:sha(bytes)})}
  await writeFile(resolve(destination,'SHA256SUMS.json'),JSON.stringify({releaseDate:'2026-10-16',algorithm:'SHA-256',files},null,2)+'\n')
  console.log(JSON.stringify({destination,files:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0)}))
}
if(process.argv.includes('--seal')){await seal();process.exit(0)}
let exists=false;try{await access(destination);exists=true}catch{}
if(exists)throw new Error('Destination exists; choose a new directory, never overwrite')
await mkdir(destination,{recursive:true})
const webRoot=resolve(destination,'campus-map')
await mkdir(webRoot)
for(const name of ['src','scripts','data','reference','public','docs','handoff','index.html','package-lock.json','package.json','tsconfig.json','vite.config.ts','.gitignore','README.md','WECHAT-INTEGRATION.md','TECHNICAL-REPORT.md'])await cp(resolve(project,name),resolve(webRoot,name),{recursive:true})
await cp(resolve(project,'dist'),resolve(webRoot,'dist'),{recursive:true})
await cp(resolve(project,'dist'),resolve(destination,'web-dist'),{recursive:true})
for(const name of await readdir(resolve(project,'handoff')))await cp(resolve(project,'handoff',name),resolve(destination,name),{recursive:true})
await mkdir(resolve(destination,'licenses'),{recursive:true})
for(const [source,target] of [['three/LICENSE','three-LICENSE.txt'],['vite/LICENSE.md','vite-LICENSE.md'],['typescript/LICENSE.txt','typescript-LICENSE.txt']])await cp(resolve(project,'node_modules',source),resolve(destination,'licenses',target))
for(const path of ['web-dist/LICENSE-three.txt','campus-map/public/LICENSE-three.txt','campus-map/dist/LICENSE-three.txt'])await cp(resolve(project,'node_modules/three/LICENSE'),resolve(destination,path))
const pkg=JSON.parse(await readFile(resolve(webRoot,'package.json'),'utf8'))
pkg.scripts.check=pkg.scripts.check.replace('node scripts/wechat-smoke.mjs','node scripts/wechat-smoke.mjs --web-only')
await writeFile(resolve(webRoot,'package.json'),JSON.stringify(pkg,null,2)+'\n')
const {campusModel}=await loadLocalTs(resolve(project,'src/data/campus-model.ts'))
const {createPlaceCatalog}=await loadLocalTs(resolve(project,'src/map-places.ts'))
await mkdir(resolve(destination,'models'),{recursive:true})
await writeFile(resolve(destination,'models/model-catalog.json'),JSON.stringify({releaseDate:'2026-10-16',coordinateSystem:'Local metres; X east, Z south, Y up; not GCJ-02 lat/lon',sourceNote:'Data snapshot only. Procedural fine geometry remains in campus-map/src.',...campusModel},null,2)+'\n')
await writeFile(resolve(destination,'models/place-catalog.json'),JSON.stringify({releaseDate:'2026-10-16',places:createPlaceCatalog(campusModel)},null,2)+'\n')
const previewFolder=process.env.CAMPUS_MAP_PREVIEW_DIR
if(previewFolder){
  await mkdir(resolve(destination,'previews'),{recursive:true})
  for(const name of ['nkustudy-panel-open.png','nkustudy-overview-button.png','nkustudy-places-2d.png','nkustudy-desktop-full.png'])await cp(resolve(previewFolder,name),resolve(destination,'previews',name))
}
const protectedPaths=Object.keys(JSON.parse(await readFile(resolve(project,'reference/building-model-preservation.json'),'utf8')).files)
for(const path of [...protectedPaths,'src/main.ts','src/map-ui.ts','src/style.css','src/map-places.ts','src/map-markers.ts','src/map-search.ts','src/eastern-row-trees.ts','src/west-road-trees.ts','package-lock.json']){
  if(sha(await readFile(resolve(project,path)))!==sha(await readFile(resolve(webRoot,path))))throw new Error('Source copy mismatch: '+path)
}
await writeFile(resolve(destination,'DELIVERY.json'),JSON.stringify({releaseDate:'2026-10-16',webBase:'/campus-map/',buildEnvironment:{node:process.version},counts:{buildings:campusModel.buildings.length,roads:campusModel.roads.length,landscapes:campusModel.greens.length,places:createPlaceCatalog(campusModel).length,namedLabels:createPlaceCatalog(campusModel).filter(p=>p.labelVisible).length},sourceChangesInExport:['package.json check adds --web-only for standalone tests; application/model source and lockfile unchanged'],notIncluded:['node_modules','.git','.env','credentials','private developer config','real AppID','main website','course/archive modules','old release archives'],deployed:false,realWeChatTest:'pending'},null,2)+'\n')
await mkdir(resolve(destination,'verification'),{recursive:true})
await writeFile(resolve(destination,'verification/交付检查记录.md'),'# 交付检查记录\n\n此目录预留给打包后的验证结果。实际状态由后续写入的验收记录与控制台检查结果确认；不将本地模拟描述为真实微信验收。\n')
await seal()
