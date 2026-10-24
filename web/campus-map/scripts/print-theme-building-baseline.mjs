/** Read-only baseline extraction from the pre-theme snapshot; never updates it. */
import {readFile,readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {sourceHash,protectedBuildingNodes} from './building-preservation.mjs'
const before=resolve('../backups/campus-map-lab-20261015-before-nkustudy-theme')
const paths=['src/public-teaching.ts','src/laboratory-buildings.ts','src/frontier-center.ts','src/sports-grounds.ts','src/lakeside-pavilion.ts','src/white-building.ts','src/zhou-enlai-statue.ts','src/map-detail.ts','src/map-camera.ts','src/map-touch.ts','src/map-rendering.ts','src/road-profile.ts']
for(const name of await readdir(resolve(before,'src/data')))if(name.endsWith('.ts'))paths.push(`src/data/${name}`)
const files={};for(const path of paths)files[path]=sourceHash(await readFile(resolve(before,path),'utf8'))
console.log(JSON.stringify({version:1,source:'2026-10-15 pre-NKUStudy-theme snapshot',files,nodes:protectedBuildingNodes(await readFile(resolve(before,'src/main.ts'),'utf8'))}))
