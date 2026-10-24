import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type DetailMode = 'auto' | 'full'
type Tier = 'coarse' | 'medium' | 'fine'
interface Entry { root: THREE.Object3D; original: THREE.Object3D; medium: THREE.Group; coarse: THREE.Group; sphere: THREE.Sphere; tier: Tier }

/** Filter connected solid parts rather than a single bounding box: courts stay empty.
 * Original authored geometry is untouched. Distant parts are batched by material.
 */
function filteredParts(geometry: THREE.BufferGeometry, transform: THREE.Matrix4, coarse: boolean, smallLandmark: boolean) {
  const source = geometry.getAttribute('position'), indices = geometry.index
  const count = indices?.count ?? source.count
  const parent = new Int32Array(source.count)
  const representative = new Map<string, number>()
  const vertex = new THREE.Vector3()
  for (let n = 0; n < source.count; n++) {
    parent[n] = n
    const key = `${Math.round(source.getX(n)*1000)},${Math.round(source.getY(n)*1000)},${Math.round(source.getZ(n)*1000)}`
    const previous = representative.get(key)
    if (previous === undefined) representative.set(key, n)
    else parent[n] = previous
  }
  function find(n: number): number { let root = n; while(parent[root]!==root) root=parent[root]; while(parent[n]!==n){ const next=parent[n];parent[n]=root;n=next } return root }
  const at = (i: number) => indices ? indices.getX(i) : i
  for (let i = 0; i < count; i += 3) {
    const a=find(at(i)), b=find(at(i+1)), c=find(at(i+2))
    parent[b]=a; parent[c]=a
  }
  const boxes = new Map<number, THREE.Box3>()
  for (let i = 0; i < source.count; i++) {
    const root=find(i), box=boxes.get(root) ?? new THREE.Box3()
    box.expandByPoint(vertex.fromBufferAttribute(source,i).applyMatrix4(transform));boxes.set(root,box)
  }
  const keep = new Set<number>(), size = new THREE.Vector3()
  for (const [root,box] of boxes) {
    box.getSize(size)
    const sorted = [size.x,size.y,size.z].sort((a,b)=>b-a)
    if (smallLandmark || (coarse ? sorted[0]>=8 && sorted[1]>=4 : sorted[0]>=2.5 && sorted[1]>=.65)) keep.add(root)
  }
  if (!keep.size) return null
  const positions:number[]=[], normals:number[]=[], uvs:number[]=[]
  const normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv'),normalMatrix=new THREE.Matrix3().getNormalMatrix(transform)
  const reversed = transform.determinant()<0
  for(let i=0;i<count;i+=3) {
    if(!keep.has(find(at(i)))) continue
    for(const j of reversed ? [i,i+2,i+1] : [i,i+1,i+2]) {
      const n=at(j)
      vertex.fromBufferAttribute(source,n).applyMatrix4(transform);positions.push(vertex.x,vertex.y,vertex.z)
      if(normal) vertex.fromBufferAttribute(normal,n).applyNormalMatrix(normalMatrix)
      else vertex.set(0,1,0)
      normals.push(vertex.x,vertex.y,vertex.z);uvs.push(uv?.getX(n)??0,uv?.getY(n)??0)
    }
  }
  const result=new THREE.BufferGeometry()
  result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3))
  result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2))
  return result
}

export function createDetailProxy(original: THREE.Object3D, coarse: boolean, smallLandmark = false) {
  original.updateWorldMatrix(true,true)
  const inverse=new THREE.Matrix4().copy(original.parent?.matrixWorld ?? new THREE.Matrix4()).invert()
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>()
  const group=new THREE.Group()
  group.name=coarse?'远景楼体与屋顶':'中景主要立面'
  original.traverse(object=> {
    if (!(object instanceof THREE.Mesh)) return
    // The authored campus meshes have single materials; preserve unknown multi-materials.
    if(Array.isArray(object.material)) {const copy=object.clone(false);copy.matrixAutoUpdate=false;copy.matrix.copy(inverse.clone().multiply(object.matrixWorld));group.add(copy);return}
    const append=(matrix:THREE.Matrix4)=>{
      const geometry=filteredParts(object.geometry,inverse.clone().multiply(matrix),coarse,smallLandmark)
      if(!geometry)return
      const parts=batches.get(object.material as THREE.Material)??[];parts.push(geometry);batches.set(object.material as THREE.Material,parts)
    }
    if(object instanceof THREE.InstancedMesh) {
      // Tiny repeated fins, window frames and rails are not needed at distance.
      for(let i=0;i<object.count;i++){const matrix=new THREE.Matrix4();object.getMatrixAt(i,matrix);append(matrix.premultiply(object.matrixWorld))}
    } else append(object.matrixWorld)
  })
  for(const [material,parts] of batches) {
    const merged=mergeGeometries(parts,false);parts.forEach(p=>p.dispose())
    if(merged){merged.computeBoundingSphere();group.add(new THREE.Mesh(merged,material))}
  }
  return group
}

export class MapDetailManager {
  private entries:Entry[]=[]
  mode:DetailMode='auto'
  register(root:THREE.Object3D,original:THREE.Object3D,smallLandmark=false) {
    const medium=createDetailProxy(original,false,smallLandmark),coarse=createDetailProxy(original,true,smallLandmark)
    if(!medium.children.length || !coarse.children.length) return
    root.add(medium,coarse)
    const sphere=new THREE.Box3().setFromObject(original).getBoundingSphere(new THREE.Sphere())
    medium.visible=false;coarse.visible=false
    this.entries.push({root,original,medium,coarse,sphere,tier:'fine'})
  }
  update(camera:THREE.PerspectiveCamera,height:number) {
    for(const e of this.entries) {
      const distance=Math.max(camera.position.distanceTo(e.sphere.center),1)
      const pixels=e.sphere.radius*height/(distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))
      // 12% hysteresis prevents flicker while pinching around a threshold.
      const fineThreshold=e.tier==='fine'?246:280
      const midThreshold=e.tier==='coarse'?106:94
      const tier:Tier=this.mode==='full'||pixels>=fineThreshold?'fine':pixels>=midThreshold?'medium':'coarse'
      e.original.visible=tier==='fine';e.medium.visible=tier==='medium';e.coarse.visible=tier==='coarse';e.tier=tier
      e.root.userData.detailTier=tier
    }
  }
  stats(){return this.entries.reduce((s,e)=>{s[e.tier]++;return s},{coarse:0,medium:0,fine:0,mode:this.mode})}
}
