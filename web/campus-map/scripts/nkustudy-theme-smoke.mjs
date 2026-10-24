import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {loadLocalTs} from './load-local-ts.mjs'
import {sourceHash,protectedBuildingNodes} from './building-preservation.mjs'
const baseline=JSON.parse(await readFile('reference/building-model-preservation.json','utf8'))
for(const [path,hash] of Object.entries(baseline.files))assert.equal(sourceHash(await readFile(path,'utf8')),hash,`Protected building/data/gesture code changed: ${path}`)
const currentNodes=protectedBuildingNodes(await readFile('src/main.ts','utf8'))
assert(Object.keys(baseline.nodes).length>25,'Capture original inline factories, materials and assembly')
for(const [name,hash] of Object.entries(baseline.nodes))assert.equal(currentNodes[name],hash,`Building factory or material changed: ${name}`)
const {MAP_THEME,matchesPlaceCategory}=await loadLocalTs('src/map-theme.ts')
assert.equal(MAP_THEME.green,'#b8d0a0');assert.equal(MAP_THEME.water,'#adcbd6');assert.equal(MAP_THEME.primary,'#57216f')
assert.match(await readFile('src/main.ts','utf8'),/addMergedAreas\(greens, 0xb8d0a0, 0\.04\)/,'3D lawns must match the shared 2D green palette')
const {PINE_MODEL,createGardenCanopyGeometry,gardenTreeStyle}=await loadLocalTs('src/eastern-row-trees.ts')
assert(PINE_MODEL.canopyRadius<=3.6&&PINE_MODEL.height<11.74,'Do not enlarge crowns into buildings')
for(const tier of ['fine','medium','coarse']){const geometry=createGardenCanopyGeometry(tier);geometry.computeBoundingBox();assert(geometry.boundingBox.max.y<=9.61);geometry.dispose()}
assert(gardenTreeStyle([100,-100]).scale.x<=1)
assert(matchesPlaceCategory({name:'学生宿舍1',category:'residence',aliases:[]},'residence'))
assert(matchesPlaceCategory({name:'第一食堂',category:'service',aliases:[]},'food'))
console.log(`NKUStudy theme passed: ${Object.keys(baseline.files).length} protected files and ${Object.keys(baseline.nodes).length} inline building nodes unchanged; palette, smaller trees and categories checked.`)
