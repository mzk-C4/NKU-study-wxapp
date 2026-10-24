import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

type TouchPoint = { x: number; y: number }
type PairMetrics = TouchPoint & { distance: number; angle: number }
export function pairMetrics(points: TouchPoint[]): PairMetrics {
  const [a,b] = points
  return { x:(a.x+b.x)/2, y:(a.y+b.y)/2, distance:Math.hypot(b.x-a.x,b.y-a.y), angle:Math.atan2(b.y-a.y,b.x-a.x) }
}
export function angleDelta(angle: number) { return Math.atan2(Math.sin(angle),Math.cos(angle)) }

/** Own touch input only; OrbitControls continues to own mouse/wheel/damping. */
export function installMapTouch(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera, controls: OrbitControls, onTap:(x:number,y:number)=>void, onChange:()=>void) {
  const points = new Map<number,TouchPoint>()
  const ground = new THREE.Plane(new THREE.Vector3(0,1,0),0)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  let baseline: PairMetrics|undefined, previous: PairMetrics|undefined
  let pairStart: TouchPoint[] = [], pairMode: 'pending'|'map'|'pitch' = 'pending'
  let tapStart: TouchPoint|undefined, moved=false, multi=false, disposed=false
  let oldDamping=controls.enableDamping, singlePrevious:TouchPoint|undefined
  let pairFrame=0

  function groundPoint(x:number,y:number) {
    const rect=canvas.getBoundingClientRect()
    ndc.set((x-rect.left)/Math.max(rect.width,1)*2-1,-(y-rect.top)/Math.max(rect.height,1)*2+1)
    camera.updateMatrixWorld();ray.setFromCamera(ndc,camera)
    return ray.ray.intersectPlane(ground,new THREE.Vector3())
  }
  function pan(from:TouchPoint,to:TouchPoint) {
    const a=groundPoint(from.x,from.y),b=groundPoint(to.x,to.y)
    if(!a||!b)return
    const delta=a.sub(b);delta.y=0
    // Near the horizon one screen pixel can span kilometres; cap a single event.
    delta.clampLength(0,Math.max(controls.getDistance(),20)*.3)
    controls.target.add(delta);camera.position.add(delta)
  }
  function sync() { controls.update();onChange() }
  function rebase() {
    const values=[...points.values()]
    if(values.length===2){pairStart=values.map(p=>({...p}));baseline=previous=pairMetrics(values);pairMode='pending'}
    else {baseline=previous=undefined;singlePrevious=values[0]}
  }
  function consume(event:PointerEvent) {event.preventDefault();event.stopImmediatePropagation()}
  function down(event:PointerEvent) {
    if(event.pointerType!=='touch'||!controls.enabled)return
    consume(event)
    if(!points.size){
      oldDamping=controls.enableDamping
      // Flush residual mouse inertia once, so it cannot fight a new touch gesture.
      controls.enableDamping=false;controls.update()
      tapStart={x:event.clientX,y:event.clientY};moved=false;multi=false
    }
    points.set(event.pointerId,{x:event.clientX,y:event.clientY})
    multi ||= points.size>1
    if(multi)moved=true
    canvas.setPointerCapture(event.pointerId);rebase()
  }
  function move(event:PointerEvent) {
    if(event.pointerType!=='touch'||!points.has(event.pointerId))return
    consume(event)
    const next={x:event.clientX,y:event.clientY}
    points.set(event.pointerId,next)
    if(tapStart&&Math.hypot(next.x-tapStart.x,next.y-tapStart.y)>7)moved=true
    if(points.size===1){if(singlePrevious)pan(singlePrevious,next);singlePrevious=next;sync();return}
    if(!pairFrame)pairFrame=requestAnimationFrame(()=>{pairFrame=0;applyPair()})
  }
  function applyPair() {
    if(points.size!==2||!baseline||!previous)return
    const values=[...points.values()],current=pairMetrics(values)
    if(pairMode==='pending'){
      const dx=current.x-baseline.x,dy=current.y-baseline.y
      const twist=Math.abs(angleDelta(current.angle-baseline.angle)),pinch=Math.abs(Math.log(Math.max(current.distance,1)/Math.max(baseline.distance,1)))
      const da=values[0].y-pairStart[0].y,db=values[1].y-pairStart[1].y
      const horizontalPair=Math.abs(pairStart[1].y-pairStart[0].y)<Math.abs(pairStart[1].x-pairStart[0].x)*.7
      if(horizontalPair&&Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)*1.8&&da*db>0&&Math.abs(da-db)<12&&twist<.10&&pinch<.08)pairMode='pitch'
      else if(twist>.055||pinch>.035||Math.hypot(dx,dy)>15)pairMode='map'
      else return
      // Apply the accumulated intent only after the gesture type is clear.
      previous=baseline
    }
    const offset=camera.position.clone().sub(controls.target)
    const spherical=new THREE.Spherical().setFromVector3(offset)
    if(pairMode==='pitch'){
      spherical.phi=THREE.MathUtils.clamp(spherical.phi+(current.y-previous.y)*.005,controls.minPolarAngle,controls.maxPolarAngle)
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical))
    }else{
      const anchor=groundPoint(previous.x,previous.y)
      // User-preferred bearing direction: reverse touch twist only, not pan/zoom/pitch.
      spherical.theta+=angleDelta(current.angle-previous.angle)
      spherical.radius=THREE.MathUtils.clamp(spherical.radius*Math.max(previous.distance,1)/Math.max(current.distance,1),controls.minDistance,controls.maxDistance)
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));camera.lookAt(controls.target);camera.updateMatrixWorld()
      const nextAnchor=groundPoint(current.x,current.y)
      if(anchor&&nextAnchor){const delta=anchor.sub(nextAnchor);delta.y=0;delta.clampLength(0,Math.max(spherical.radius,20)*.3);controls.target.add(delta);camera.position.add(delta)}
    }
    previous=current;sync()
  }
  function finish(event:PointerEvent) {
    if(event.pointerType!=='touch'||!points.has(event.pointerId))return
    consume(event)
    if(pairFrame){cancelAnimationFrame(pairFrame);pairFrame=0;applyPair()}
    if(tapStart&&Math.hypot(event.clientX-tapStart.x,event.clientY-tapStart.y)>7)moved=true
    points.delete(event.pointerId)
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId)
    if(points.size){multi=true;moved=true;rebase();return}
    const tap=event.type==='pointerup'&&!multi&&!moved
    controls.enableDamping=oldDamping;baseline=previous=undefined;singlePrevious=undefined
    if(tap)onTap(event.clientX,event.clientY)
  }
  function clear(){if(pairFrame)cancelAnimationFrame(pairFrame);pairFrame=0;points.clear();baseline=previous=undefined;singlePrevious=undefined;tapStart=undefined;moved=true;multi=true;controls.enableDamping=oldDamping}
  for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',finish],['pointercancel',finish],['lostpointercapture',finish]] as const)canvas.addEventListener(name,handler,{capture:true,passive:false})
  window.addEventListener('pagehide',clear)
  window.addEventListener('blur',clear)
  return {dispose(){if(disposed)return;disposed=true;clear();for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',finish],['pointercancel',finish],['lostpointercapture',finish]] as const)canvas.removeEventListener(name,handler,true);window.removeEventListener('pagehide',clear);window.removeEventListener('blur',clear)}}
}
