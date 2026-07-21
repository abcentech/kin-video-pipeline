import React, { useMemo, useRef } from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { noise3D } from "@remotion/noise";
import * as THREE from "three";

// Abstract, audio-reactive 3D centerpiece: a noise-displaced sphere whose surface
// swells with the bass, an iridescent fresnel rim that flares on the treble, and a
// slow-orbiting camera with organic drift. Colour palette drifts across the song so
// the 198s has visual progression without any explicit section detection.

// ---- palette stops (warm gold -> deep indigo -> bright dawn) -------------------
const PAL_A = ["#ffb347", "#3a2f7a", "#ffd5a6"].map((c) => new THREE.Color(c));
const PAL_B = ["#ff5e3a", "#7a3aff", "#ff9ecb"].map((c) => new THREE.Color(c));

const lerpStops = (stops: THREE.Color[], t: number) => {
  const n = stops.length - 1;
  const x = Math.max(0, Math.min(0.999, t)) * n;
  const i = Math.floor(x);
  return stops[i].clone().lerp(stops[i + 1], x - i);
};

// ---- GLSL ----------------------------------------------------------------------
const SNOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERT = `
uniform float uTime; uniform float uBass; uniform float uMid;
varying vec3 vNormal; varying float vDisp;
${SNOISE}
void main(){
  vec3 p = position;
  float n  = snoise(normalize(position)*1.4 + uTime*0.12);
  float n2 = snoise(normalize(position)*3.1 - uTime*0.18);
  float disp = (n*0.5 + n2*0.28) * (0.22 + uBass*1.35) + uMid*0.18;
  p += normal * disp;
  vDisp = disp;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
}`;

const FRAG = `
precision highp float;
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uTreble;
varying vec3 vNormal; varying float vDisp;
void main(){
  float fres = pow(1.0 - max(dot(vNormal, vec3(0.0,0.0,1.0)), 0.0), 2.4);
  vec3 col = mix(uColorA, uColorB, clamp(vDisp*1.6+0.5, 0.0, 1.0));
  col += fres * (0.55 + uTreble*1.8) * uColorB;
  col += fres * 0.25;
  gl_FragColor = vec4(col, 1.0);
}`;

type Bands = { bass: number; mid: number; treble: number; t: number };

const Blob: React.FC<Bands> = ({ bass, mid, treble, t }) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
    }),
    [],
  );

  // Update uniforms imperatively each frame (deterministic per Remotion frame).
  const u = uniforms;
  u.uTime.value = t;
  u.uBass.value = bass;
  u.uMid.value = mid;
  u.uTreble.value = treble;
  u.uColorA.value.copy(lerpStops(PAL_A, t / 200));
  u.uColorB.value.copy(lerpStops(PAL_B, t / 200));

  return (
    <mesh>
      <icosahedronGeometry args={[1.25, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
      />
    </mesh>
  );
};

const Particles: React.FC<{ treble: number; t: number }> = ({ treble, t }) => {
  const geom = useMemo(() => {
    const N = 1400;
    const arr = new Float32Array(N * 3);
    // deterministic golden-spiral shell so layout is identical every render
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const phi = i * 2.399963229728653;
      const rad = 2.4 + ((i * 13) % 7) * 0.12;
      arr[i * 3] = Math.cos(phi) * r * rad;
      arr[i * 3 + 1] = y * rad;
      arr[i * 3 + 2] = Math.sin(phi) * r * rad;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  return (
    <points geometry={geom} rotation={[0, t * 0.15, 0]}>
      <pointsMaterial
        size={0.018 + treble * 0.05}
        color={new THREE.Color("#ffe9c2")}
        transparent
        opacity={0.5 + treble * 0.5}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const Rig: React.FC<Bands> = (bands) => {
  const { t, bass } = bands;
  const camera = useThree((s) => s.camera);
  const dx = noise3D("camx", t * 0.05, 0, 0) * 0.5;
  const dy = noise3D("camy", 0, t * 0.045, 0) * 0.4;
  const ang = t * 0.08;
  const dist = 4.4 - bass * 0.5;
  camera.position.set(Math.sin(ang) * dist + dx, dy, Math.cos(ang) * dist);
  camera.lookAt(0, 0, 0);
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== 45) {
      pc.fov = 45;
      pc.updateProjectionMatrix();
    }
  }
  return (
    <>
      <Blob {...bands} />
      <Particles treble={bands.treble} t={t} />
    </>
  );
};

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export const MusicScene3D: React.FC<{
  audioSrc: string;
  width: number;
  height: number;
}> = ({ audioSrc, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(audioSrc));

  let bass = 0,
    mid = 0,
    treble = 0;
  if (audioData) {
    const spec = visualizeAudio({ audioData, frame, fps, numberOfSamples: 256 });
    bass = Math.min(1, avg(spec.slice(0, 8)) * 2.6);
    mid = Math.min(1, avg(spec.slice(8, 48)) * 4.0);
    treble = Math.min(1, avg(spec.slice(48, 128)) * 6.0);
  }
  const t = frame / fps;

  // gentle background tint that pulses with the bass
  const bg = interpolate(bass, [0, 1], [0.03, 0.1]);

  return (
    <AbsoluteFill style={{ backgroundColor: `rgb(${bg * 40},${bg * 30},${bg * 70})` }}>
      <ThreeCanvas
        width={width}
        height={height}
        gl={{ antialias: true }}
        style={{ width: "100%", height: "100%" }}
        camera={{ fov: 45, position: [0, 0, 4.4] }}
      >
        <Rig bass={bass} mid={mid} treble={treble} t={t} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
