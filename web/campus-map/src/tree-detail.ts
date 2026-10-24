import * as THREE from 'three'
import type { Point } from './data/jinnan-seed'
import { createGardenCanopyGeometry, gardenTreeStyle, PINE_MODEL } from './eastern-row-trees'

/** Six instanced batches; each tier keeps the approved garden-tree silhouette and site. */
export function installTreeDetail(group: THREE.Group) {
  const originalCanopy=group.getObjectByName('pine-tree-foliage') as THREE.InstancedMesh|undefined
  const originalStems=group.getObjectByName('pine-tree-stems') as THREE.InstancedMesh|undefined
  if(!originalCanopy||!originalStems)return {update:()=>{}}
  const points:Point[]=group.userData.layout.sites.map((s:{point:Point})=>s.point)
  function batch(geometry:THREE.BufferGeometry,material:THREE.Material|THREE.Material[],name:string){
    const mesh=new THREE.InstancedMesh(geometry,material,points.length);mesh.name=name;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);return mesh
  }
  const foliage=[originalCanopy,batch(createGardenCanopyGeometry('medium'),originalCanopy.material,'pine-medium-canopy'),batch(createGardenCanopyGeometry('coarse'),originalCanopy.material,'pine-coarse-canopy')]
  const stems=[originalStems,batch(new THREE.CylinderGeometry(.38,.56,2.4,6),originalStems.material,'pine-medium-stems'),batch(new THREE.CylinderGeometry(.38,.56,2.4,4),originalStems.material,'pine-coarse-stems')]
  const lastCamera=new THREE.Vector3(Infinity,Infinity,Infinity), matrix=new THREE.Matrix4(), point=new THREE.Vector3()
  let lastHeight=0,lastFull=false,lastTime=-Infinity
  return {update(camera:THREE.PerspectiveCamera,height:number,full:boolean,now:number){
    if(height===lastHeight&&full===lastFull&&(now-lastTime<100||lastCamera.distanceToSquared(camera.position)<16))return
    lastCamera.copy(camera.position);lastHeight=height;lastFull=full;lastTime=now
    const counts=[0,0,0],pixelScale=PINE_MODEL.height*height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))
    const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1,1,1)
    for(const [x,z] of points){
      point.set(x,6,z)
      const pixels=pixelScale/Math.max(1,point.distanceTo(camera.position))
      const tier=full||pixels>38?0:pixels>17?1:2
      const index=counts[tier]++
      const style=gardenTreeStyle([x,z])
      matrix.compose(new THREE.Vector3(x,.04,z),rotation,style.scale);foliage[tier].setMatrixAt(index,matrix)
      foliage[tier].setColorAt(index,new THREE.Color(style.color))
      matrix.compose(new THREE.Vector3(x,1.24,z),rotation,scale);stems[tier].setMatrixAt(index,matrix)
    }
    for(let tier=0;tier<3;tier++)for(const mesh of [foliage[tier],stems[tier]]){
      mesh.count=counts[tier];mesh.visible=counts[tier]>0;mesh.instanceMatrix.needsUpdate=true
      mesh.boundingSphere=null;if(mesh.count)mesh.computeBoundingSphere()
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
    }
    group.userData.detailCounts={fine:counts[0],medium:counts[1],coarse:counts[2]}
  }}
}
