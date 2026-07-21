import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";

// Real 2.5D: a high-segment plane is displaced by the depth map, and a perspective
// camera flies across it — foreground separates from background (genuine parallax),
// not a flat zoom. If no depth map is provided it falls back to a plain Img Ken-Burns
// so the pipeline never breaks.

export type Motion3D = "push-in" | "pull-back" | "dolly-left" | "dolly-right" | "crane-up" | "orbit";

const Scene: React.FC<{ src: string; depth: string; motion: Motion3D; intensity: number }> = ({ src, depth, motion, intensity }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [colorTex, depthTex] = useLoader(THREE.TextureLoader, [staticFile(src), staticFile(depth)]);
  colorTex.colorSpace = THREE.SRGBColorSpace;

  const p = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease),
  });

  // base camera at z=2.2 looking at plane; move it for the chosen motion
  const k = intensity;
  let x = 0, y = 0, z = 2.2, rotY = 0;
  switch (motion) {
    case "push-in":   z = interpolate(p, [0, 1], [2.35, 1.85 - 0.15 * k]); break;
    case "pull-back": z = interpolate(p, [0, 1], [1.85, 2.35 + 0.15 * k]); break;
    case "dolly-left":  x = interpolate(p, [0, 1], [0.28 * k, -0.28 * k]); z = 2.05; break;
    case "dolly-right": x = interpolate(p, [0, 1], [-0.28 * k, 0.28 * k]); z = 2.05; break;
    case "crane-up":  y = interpolate(p, [0, 1], [-0.22 * k, 0.22 * k]); z = 2.05; break;
    case "orbit":     x = Math.sin(p * Math.PI) * 0.3 * k; rotY = Math.sin(p * Math.PI) * 0.05 * k; z = 2.0; break;
  }

  // Drive the canvas's default camera imperatively each frame (deterministic per Remotion frame).
  const camera = useThree((s) => s.camera);
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== 42) { pc.fov = 42; pc.updateProjectionMatrix(); }
  }

  return (
    <>
      <ambientLight intensity={1.4} />
      <mesh rotation={[0, rotY, 0]}>
        {/* plane sized to fill a ~2.2-distance frame in both 16:9 and 9:16; segments = displacement resolution */}
        <planeGeometry args={[3.2, 1.8, 220, 124]} />
        <meshStandardMaterial
          map={colorTex}
          displacementMap={depthTex}
          displacementScale={0.55 * k}
          displacementBias={-0.18 * k}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </>
  );
};

/* SlideKenBurns — the SAFE path for text-rich DESIGNED slides. The full slide is
   shown with objectFit:"contain" (nothing cropped, nothing warped — every baked
   word stays straight and on-screen) over a blurred, darkened cover-copy of the
   same slide that fills the letterbox so it reads as a deliberate, premium cutaway.
   A very subtle scale + drift gives gentle life without distortion. Use this instead
   of the displacement-mesh Depth3D for slides whose text must not bend or clip. */
export const SlideKenBurns: React.FC<{
  src: string;
  motion?: Motion3D;
  width: number;
  height: number;
}> = ({ src, motion = "push-in" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) });
  // gentle, non-cropping move: at most 3% scale + a few px drift (contain keeps all text visible)
  const scale = motion === "pull-back" ? interpolate(p, [0, 1], [1.03, 1.0]) : interpolate(p, [0, 1], [1.0, 1.03]);
  const dx = motion === "dolly-left" ? interpolate(p, [0, 1], [10, -10]) : motion === "dolly-right" ? interpolate(p, [0, 1], [-10, 10]) : 0;
  const dy = motion === "crane-up" ? interpolate(p, [0, 1], [8, -8]) : 0;
  const file = staticFile(src);
  return (
    <AbsoluteFill style={{ backgroundColor: "#080b12" }}>
      {/* blurred, darkened fill so the letterbox reads as intentional */}
      <Img src={file} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.12)", filter: "blur(28px) brightness(0.45) saturate(1.05)" }} />
      <AbsoluteFill style={{ background: "rgba(6,9,16,0.28)" }} />
      {/* the WHOLE slide — contain, never cropped, never warped */}
      <Img src={file} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "contain", transform: `scale(${scale}) translate(${dx}px, ${dy}px)` }} />
    </AbsoluteFill>
  );
};

export const Depth3D: React.FC<{
  src: string;
  depth?: string | null;
  motion?: Motion3D;
  intensity?: number;
  width: number;
  height: number;
}> = ({ src, depth, motion = "push-in", intensity = 1, width, height }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fallback: no depth map → flat Ken-Burns so nothing breaks.
  if (!depth) {
    const p = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) });
    const zoom = motion === "pull-back" ? interpolate(p, [0, 1], [1.16, 1.04]) : interpolate(p, [0, 1], [1.04, 1.16]);
    const panX = interpolate(p, [0, 1], [motion === "dolly-right" ? -18 : 18, 0]);
    return (
      <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#0a0e18" }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom}) translateX(${panX}px)` }} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0e18" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }} style={{ width: "100%", height: "100%" }}>
        <React.Suspense fallback={null}>
          <Scene src={src} depth={depth} motion={motion} intensity={intensity} />
        </React.Suspense>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
