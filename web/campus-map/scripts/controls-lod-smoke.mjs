import * as THREE from 'three'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { loadLocalTs } from './load-local-ts.mjs'
async function load(path) {
  const source = await readFile(path,'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g,(_,q,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`)
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
const {configureMapControls,constrainMapCamera,CAMERA_LIMITS}=await load('src/map-camera.ts')
const camera=new THREE.PerspectiveCamera(40,1,.5,6000)
const controls={target:new THREE.Vector3(),touches:{},mouseButtons:{},minDistance:10,maxDistance:3200}
configureMapControls(controls)
assert.equal(controls.screenSpacePanning,false)
assert.equal(controls.touches.TWO,THREE.TOUCH.DOLLY_PAN)
assert.equal(controls.touches.ONE,THREE.TOUCH.PAN)
assert.equal(controls.mouseButtons.LEFT,THREE.MOUSE.ROTATE)
const bounds={minX:0,maxX:2200,minZ:-1600,maxZ:0}
for(const value of [-10000,-500,0,500,10000]) {
  controls.target.set(value,value,value);camera.position.set(value-10,value-200,value+50)
  constrainMapCamera(camera,controls,bounds)
  assert.equal(controls.target.y,0);assert(camera.position.y>=CAMERA_LIMITS.minHeight)
  assert(controls.target.x>=-100&&controls.target.x<=2300&&controls.target.z>=-1700&&controls.target.z<=100)
  const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
  assert(spherical.phi<=CAMERA_LIMITS.maxPolar+1e-8)
}
const {createDetailProxy,MapDetailManager}=await load('src/map-detail.ts')
const root=new THREE.Group(),original=new THREE.Group(),material=new THREE.MeshLambertMaterial({color:0x9c6249})
root.add(original)
for(const z of [-20,20]){const wing=new THREE.Mesh(new THREE.BoxGeometry(50,12,8),material);wing.position.set(0,6,z);original.add(wing)}
for(let i=0;i<100;i++){const frame=new THREE.Mesh(new THREE.BoxGeometry(.1,.2,.1),material);frame.position.set(i/3,14,10);original.add(frame)}
const proxy=createDetailProxy(original,true)
assert.equal(proxy.children.length,1,'Coarse parts batch by material')
const triangles=g=>{let n=0;g.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3});return n}
assert(triangles(proxy)<triangles(original)/10)
const ray=new THREE.Raycaster(new THREE.Vector3(0,100,0),new THREE.Vector3(0,-1,0))
proxy.updateMatrixWorld(true)
assert.equal(ray.intersectObject(proxy,true).length,0,'Proxy must not fill original courtyard')
ray.set(new THREE.Vector3(0,100,20),new THREE.Vector3(0,-1,0));assert(ray.intersectObject(proxy,true).length>0,'Keep main wing')
const originalCount=triangles(original),manager=new MapDetailManager()
manager.register(root,original)
camera.position.set(0,1500,1800);manager.update(camera,844)
assert.equal(original.visible,false)
camera.position.set(0,30,50);manager.update(camera,844);assert.equal(original.visible,true)
manager.mode='full';camera.position.set(0,1500,1800);manager.update(camera,844);assert.equal(original.visible,true)
assert.equal(triangles(original),originalCount,'Authored geometry remains intact')
// Matrix baking must preserve reflected winding and visible top faces.
const mirrored=new THREE.Group(),mirroredRoot=new THREE.Group();mirroredRoot.add(mirrored)
mirrored.scale.x=-1;mirrored.add(new THREE.Mesh(new THREE.BoxGeometry(50,12,8),material))
const reflected=createDetailProxy(mirrored,true);reflected.updateMatrixWorld(true)
ray.set(new THREE.Vector3(0,100,0),new THREE.Vector3(0,-1,0));assert(ray.intersectObject(reflected,true).length>0)
const {installTreeDetail}=await loadLocalTs('src/tree-detail.ts')
const trees=new THREE.Group(),points=[[0,0],[500,0],[1500,0]]
const canopy=new THREE.InstancedMesh(new THREE.ConeGeometry(3.6,11.7,10),material,3);canopy.name='pine-tree-foliage'
const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.48,.56,3.5,8),material,3);stems.name='pine-tree-stems'
trees.add(canopy,stems);trees.userData.layout={sites:points.map(point=>({point}))}
const treeDetail=installTreeDetail(trees);camera.position.set(0,5,15)
treeDetail.update(camera,844,false,1000)
assert.equal(Object.values(trees.userData.detailCounts).reduce((a,b)=>a+b,0),3,'Never remove or duplicate trees')
assert(trees.userData.detailCounts.fine>0&&trees.userData.detailCounts.coarse>0)
treeDetail.update(camera,844,true,2000);assert.equal(trees.userData.detailCounts.fine,3)
const matrix=new THREE.Matrix4();canopy.getMatrixAt(2,matrix);assert.equal(matrix.elements[12],1500)
console.log('Camera/LOD smoke passed: ground/bounds guard, gestures, coarse solid filtering, batched courtyards, original/full-detail preservation, mirrored normals, tree positions and per-site tiers.')
const {pairMetrics,angleDelta}=await load('src/map-touch.ts')
assert(Math.abs(angleDelta(Math.PI*2+.2)-.2)<1e-10)
assert(Math.abs(angleDelta(-Math.PI*2-.2)+.2)<1e-10)
const pair=pairMetrics([{x:10,y:0},{x:10,y:100}]);assert.equal(pair.distance,100);assert.equal(pair.x,10);assert.equal(pair.y,50)
const {mapPixelRatio}=await load('src/map-rendering.ts')
assert.equal(mapPixelRatio(390,844,3,'clear'),2)
assert.equal(mapPixelRatio(390,844,3,'battery'),1.25)
assert(mapPixelRatio(4000,3000,3,'clear')<=.5,'Large viewports stay within a pixel budget')
console.log('Touch/AA policy smoke passed: twist wrap, touch centroid and density/pixel-budget limits.')
