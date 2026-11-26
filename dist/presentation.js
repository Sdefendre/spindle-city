import * as T from './vendor/three.module.js';
// Unified Street View camera optics + Tesla Reality View HDR post-processing pass.
// - Desktop High/Balanced: HalfFloat HDR render target with 12-tap/6-tap jittered hemisphere
//   SSAO, subtle wide-angle lens barrel distortion + corner CA + micro-contrast sharpening,
//   Rayleigh daylight aerial haze, HDR bloom (FSD ribbons, AR chevrons, traffic LEDs, night
//   windows), and AgX-inspired neutral outdoor photographic tone mapping.
// - Mobile / iPhone Duo (`usePass: false`): direct framebuffer rendering so Apple's TBDR GPU
//   stays 100% inside tile memory at locked 60 FPS with crisp adaptive DPR.
const PRESETS={
 high:{ao:1,optics:1,ratio:2,samples:4,adaptive:false,usePass:true},
 balanced:{ao:.5,optics:.6,ratio:1.5,samples:2,adaptive:false,usePass:true},
 mobile:{ao:0,optics:0,ratio:2,samples:0,adaptive:true,usePass:false},
};
const MIN_RATIO=1.25,WINDOW=90;

export function makePresentation(renderer,scene,camera){
 const size=new T.Vector2();
 const isHalfFloatOk=renderer.capabilities.isWebGL2;
 const target=new T.WebGLRenderTarget(1,1,{
  samples:4,
  minFilter:T.LinearFilter,
  magFilter:T.LinearFilter,
  type:isHalfFloatOk?T.HalfFloatType:T.UnsignedByteType,
  depthBuffer:true,
 });
 target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
 target.depthTexture.format=T.DepthFormat;

 const uniforms={
  colorTex:{value:target.texture},
  depthTex:{value:target.depthTexture},
  resolution:{value:new T.Vector2()},
  inverseProjection:{value:camera.projectionMatrixInverse},
  fogColor:{value:new T.Color('#c9d8e7')},
  time:{value:0},
  exposure:{value:1.06},
  quality:{value:1},
  optics:{value:1},
 };

 const mat=new T.ShaderMaterial({
  uniforms,depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
  fragmentShader:`
varying vec2 vUv;
uniform sampler2D colorTex,depthTex;
uniform vec2 resolution;
uniform mat4 inverseProjection;
uniform vec3 fogColor;
uniform float time,exposure,quality,optics;

vec3 viewPosition(vec2 uv){
 float d=texture2D(depthTex,uv).r;
 vec4 p=inverseProjection*vec4(uv*2.0-1.0,d*2.0-1.0,1.0);
 return p.xyz/p.w;
}
float hash12(vec2 p){
 vec3 p3=fract(vec3(p.xyx)*0.1031);
 p3+=dot(p3,p3.yzx+33.33);
 return fract((p3.x+p3.y)*p3.z);
}
// AgX-inspired neutral photographic curve: preserves crisp midtones while rolling
// bright daylight concrete, white paint and sky softly toward white like a CMOS sensor.
vec3 agxCurve(vec3 x){
 x=max(x,vec3(0.0));
 mat3 inset=mat3(
  0.84247906,0.04232824,0.04237565,
  0.07843360,0.87846864,0.07843360,
  0.07922375,0.07916613,0.87914297
 );
 mat3 outset=mat3(
  1.19687900,-0.05289685,-0.05297163,
  -0.09802088,1.15190313,-0.09804345,
  -0.09902974,-0.09896118,1.15107367
 );
 vec3 v=inset*x;
 v=v/(v+vec3(0.48+0.14*v));
 vec3 mapped=outset*v;
 mapped=clamp(mapped,0.0,1.0);
 mapped=pow(mapped,vec3(1.10));
 float hi=smoothstep(0.78,1.70,max(x.r,max(x.g,x.b)));
 float luma=dot(mapped,vec3(0.2126,0.7152,0.0722));
 return clamp(mix(mapped,vec3(luma),hi*0.20),0.0,1.0);
}
vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}

void main(){
 // Subtle wide-angle street-camera lens barrel distortion.
 vec2 centered=vUv-0.5;
 float r2=dot(centered,centered);
 vec2 uv=0.5+centered*(1.0+optics*0.018*r2)/(1.0+optics*0.009);
 uv=clamp(uv,vec2(0.0005),vec2(0.9995));

 // Subtle outer-corner chromatic aberration (real wide-angle lens glass).
 vec2 ca=centered*(0.0014*optics*r2);
 vec3 color;
 if(optics>0.2){
  color.r=texture2D(colorTex,clamp(uv+ca,vec2(0.001),vec2(0.999))).r;
  color.g=texture2D(colorTex,uv).g;
  color.b=texture2D(colorTex,clamp(uv-ca,vec2(0.001),vec2(0.999))).b;
 }else{
  color=texture2D(colorTex,uv).rgb;
 }

 float depth=texture2D(depthTex,uv).r;
 if(depth<0.99998){
  vec3 center=viewPosition(uv);
  float dist=length(center);
  if(quality>0.25){
   float taps=quality>0.75?12.0:6.0;
   vec3 normal=normalize(cross(dFdx(center),dFdy(center)));
   if(dot(normal,-center)<0.0)normal=-normal;
   float radius=clamp(130.0/max(-center.z,1.2),3.5,17.0);
   float jitter=hash12(gl_FragCoord.xy)*6.2831853;
   float occ=0.0;
   for(int i=0;i<12;i++){
    if(float(i)>=taps)break;
    float angle=jitter+float(i)*6.2831853/taps;
    float ring=0.45+0.55*fract(float(i)*0.618034);
    vec2 offset=vec2(cos(angle),sin(angle))*(radius*ring)/resolution;
    vec3 delta=viewPosition(clamp(uv+offset,vec2(0.001),vec2(0.999)))-center;
    float d=length(delta);
    float hemisphere=max(0.0,dot(normal,delta/max(d,0.0001))-0.10);
    occ+=hemisphere*(1.0-smoothstep(0.14,1.65,d));
   }
   float ao=1.0-clamp(occ*(12.0/taps)*0.14,0.0,0.40);
   color*=mix(vec3(0.79,0.85,0.92),vec3(1.0),ao);
  }
  // Outdoor Rayleigh aerial perspective: foreground razor-crisp, distant hills & blocks soft.
  float aerial=1.0-exp(-max(dist-72.0,0.0)*0.00095);
  color=mix(color,fogColor*1.02,clamp(aerial*0.46,0.0,0.50));
 }

 // Crisp street-camera unsharp micro-contrast + HDR highlight bloom (FSD ribbon, LEDs, night windows).
 vec2 px=1.0/resolution;
 if(optics>0.2){
  vec3 cN=texture2D(colorTex,uv+vec2(0.0,px.y)).rgb;
  vec3 cS=texture2D(colorTex,uv-vec2(0.0,px.y)).rgb;
  vec3 cE=texture2D(colorTex,uv+vec2(px.x,0.0)).rgb;
  vec3 cW=texture2D(colorTex,uv-vec2(px.x,0.0)).rgb;
  vec3 blur=(cN+cS+cE+cW)*0.25;
  color+=clamp(color-blur,vec3(-0.08),vec3(0.08))*(0.28*optics);
 }
 vec3 glow=vec3(0.0);
 for(int i=0;i<8;i++){
  float a=float(i)*0.785398;
  vec2 dir=vec2(cos(a),sin(a))*3.5;
  vec3 s=texture2D(colorTex,clamp(uv+dir/resolution,vec2(0.001),vec2(0.999))).rgb;
  glow+=max(s-vec3(1.05),vec3(0.0));
 }
 color+=glow*0.030;

 color=agxCurve(color*exposure);
 float l=dot(color,vec3(0.2126,0.7152,0.0722));
 color=mix(vec3(l),color,0.96);
 color*=mix(vec3(0.97,0.99,1.03),vec3(1.0),smoothstep(0.04,0.38,l));
 float vignette=1.0-0.10*smoothstep(0.30,0.80,length(centered));
 color*=vignette;
 float grain=(hash12(gl_FragCoord.xy+vec2(floor(time*24.0)*17.3,floor(time*24.0)*9.1))-0.5);
 color+=grain*(0.0068*(0.5+0.5*(1.0-l)));
 gl_FragColor=vec4(srgb(clamp(color,0.0,1.0)),1.0);
}`,
 });

 const passScene=new T.Scene(),passCamera=new T.Camera();
 passScene.add(new T.Mesh(new T.PlaneGeometry(2,2),mat));

 function resize(){
  renderer.getDrawingBufferSize(size);
  if(preset.usePass){
   target.setSize(size.x,size.y);
   uniforms.resolution.value.copy(size);
   uniforms.inverseProjection.value=camera.projectionMatrixInverse;
  }
 }

 let preset=PRESETS.high,ratio=renderer.getPixelRatio(),lastTime=0,acc=0,frames=0,good=0,need=4;
 const cap=()=>Math.min(devicePixelRatio||1,preset.ratio);
 resize();addEventListener('resize',resize);

 // Adaptive DPR for mobile targets locked 60 FPS (steps down if <54 FPS, climbs back at >=58 FPS)
 function adapt(time){
  const dt=time-lastTime;lastTime=time;
  if(!preset.adaptive)return;
  if(dt<=0||dt>.25){acc=frames=0;return}
  acc+=dt;
  if(++frames<WINDOW)return;
  const avg=acc/frames,top=cap(),floor=Math.min(top,MIN_RATIO);acc=frames=0;
  if(avg>1/54&&ratio>floor){ratio=Math.max(floor,ratio-.15);good=0;need=Math.min(need*2,20);renderer.setPixelRatio(ratio)}
  else if(avg<1/58&&ratio<top){if(++good>=need){ratio=Math.min(top,ratio+.1);good=0;renderer.setPixelRatio(ratio)}}
  else good=0;
 }

 return{
  render(time){
   adapt(time);
   if(!preset.usePass){
    renderer.setRenderTarget(null);
    renderer.render(scene,camera);
    return;
   }
   renderer.getDrawingBufferSize(size);
   if(target.width!==size.x||target.height!==size.y)resize();
   uniforms.time.value=time;
   uniforms.inverseProjection.value=camera.projectionMatrixInverse;
   if(scene.fog?.color)uniforms.fogColor.value.copy(scene.fog.color);
   renderer.setRenderTarget(target);
   renderer.render(scene,camera);
   renderer.setRenderTarget(null);
   renderer.render(passScene,passCamera);
  },
  setQuality(mode){
   preset=PRESETS[mode]||PRESETS.high;
   uniforms.quality.value=preset.ao;
   uniforms.optics.value=preset.optics;
   acc=frames=good=0;need=4;ratio=cap();
   if(preset.usePass&&target.samples!==preset.samples){
    target.samples=preset.samples;target.dispose();
   }
   renderer.setPixelRatio(ratio);
   renderer.setSize(innerWidth,innerHeight);
   resize();
  },
 };
}
