import * as T from './vendor/three.module.js';
// Quality presets. `ao` drives the shader (1 = 8-tap AO, .5 = 4-tap AO, 0 = none), `ratio` caps the
// renderer pixel ratio, `samples` is render-target MSAA. Only the mobile preset adapts resolution.
const PRESETS={high:{ao:1,ratio:2,samples:4,adaptive:false},balanced:{ao:.5,ratio:1.5,samples:2,adaptive:false},mobile:{ao:0,ratio:1.25,samples:2,adaptive:true}};
const MIN_RATIO=.85,WINDOW=120;
export function makePresentation(renderer,scene,camera){
const size=new T.Vector2(),target=new T.WebGLRenderTarget(1,1,{samples:4,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true});target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);target.depthTexture.format=T.DepthFormat;
const uniforms={colorTex:{value:target.texture},depthTex:{value:target.depthTexture},resolution:{value:new T.Vector2()},inverseProjection:{value:camera.projectionMatrixInverse},time:{value:0},exposure:{value:.94},quality:{value:1}};
const mat=new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:false,vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:`
varying vec2 vUv;
uniform sampler2D colorTex,depthTex;
uniform vec2 resolution;
uniform mat4 inverseProjection;
uniform float time,exposure,quality;
vec3 viewPosition(vec2 uv){float d=texture2D(depthTex,uv).r;vec4 p=inverseProjection*vec4(uv*2.0-1.0,d*2.0-1.0,1.0);return p.xyz/p.w;}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
void main(){
vec3 color=texture2D(colorTex,vUv).rgb;
if(quality>0.25){float depth=texture2D(depthTex,vUv).r;if(depth<0.99999){float taps=quality>0.75?8.0:4.0;vec3 center=viewPosition(vUv);vec3 normal=normalize(cross(dFdx(center),dFdy(center)));if(dot(normal,-center)<0.0)normal=-normal;float radius=clamp(110.0/max(-center.z,1.0),3.0,14.0);float occ=0.0;for(int i=0;i<8;i++){if(float(i)>=taps)break;float angle=float(i)*6.2831853/taps;vec2 offset=vec2(cos(angle),sin(angle))*radius/resolution;vec3 delta=viewPosition(clamp(vUv+offset,vec2(0.001),vec2(0.999)))-center;float d=length(delta);float hemisphere=max(0.0,dot(normal,delta/max(d,0.0001))-0.12);occ+=hemisphere*(1.0-smoothstep(0.12,1.2,d));}color*=1.0-clamp(occ*(8.0/taps)*0.085,0.0,0.22);}}
// Restrained highlight diffusion; retain crisp street and building detail.
vec3 glow=vec3(0.0);for(int i=0;i<4;i++){vec2 direction=i==0?vec2(2.0,0.0):i==1?vec2(-2.0,0.0):i==2?vec2(0.0,2.0):vec2(0.0,-2.0);vec3 s=texture2D(colorTex,vUv+direction/resolution).rgb;glow+=max(s-vec3(2.0),vec3(0.0));}color+=glow*0.015;
color=aces(color*exposure);float l=dot(color,vec3(0.2126,0.7152,0.0722));color=mix(vec3(l),color,0.96);color+=vec3(0.008,0.003,-0.005)*smoothstep(0.2,0.85,l);float vignette=1.0-0.12*smoothstep(0.23,0.75,length(vUv-0.5));color*=vignette;float grain=fract(sin(dot(vUv*resolution,vec2(12.9898,78.233))+floor(time*24.0))*43758.5453)-0.5;color+=grain*0.0015;gl_FragColor=vec4(srgb(clamp(color,0.0,1.0)),1.0);
}`});
const passScene=new T.Scene(),passCamera=new T.Camera();passScene.add(new T.Mesh(new T.PlaneGeometry(2,2),mat));
function resize(){renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);uniforms.resolution.value.copy(size);uniforms.inverseProjection.value=camera.projectionMatrixInverse}resize();addEventListener('resize',resize);
let preset=PRESETS.high,ratio=renderer.getPixelRatio(),lastTime=0,acc=0,frames=0,good=0,need=5;
const cap=()=>Math.min(devicePixelRatio||1,preset.ratio);
// Mobile only: step the pixel ratio from averaged frame time. Buffers are reallocated only when a step
// happens (at most once per window), and each downshift makes the next upshift slower to avoid flapping.
function adapt(time){const dt=time-lastTime;lastTime=time;if(!preset.adaptive)return;if(dt<=0||dt>.25){acc=frames=0;return}acc+=dt;if(++frames<WINDOW)return;const avg=acc/frames,top=cap(),floor=Math.min(top,MIN_RATIO);acc=frames=0;
 if(avg>1/42&&ratio>floor){ratio=Math.max(floor,ratio-.15);good=0;need=Math.min(need*2,40);renderer.setPixelRatio(ratio)}
 else if(avg<1/55&&ratio<top){if(++good>=need){ratio=Math.min(top,ratio+.1);good=0;renderer.setPixelRatio(ratio)}}
 else good=0}
return{render(time){adapt(time);renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y)resize();uniforms.time.value=time;uniforms.inverseProjection.value=camera.projectionMatrixInverse;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(passScene,passCamera)},
setQuality(mode){preset=PRESETS[mode]||PRESETS.high;uniforms.quality.value=preset.ao;acc=frames=good=0;need=5;ratio=cap();
 // Changing MSAA needs fresh GPU storage; dispose once here, three re-creates it on the next render.
 if(target.samples!==preset.samples){target.samples=preset.samples;target.dispose()}
 renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);resize()}};
}
