import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'

export type MapQuality='clear'|'battery'
export function mapPixelRatio(width:number,height:number,deviceRatio:number,quality:MapQuality) {
  const cap=quality==='clear'?2:1.25
  const pixelBudget=quality==='clear'?3_000_000:1_500_000
  return Math.max(.5,Math.min(Math.max(deviceRatio,1),cap,Math.sqrt(pixelBudget/Math.max(width*height,1))))
}

/** Geometry MSAA + lightweight screen-edge AA. HTML controls are never blurred. */
export function createMapRendering(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera) {
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false})
  const composer=new EffectComposer(renderer,target)
  const scenePass=new RenderPass(scene,camera),output=new OutputPass(),fxaa=new ShaderPass(FXAAShader)
  composer.addPass(scenePass);composer.addPass(output);composer.addPass(fxaa)
  let quality:MapQuality='clear',width=1,height=1,direct=false,ratio=1,samples=0
  renderer.info.autoReset=false
  function resize(w:number,h:number){
    width=Math.max(1,w);height=Math.max(1,h)
    ratio=mapPixelRatio(width,height,window.devicePixelRatio||1,quality)
    renderer.setPixelRatio(ratio);renderer.setSize(width,height,false)
    samples=Math.min(quality==='clear'?4:2,renderer.capabilities.maxSamples)
    // RenderPass writes to readBuffer (target2). Output/FXAA need no depth or MSAA.
    if(composer.renderTarget2.samples!==samples){composer.renderTarget1.dispose();composer.renderTarget2.dispose()}
    composer.renderTarget1.samples=0;composer.renderTarget1.depthBuffer=false
    composer.renderTarget2.samples=samples
    composer.renderTarget1.resolveDepthBuffer=false;composer.renderTarget2.resolveDepthBuffer=false
    composer.setPixelRatio(ratio);composer.setSize(width,height)
    fxaa.uniforms.resolution.value.set(1/Math.max(1,Math.floor(width*ratio)),1/Math.max(1,Math.floor(height*ratio)))
  }
  return {
    resize,
    setQuality(value:MapQuality){quality=value;resize(width,height)},
    render(){
      renderer.info.reset()
      if(direct){renderer.render(scene,camera);return}
      try{composer.render()}catch(error){
        // Keep the working native antialiased renderer if a driver rejects postprocessing.
        console.warn('Postprocessing unavailable; keeping native antialiasing',error)
        direct=true;renderer.setRenderTarget(null);renderer.info.reset();renderer.render(scene,camera)
      }
    },
    info(){return {quality,pixelRatio:ratio,samples:direct?renderer.getContext().getParameter(renderer.getContext().SAMPLES):samples,fxaa:!direct,width:renderer.domElement.width,height:renderer.domElement.height,nativeAntialias:renderer.getContext().getContextAttributes()?.antialias??false}},
    dispose(){scenePass.dispose();output.dispose();fxaa.dispose();composer.dispose()},
  }
}
