import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ZHOU_ENLAI_STATUE_SITE, ZHOU_ENLAI_STATUE_BUILDING, ZHOU_ENLAI_INSCRIPTION } from './data/zhou-enlai-monument'

export function createZhouEnlaiStatue() {
  const group = new THREE.Group()
  group.name = '周总理雕像 · 人物姿态模型'
  group.position.set(ZHOU_ENLAI_STATUE_SITE.x, 0, ZHOU_ENLAI_STATUE_SITE.z)
  group.rotation.y = ZHOU_ENLAI_STATUE_SITE.yaw
  const materials = {
    stone: new THREE.MeshLambertMaterial({ color: 0xc7cac7 }),
    stoneEdge: new THREE.MeshLambertMaterial({ color: 0xa1a7a4 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x806a58, roughness: .88, metalness: .25, flatShading: true }),
  }
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  function add(geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometry.deleteAttribute('uv')
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (flat !== geometry) geometry.dispose()
    // 人物统一用明确的切面法线，避免侧光下又呈现圆滑过渡。
    if (material === materials.bronze) flat.computeVertexNormals()
    const batch = batches.get(material) ?? []; batch.push(flat); batches.set(material, batch)
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
    const geometry = new THREE.BoxGeometry(w, h, d); geometry.translate(x, y, z); add(geometry, material)
  }
  function oval(rx: number, ry: number, rz: number, x: number, y: number, z: number, material: THREE.Material, rotation = 0) {
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    geometry.scale(rx, ry, rz); geometry.rotateZ(rotation); geometry.translate(x, y, z); add(geometry, material)
  }
  function limb(a: number[], b: number[], startRadius: number, endRadius: number, material: THREE.Material, flatten = 1) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
    const geometry = new THREE.CylinderGeometry(endRadius, startRadius, start.distanceTo(end), 8, 1)
    geometry.scale(1, 1, flatten)
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize())))
    geometry.translate(...start.add(end).multiplyScalar(.5).toArray()); add(geometry, material)
  }
  // 三层浅灰台阶、暗灰底脚、方形石座及棕色雕像垫板。
  box(5.8, .16, 5.2, 0, .08, 0, materials.stone)
  box(5.0, .16, 4.4, 0, .24, 0, materials.stone)
  box(4.2, .16, 3.6, 0, .40, 0, materials.stone)
  box(2.5, .22, 2.1, 0, .59, 0, materials.stoneEdge)
  box(2.85, 1.50, 2.45, 0, 1.45, 0, materials.stone)
  box(2.97, .14, 2.57, 0, 2.27, 0, materials.stone)
  box(2.40, .12, 1.85, 0, 2.40, 0, materials.bronze)

  const feetY = 2.46
  // 只保留脚部、双腿和躯干轮廓，不制作衣裤、褶皱、鞋面或五官细节。
  for (const side of [-1, 1]) {
    oval(.19, .10, .34, side * .24, feetY + .10, .12, materials.bronze)
    limb([side * .24, feetY + .18, 0], [side * .24, feetY + 1.02, -.03], .145, .175, materials.bronze, 1.08)
    oval(.175, .17, .189, side * .24, feetY + 1.02, -.03, materials.bronze)
    limb([side * .24, feetY + 1.02, -.03], [side * .22, feetY + 1.87, -.03], .175, .22, materials.bronze, 1.08)
  }
  // 约七头身：腿部接近总身高的一半，腰部收窄、肩部自然展宽。
  const rings = [
    [1.75, .44, .25], [1.91, .47, .28], [2.30, .44, .26],
    [2.68, .49, .29], [3.10, .59, .27], [3.25, .40, .23], [3.35, .18, .15],
  ]
  const vertices: number[] = [], indices: number[] = [], segments = 8
  for (const [y, rx, rz] of rings) for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2
    vertices.push(Math.cos(angle) * rx, feetY + y, Math.sin(angle) * rz - .025)
  }
  for (let r = 1; r < rings.length; r++) for (let i = 0; i < segments; i++) {
    const a = (r - 1) * segments + i, b = (r - 1) * segments + (i + 1) % segments, c = r * segments + i, d = r * segments + (i + 1) % segments
    indices.push(a, c, b, b, c, d)
  }
  for (const r of [0, rings.length - 1]) {
    const center = vertices.length / 3; vertices.push(0, feetY + rings[r][0], -.025)
    for (let i = 0; i < segments; i++) {
      const a = r * segments + i, b = r * segments + (i + 1) % segments
      indices.push(...(r === 0 ? [center, a, b] : [center, b, a]))
    }
  }
  const torso = new THREE.BufferGeometry(); torso.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); torso.setIndex(indices); torso.computeVertexNormals(); add(torso, materials.bronze)
  // 左臂自然下垂并向前收；右肘弯曲，手放在身后腰侧。
  const f = (x: number, y: number, z: number) => [x, feetY + y, z]
  oval(.19, .21, .20, -.53, feetY + 3.10, -.025, materials.bronze)
  limb(f(-.53, 3.10, -.025), f(-.79, 2.48, -.04), .19, .145, materials.bronze)
  oval(.145, .16, .145, -.79, feetY + 2.48, -.04, materials.bronze)
  limb(f(-.79, 2.48, -.04), f(-.43, 2.07, .22), .145, .095, materials.bronze)
  oval(.10, .15, .08, -.39, feetY + 2.00, .25, materials.bronze, -.6)
  oval(.19, .21, .20, .53, feetY + 3.10, -.03, materials.bronze)
  limb(f(.53, 3.10, -.03), f(.80, 2.56, -.12), .19, .145, materials.bronze)
  oval(.145, .15, .145, .80, feetY + 2.56, -.12, materials.bronze)
  limb(f(.80, 2.56, -.12), f(.43, 2.30, -.31), .145, .095, materials.bronze)
  oval(.09, .14, .08, .41, feetY + 2.27, -.30, materials.bronze, .35)
  // 无五官的切面头部，不添加耳、鼻、眼、嘴、发型或衣领。
  limb(f(0, 3.27, -.025), f(0, 3.51, -.025), .14, .13, materials.bronze)
  oval(.215, .29, .23, -.02, feetY + 3.73, -.015, materials.bronze, -.04)

  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose())
    if (!geometry) throw new Error('Statue geometry merge failed')
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'statue-sculpted-detail'; group.add(mesh)
  }
  // 灰色石座正面深色铭牌与金色字；无 DOM 时仍保留可测试的铭牌几何。
  const plaqueMaterial = new THREE.MeshLambertMaterial({ color: 0x55594f })
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 192
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = '#55594f'; context.fillRect(0, 0, 1024, 192)
      context.strokeStyle = '#899082'; context.lineWidth = 8; context.strokeRect(6, 6, 1012, 180)
      context.fillStyle = '#e3c988'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = '128px "KaiTi", "STKaiti", serif'; context.fillText(ZHOU_ENLAI_INSCRIPTION, 512, 102, 900)
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; plaqueMaterial.map = texture; plaqueMaterial.color.set(0xffffff)
    }
  }
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.10, .40), plaqueMaterial)
  plaque.name = `${ZHOU_ENLAI_INSCRIPTION}铭牌`; plaque.position.set(0, 1.72, 1.23); group.add(plaque)
  group.userData.layout = { name: ZHOU_ENLAI_STATUE_BUILDING.name, reference: 'user-photo', posture: 'standing-silhouette', arms: 'left-down-right-behind-waist', surfaceStyle: 'angular-planar', radialSegments: 8, facialFeatures: false, clothingDetails: false, figureHeight: 4.02, headHeight: .58, steppedBase: 3, inscription: ZHOU_ENLAI_INSCRIPTION, placement: 'south-of-library-cross-path', approximateHeight: true }
  return group
}
