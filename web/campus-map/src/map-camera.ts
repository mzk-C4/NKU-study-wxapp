import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const CAMERA_LIMITS = { minHeight: 3, minPolar: Math.PI * .06, maxPolar: Math.PI * .46, margin: 100 }
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }

/** Ground-plane pan + safety after EVERY control update, including damping. */
export function constrainMapCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, bounds: Bounds) {
  const next = new THREE.Vector3(
    THREE.MathUtils.clamp(controls.target.x, bounds.minX - CAMERA_LIMITS.margin, bounds.maxX + CAMERA_LIMITS.margin),
    0,
    THREE.MathUtils.clamp(controls.target.z, bounds.minZ - CAMERA_LIMITS.margin, bounds.maxZ + CAMERA_LIMITS.margin),
  )
  const delta = next.clone().sub(controls.target)
  camera.position.add(delta)
  controls.target.copy(next)
  const offset = camera.position.clone().sub(next)
  const distance = THREE.MathUtils.clamp(offset.length() || controls.minDistance, controls.minDistance, controls.maxDistance)
  const spherical = new THREE.Spherical().setFromVector3(offset)
  spherical.radius = distance
  spherical.phi = THREE.MathUtils.clamp(spherical.phi, CAMERA_LIMITS.minPolar, CAMERA_LIMITS.maxPolar)
  offset.setFromSpherical(spherical)
  offset.y = Math.max(CAMERA_LIMITS.minHeight, offset.y)
  camera.position.copy(next).add(offset)
  camera.lookAt(next)
}

export function configureMapControls(controls: OrbitControls) {
  controls.enableDamping = true
  controls.dampingFactor = .1
  controls.screenSpacePanning = false
  controls.minPolarAngle = CAMERA_LIMITS.minPolar
  controls.maxPolarAngle = CAMERA_LIMITS.maxPolar
  controls.touches.ONE = THREE.TOUCH.PAN
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
  // Retain the original desktop controls. Touch uses map-like pan, not orbit.
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN
  controls.panSpeed = 1
  controls.rotateSpeed = .65
  controls.zoomSpeed = .85
}
