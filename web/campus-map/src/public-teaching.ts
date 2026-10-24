import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Building } from './data/jinnan-seed'

/** 西侧 A/B/C/D 及其两段连接体；东侧对应建筑不在此列表中。 */
export const WEST_PUBLIC_TEACHING_IDS = [
  'osm-building-1430904058', 'osm-building-1430904059',
  'osm-building-1433084261', 'osm-building-1436478222',
  'osm-building-1433084263', 'osm-building-1433084264',
]

// 从 A 区原始外墙取共同轴线，六段模型使用同一坐标系，不单独旋转或搬动楼栋。
export const WEST_TEACHING_FRAME = { x: 1140, z: -700, yaw: -Math.atan2(8.35, 100.09) }
type Rect = [number, number, number, number] // x0, x1, z0, z1
type Face = 'north' | 'south' | 'west' | 'east'

export function createWestPublicTeachingLandmark(building: Building, brick: THREE.Material) {
  return createTeachingClusterPart(building, brick)
}

/** 共用细部模板；实验楼分支只影响调用方，不改变西侧教学楼。 */
export function createTeachingClusterPart(building: Building, brick: THREE.Material, laboratory = false) {
  const group = new THREE.Group()
  group.name = `west-public-teaching-${building.id}`
  group.position.set(WEST_TEACHING_FRAME.x, 1.22, WEST_TEACHING_FRAME.z)
  group.rotation.y = WEST_TEACHING_FRAME.yaw
  const materials = {
    brick, stone: new THREE.MeshLambertMaterial({ color: 0xe5dfd2 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x303f43 }),
    ribbon: new THREE.MeshLambertMaterial({ color: 0x161c1d }),
    frame: new THREE.MeshLambertMaterial({ color: 0x292e30 }),
    roof: new THREE.MeshLambertMaterial({ color: 0x737975 }),
    roofSeam: new THREE.MeshLambertMaterial({ color: 0x92958c }),
    floor: new THREE.MeshLambertMaterial({ color: 0x8f9187 }),
    paving: new THREE.MeshLambertMaterial({ color: 0xd4cdbb }),
    // 建筑底盘与校园主底板保持同一沙色；绿篱使用独立材质，不受影响。
    lawn: new THREE.MeshLambertMaterial({ color: 0xefebe2 }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x567047 }),
  }
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const parts: { name: string; bounds: Rect; bottom: number; height: number }[] = []
  let windows = 0
  let passages = 0
  const eastDetails = { teachingFronts: 0, sideJunctions: 0, screenFronts: 0, screenHoles: [] as { x: number; y: number; z: number }[], openUpperBridge: false }
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const batch = batches.get(material) ?? []
    // 统一索引格式，保证同一材质的细部可以合并。
    if (geometry.index) {
      const flat = geometry.toNonIndexed()
      geometry.dispose()
      batch.push(flat)
    } else batch.push(geometry)
    batches.set(material, batch)
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
    if (w <= .001 || h <= .001 || d <= .001) return
    const geometry = new THREE.BoxGeometry(w, h, d)
    geometry.translate(x, y, z)
    add(geometry, material)
  }
  function slab(rect: Rect, y: number, thickness: number, material: THREE.Material) {
    const [x0, x1, z0, z1] = rect
    box(x1 - x0, thickness, z1 - z0, (x0 + x1) / 2, y + thickness / 2, (z0 + z1) / 2, material)
  }
  type Opening = { z0: number; z1: number; y0: number; y1: number; glass?: boolean; mullions?: boolean }
  // 东立面单独开洞，不把端墙砖屏和门厅套用为普通教室窗格。
  function eastWall(rect: Rect, bottom: number, top: number, openings: Opening[]) {
    const x = rect[1]
    const lo = rect[2], hi = rect[3]
    const holes = openings
      .map(h => h.glass ? h : { ...h, z0: Math.max(lo + .38, h.z0), z1: Math.min(hi - .38, h.z1) })
      .filter(h => h.z1 > lo && h.z0 < hi && h.y1 > bottom && h.y0 < top && (h.glass || h.z1 - h.z0 >= .4))
    const ys = [...new Set([bottom, top, ...holes.flatMap(h => [Math.max(bottom, h.y0), Math.min(top, h.y1)])])].sort((a, b) => a - b)
    for (let row = 0; row < ys.length - 1; row++) {
      const y0 = ys[row], y1 = ys[row + 1]
      const active = holes.filter(h => h.y0 < y1 && h.y1 > y0)
      const zs = [...new Set([lo, hi, ...active.flatMap(h => [Math.max(lo, h.z0), Math.min(hi, h.z1)])])].sort((a, b) => a - b)
      for (let col = 0; col < zs.length - 1; col++) {
        const z0 = zs[col], z1 = zs[col + 1]
        if (active.some(h => h.z0 < z1 && h.z1 > z0)) continue
        box(.65, y1 - y0, z1 - z0, x, (y0 + y1) / 2, (z0 + z1) / 2, brick)
      }
    }
    for (const hole of holes) {
      const z0 = Math.max(lo, hole.z0), z1 = Math.min(hi, hole.z1)
      const y0 = Math.max(bottom, hole.y0), y1 = Math.min(top, hole.y1)
      if (!hole.glass) {
        eastDetails.screenHoles.push({ x, y: (y0 + y1) / 2, z: (z0 + z1) / 2 })
        continue
      }
      box(.075, y1 - y0, z1 - z0, x - .23, (y0 + y1) / 2, (z0 + z1) / 2, materials.ribbon)
      if (hole.mullions) {
        box(.10, y1 - y0, .095, x - .15, (y0 + y1) / 2, (z0 + z1) / 2, materials.frame)
        box(.10, .095, z1 - z0, x - .15, y0 + (y1 - y0) * .44, (z0 + z1) / 2, materials.frame)
      }
    }
  }
  function teachingEastFront(rect: Rect) {
    const openings: Opening[] = []
    const center = (rect[2] + rect[3]) / 2
    const pitch = (rect[3] - rect[2] - 4.8) / 6
    for (let level = 0; level < 3; level++) for (let col = 0; col < 6; col++) {
      const z = rect[2] + 2.4 + (col + .5) * pitch
      if (level < 2 && Math.abs(z - center) < 4.5) continue
      openings.push({ z0: z - 1.55, z1: z + 1.55, y0: level * 4.6 + .65, y1: level * 4.6 + 3.8, glass: true, mullions: true })
      windows++
    }
    openings.push({ z0: center - 3.15, z1: center + 3.15, y0: .35, y1: 7.5, glass: true, mullions: true })
    eastWall(rect, 0, 13.8, openings)
    eastDetails.teachingFronts++
  }
  function screenEastFront(rect: Rect, total: Rect, bottom: number, seam: 'lo' | 'hi', outerEnd: boolean) {
    const openings: Opening[] = []
    const center = (total[2] + total[3]) / 2
    const seam0 = seam === 'lo' ? total[2] : total[3] - 2.6
    openings.push({ z0: seam0, z1: seam0 + 2.6, y0: .25, y1: 18.1, glass: true })
    for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
      const z = center + (col - 3) * 1.2
      openings.push({ z0: z - .27, z1: z + .27, y0: 12.1 + row * .93, y1: 12.58 + row * .93 })
    }
    if (outerEnd) {
      const start = seam === 'lo' ? total[3] - 10.7 : total[2] + 2.2
      openings.push({ z0: start, z1: start + 8.5, y0: .3, y1: 8.6, glass: true })
      // 下部两层高的深色窗厅，以明显的十字构件分格。
      box(.65, 8.3, .66, rect[1] + .03, 4.45, start + 4.25, materials.frame)
      box(.65, .72, 8.5, rect[1] + .03, 4.65, start + 4.25, materials.frame)
      const edge = seam === 'lo' ? total[3] : total[2]
      box(.75, 9.65, .70, rect[1] + .07, 4.825, edge, materials.stone)
    } else {
      for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
        const z = center + (col - 2.5) * 1.1
        openings.push({ z0: z - .24, z1: z + .24, y0: 1.4 + row * 1.1, y1: 1.88 + row * 1.1 })
      }
    }
    eastWall(rect, bottom, 18.4, openings)
    box(.79, .70, rect[3] - rect[2], rect[1] + .06, 9.2, (rect[2] + rect[3]) / 2, materials.stone)
    box(.65, .18, rect[3] - rect[2], rect[1], 18.4, (rect[2] + rect[3]) / 2, brick)
    // 深色竖向交通缝的楼层横梁，不用常规白窗框。
    for (const y of [4.6, 9.2, 13.8]) box(.16, .22, 2.6, rect[1] - .15, y, seam0 + 1.3, materials.roofSeam)
    eastDetails.screenFronts++
  }
  // 墙体由窗间墙、窗下墙和过梁拼合：玻璃后退，保留真实的窗洞进深。
  function facade(rect: Rect, face: Face, height: number, bottom: number, cream: boolean, blank: boolean) {
    const [x0, x1, z0, z1] = rect
    const alongX = face === 'north' || face === 'south'
    const lo = alongX ? x0 : z0
    const hi = alongX ? x1 : z1
    const normal = face === 'north' || face === 'west' ? -1 : 1
    const fixed = face === 'north' ? z0 : face === 'south' ? z1 : face === 'west' ? x0 : x1
    const wall = cream ? materials.stone : brick
    const piece = (a: number, b: number, y0: number, y1: number, material = wall, depth = .55, offset = 0) => {
      const center = fixed + normal * offset
      if (alongX) box(b - a, y1 - y0, depth, (a + b) / 2, (y0 + y1) / 2, center, material)
      else box(depth, y1 - y0, b - a, center, (y0 + y1) / 2, (a + b) / 2, material)
    }
    if (blank) {
      piece(lo, hi, bottom, height)
      // 暗色凹孔和外伸砖侧壁组成方孔砖屏；避免重复大窗覆盖端墙。
      const cols = Math.min(7, Math.floor((hi - lo - 4) / 1.6))
      for (let row = 0; row < 4; row++) for (let col = 0; col < cols; col++) {
        const u = (lo + hi) / 2 + (col - (cols - 1) / 2) * 1.55
        const y = bottom + 1.3 + row * 1.23
        if (y + .55 > height) continue
        piece(u - .30, u + .30, y, y + .58, materials.frame, .05, .294)
        piece(u - .33, u + .33, y - .09, y, brick, .30, .34)
      }
    } else {
      const count = Math.max(1, Math.floor((hi - lo - 3.4) / (cream ? 4.1 : laboratory && height <= 4.6 ? 9 : 6.2)))
      const pitch = (hi - lo - 3.4) / count
      for (let level = Math.round(bottom / 4.6); level < Math.round(height / 4.6); level++) {
        const y0 = level * 4.6
        const y1 = Math.min(y0 + 4.6, height)
        const sill = y0 + (level === 0 ? .65 : .95)
        const head = y0 + 3.72
        piece(lo, hi, y0, sill)
        piece(lo, hi, head, y1)
        const grouped = !cream && hi - lo > 78
        const centers = grouped
          ? [.18, .255, .33, .405, .625, .70, .775, .85].map(t => lo + t * (hi - lo))
          : Array.from({ length: count }, (_, index) => lo + 1.7 + (index + .5) * pitch)
        const openings = centers.flatMap((u, index) => {
          const width = cream ? laboratory ? 2.55 : 1.9 : laboratory && height <= 4.6 ? 5.6 : 2.9
          const main = { a: u - width / 2, b: u + width / 2, index, narrow: false }
          return grouped ? [main, { a: main.b + .62, b: main.b + 1.27, index, narrow: true }] : [main]
        })
        let cursor = lo
        for (const { a, b, index, narrow } of openings) {
          const width = b - a
          piece(cursor, a, sill, head)
          piece(a, b, sill, head, materials.glass, .08, -.22)
          if (!narrow) piece(a + width * .49, a + width * .49 + .075, sill, head, materials.frame, .12, -.14)
          piece(a, b, sill + 1.1, sill + 1.18, materials.frame, .12, -.14)
          if (!cream && !narrow) {
            // 米色 L 形窗套交替转向；不是整面连续的白色网格。
            piece(a - .13, b + .13, head, head + .28, materials.stone, .66, .05)
            const edge = (index + level) % 2 === 0 ? a - .28 : b
            piece(edge, edge + .28, sill, head, materials.stone, .66, .05)
          }
          windows++
          cursor = b
        }
        piece(cursor, hi, sill, head)
        if (grouped) {
          // 长立面的窗组之间留出实墙交通核；两端以方孔砖屏收头。
          const panelCenter = level < 2 ? hi - 5.4 : lo + 5.4
          for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
            const u = panelCenter + (col - 1.5) * 1.05
            const y = y0 + 1.05 + row * .90
            piece(u - .23, u + .23, y, y + .42, materials.frame, .05, .30)
            piece(u - .25, u + .25, y - .075, y, brick, .22, .32)
          }
          const core = lo + (hi - lo) * .51
          piece(core - 1.3, core + 1.3, y0, y1, brick, 1.1, .48)
        }
      }
    }
    if (bottom < 9.2 && height > 9.2) piece(lo, hi, 8.9, 9.55, materials.stone, .70, .08)
    piece(lo, hi, height - .22, height + .24, cream ? materials.stone : brick, .68, .04)
  }
  function block(name: string, rect: Rect, height = 18.4, bottom = 0, creamFaces: Face[] = [], blankFaces: Face[] = [], creamRoof = false, omitEast = false, omitFaces: Face[] = []) {
    parts.push({ name, bounds: rect, bottom, height })
    for (const face of ['north', 'south', 'west', 'east'] as Face[]) {
      if ((omitEast && face === 'east') || omitFaces.includes(face)) continue
      facade(rect, face, height, bottom, creamFaces.includes(face), blankFaces.includes(face))
    }
    for (let y = bottom; y < height; y += 4.6) slab(rect, y, .18, materials.floor)
    slab(rect, height, .20, creamFaces.length || creamRoof ? materials.stone : materials.roof)
    if (!creamFaces.length && !creamRoof) {
      for (let x = rect[0] + 5; x < rect[1] - 1; x += 7) box(.075, .035, rect[3] - rect[2] - .8, x, height + .235, (rect[2] + rect[3]) / 2, materials.roofSeam)
    }
  }
  function piercedReturn(name: string, rect: Rect, start: number, end: number, screen?: 'lo' | 'hi') {
    const segments: { rect: Rect; bottom: number; name: string }[] = [
      { rect: [rect[0], rect[1], rect[2], start], bottom: 0, name: 'lower-end' },
      { rect: [rect[0], rect[1], end, rect[3]], bottom: 0, name: 'upper-end' },
      { rect: [rect[0], rect[1], start, end], bottom: 4.6, name: 'over-passage' },
    ]
    for (const segment of segments) {
      block(`${name}-${segment.name}`, segment.rect, 18.4, segment.bottom, [], [], false, !!screen)
      if (screen) screenEastFront(segment.rect, rect, segment.bottom, screen, false)
    }
    slab([rect[0] - 1, rect[1] + 1, start, end], .02, .12, materials.paving)
    passages++
  }
  function courtyard(name: string, rect: Rect) {
    parts.push({ name: laboratory ? name.replace('green-courtyard', 'paved-courtyard').replace('long-garden', 'paved-spine') : name, bounds: rect, bottom: .01, height: .1 })
    slab(rect, .025, .10, laboratory ? materials.paving : materials.lawn)
  }
  function eastForecourtGarden(rect: Rect, path: [number, number]) {
    const cuts = [rect[2], path[0], path[1], rect[3]]
    for (let n = 0; n < cuts.length - 1; n++) {
      const z0 = cuts[n], z1 = cuts[n + 1]
      if (n === 1) {
        slab([rect[0], rect[1], z0, z1], .025, .12, materials.floor)
        continue
      }
      slab([rect[0], rect[1], z0, z1], .025, .10, materials.lawn)
      for (const x of [rect[0] + .8, rect[1] - .8]) {
        box(1.35, .70, z1 - z0 - .7, x, .48, (z0 + z1) / 2, materials.leaf)
        box(.15, .18, z1 - z0, x + .84, .14, (z0 + z1) / 2, materials.stone)
      }
    }
  }
  function crown(rect: Rect, openRibbon = false) {
    // 顶部水平黑窗带与细砖肋环绕中部高体量，米色挑檐统一收口。
    slab([rect[0] - .5, rect[1] + .5, rect[2] - .5, rect[3] + .5], 13.85, .32, materials.stone)
    for (const z of [rect[2], rect[3]]) {
      const start = laboratory && !openRibbon ? rect[1] - 23 : rect[0]
      if (!openRibbon) box(rect[1] - start, 3.78, .25, (start + rect[1]) / 2, 16.07, z, materials.ribbon)
      box(rect[1] - start, 3.78, .25, (start + rect[1]) / 2, 20.19, z, materials.ribbon)
      box(rect[1] - start, .36, .75, (start + rect[1]) / 2, 18.12, z, materials.stone)
      for (let x = start + .65; x < rect[1]; x += 1.38) box(.44, 3.65, .75, x, 20.23, z, brick)
      if (laboratory && !openRibbon) box(start - rect[0], 3.78, .55, (rect[0] + start) / 2, 20.29, z, brick)
    }
    for (const x of [rect[0], rect[1]]) {
      const compact = laboratory && !openRibbon && x === rect[0]
      if (!openRibbon) box(.25, compact ? 1.38 : 3.78, rect[3] - rect[2], x, compact ? 19.09 : 16.07, (rect[2] + rect[3]) / 2, materials.ribbon)
      box(.25, compact ? 1.94 : 3.78, rect[3] - rect[2], x, compact ? 21.15 : 20.19, (rect[2] + rect[3]) / 2, materials.ribbon)
      box(.75, .36, rect[3] - rect[2], x, compact ? 20.02 : 18.12, (rect[2] + rect[3]) / 2, materials.stone)
      for (let z = rect[2] + .65; z < rect[3]; z += 1.38) box(.75, compact ? 1.80 : 3.65, .44, x, compact ? 21.21 : 20.23, z, brick)
    }
    slab([rect[0] - .7, rect[1] + .7, rect[2] - .7, rect[3] + .7], 22.18, .44, materials.stone)
  }
  function central(name: string, rect: Rect, annex: Rect, slotSide: number) {
    const courtFace: Face = slotSide > 0 ? 'south' : 'north'
    const bodyHeight = laboratory ? 18.4 : 13.8
    block(name, rect, bodyHeight, 0, ['west'], [], false, true, [courtFace])
    teachingEastFront(rect)
    // 转角的玻璃缝与大面积实墙，对应近景图中侧翼与主楼之间的交通连接。
    const sideZ = slotSide > 0 ? rect[3] : rect[2]
    const jointX = rect[1] - 28
    facade([rect[0], jointX, rect[2], rect[3]], courtFace, bodyHeight, 0, false, false)
    box(4.6, bodyHeight, .075, jointX + 2.3, bodyHeight / 2, sideZ - slotSide * .23, materials.ribbon)
    box(rect[1] - jointX - 4.6, bodyHeight, .65, (jointX + 4.6 + rect[1]) / 2, bodyHeight / 2, sideZ, brick)
    for (let n = 0; n < 5; n++) box(.70, .55, .075, rect[1] - 4 - n * 2.3, 12.45, sideZ + slotSide * .36, materials.stone)
    eastDetails.sideJunctions++
    crown(rect)
    if (!laboratory || name === 'C-main') slab([laboratory ? rect[0] + 22 : rect[0] + 8, rect[1] - 8, rect[2] + 11, rect[3] - 11], 22.65, .65, materials.roof)
    slab([rect[1] - 15, rect[1] - 8, rect[2] + 4, rect[2] + 11], 22.62, 3.15, brick)
    // 玻璃交通厅位于主楼和低层侧翼之间，强调纵向连接关系。
    const hallX = rect[0] - 2.5
    const hallZ = (rect[2] + rect[3]) / 2
    box(4.5, laboratory ? 22 : 17.7, 7, hallX, laboratory ? 11 : 8.85, hallZ, materials.glass)
    for (let y = 0; y < 18; y += 4.6) box(4.7, .18, 7.15, hallX, y, hallZ, materials.frame)
    for (let x = hallX - 2; x <= hallX + 2; x += 1) box(.085, 18, 7.1, x, 9, hallZ, materials.frame)
    block(`${name}-one-storey-annex`, annex, 4.6)
    const stairX = annex[1] - 1.4
    const stairEnd = slotSide > 0 ? annex[3] + 6.9 : annex[2] - 6.9
    for (let step = 0; step < 14; step++) {
      const h = (step + 1) * 4.6 / 14
      box(2.7, h, .5, stairX, h / 2, stairEnd - slotSide * step * .49, materials.floor)
    }
    if (laboratory) {
      for (let step = 0; step < 14; step++) {
        const h = (step + 1) * 4.6 / 14 + .75
        box(.22, h, .50, stairX + 1.44, h / 2, stairEnd - slotSide * step * .49, materials.stone)
      }
    } else box(.22, 4.8, 7, stairX + 1.44, 2.4, stairEnd - slotSide * 3.2, materials.stone)
    // 朝中央步行轴的双层玻璃门厅、深灰薄雨棚和三级入口台阶。
    const entranceZ = hallZ
    box(3.1, .28, 7.1, rect[1] + 1.55, 4.55, entranceZ, materials.floor)
    for (let n = 0; n < 3; n++) box(1.1, .16 * (3 - n), 10 + n * .65, rect[1] + 1.2 + n, .08 * (3 - n), entranceZ, materials.floor)
    box(.16, 3.1, .09, rect[1] + .45, 1.75, entranceZ, materials.frame)
    for (const z of [entranceZ - 1.4, entranceZ + 1.4]) box(.16, 3.1, .11, rect[1] + .45, 1.75, z, materials.frame)
    slab([62.5, 77.2, rect[2], rect[3]], .025, .11, materials.floor)
    for (const z of [rect[2] + 4, rect[3] - 4]) {
      slab([72.1, 74.6, z - 2.2, z + 2.2], .14, .20, materials.stone)
      box(2.1, .70, 4, 73.35, .65, z, materials.leaf)
      for (const fenceX of [71.4, 75.3]) {
        for (let fenceZ = z - 2.9; fenceZ <= z + 2.9; fenceZ += .46) box(.07, .9, .07, fenceX, .68, fenceZ, materials.roofSeam)
        box(.08, .075, 6.2, fenceX, 1.08, z, materials.roofSeam)
      }
    }
  }

  switch (building.id) {
    case WEST_PUBLIC_TEACHING_IDS[0]:
      block('A-outer-bar', [-64.55, 35.90, 88.68, 108.53], 18.4, 0, [], [], false, true)
      screenEastFront([-64.55, 35.90, 88.68, 108.53], [-64.55, 35.90, 88.68, 108.53], 0, 'lo', true)
      piercedReturn('A-west-return', [-64.5, -50.9, 55.52, 88.68], 64, 73)
      courtyard('A-green-courtyard', [-50.6, 23.7, 55.65, 88.35])
      eastForecourtGarden([36.7, 60.0, 55.4, 108.53], [63.6, 73.4])
      break
    case WEST_PUBLIC_TEACHING_IDS[1]:
      central('B-main', [-19.8, 61.85, 18.30, 55.4], [-51, -20.1, 44.3, 55.4], 1)
      block('B-west-teaching-arm', [-64.6, -19.8, 18.78, 32.8], 18.4, 0, [], ['west'], true)
      courtyard('B-courtyard-extension', [-50.6, -23, 33.1, 44.1])
      courtyard('B-C-long-garden', [-63, 44.2, -20.25, 18.0])
      break
    case WEST_PUBLIC_TEACHING_IDS[2]:
      central('C-main', [-19.8, 61.05, -56.35, -20.8], [-53.8, -20.1, -56.1, -45.1], -1)
      block('C-west-teaching-arm', [-62.5, -19.8, -32.55, -20.8], 18.4, 0, [], ['west'], true)
      courtyard('C-courtyard-extension', [-53.6, -23, -44.8, -32.8])
      break
    case WEST_PUBLIC_TEACHING_IDS[3]:
      block('D-outer-bar', [-68.1, 32.5, -112.4, -89.3], 18.4, 0, [], [], false, true)
      screenEastFront([-68.1, 32.5, -112.4, -89.3], [-68.1, 32.5, -112.4, -89.3], 0, 'hi', true)
      piercedReturn('D-west-return', [-68.1, -54.1, -89.3, -32.7], -66, -56)
      piercedReturn('D-east-return', [23.0, 32.5, -89.3, -56.35], -78, -69, 'lo')
      courtyard('D-green-courtyard', [-53.8, 22.7, -89.0, -56.5])
      eastForecourtGarden([33.3, 59.2, -112.4, -56.35], [-78.4, -68.6])
      break
    case WEST_PUBLIC_TEACHING_IDS[4]:
      piercedReturn('A-east-return', [24.03, 35.85, 55.4, 88.68], 64, 73, 'hi')
      break
    case WEST_PUBLIC_TEACHING_IDS[5]: {
      // 两条教学体量之间不是实心大楼；保留底层贯通和上下两道连廊。
      const bridge: Rect = [45.1, 61.5, -20.8, 18.3]
      parts.push({ name: 'B-C-open-ground-bridge', bounds: bridge, bottom: 8.2, height: 11.0 })
      const rearBridge: Rect = [45.1, 48.4, bridge[2], bridge[3]]
      slab(rearBridge, 8.2, .55, materials.stone)
      slab(rearBridge, 10.75, .40, materials.stone)
      for (const x of [rearBridge[0], rearBridge[1]]) for (let z = bridge[2] + .8; z < bridge[3]; z += 1.8) box(.48, 2.0, .42, x, 9.77, z, brick)
      slab(bridge, 17.96, .32, materials.stone)
      crown(bridge, true)
      eastDetails.openUpperBridge = true
      for (const z of [bridge[2] + 1, bridge[3] - 1]) box(16.4, 8.2, .9, 53.3, 4.1, z, materials.stone)
      slab(bridge, .02, .12, materials.paving)
      passages++
      break
    }
    default: throw new Error(`Not a west public teaching building: ${building.id}`)
  }
  // 每种材质一批，窗洞和砖肋不产生数千次绘制调用。
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false)
    geometries.forEach(part => part.dispose())
    if (!geometry) throw new Error(`Unable to merge ${group.name}`)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = material === brick ? 'shared-library-brown-brick' : 'teaching-detail-batch'
    group.add(mesh)
  }
  group.userData.layout = { sourceId: building.id, side: 'west', windows, passages, parts, sharedLibraryBrick: true, eastDetails, courtyardSurface: laboratory ? 'paved' : 'green' }
  return group
}
