import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Building, Point } from './data/jinnan-seed'

export function footprintShape(points: Point[]) {
  const shape = new THREE.Shape()
  points.forEach(([x, z], i) => i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z))
  shape.closePath()
  return shape
}
export function createWhiteBuildingGeometry(building: Building, baseDepth?: number): THREE.BufferGeometry {
  const volumes = building.volumes ?? [{ footprint: building.footprint, height: building.height }]
  const parts = volumes.map(volume => {
    const geometry = new THREE.ExtrudeGeometry(footprintShape(volume.footprint), { depth: baseDepth ?? volume.height, bevelEnabled: false })
    geometry.rotateX(-Math.PI / 2)
    return geometry
  })
  const geometry = mergeGeometries(parts, false)
  parts.forEach(part => part.dispose())
  if (!geometry) throw new Error(`Cannot build white model: ${building.id}`)
  geometry.computeVertexNormals()
  return geometry
}
