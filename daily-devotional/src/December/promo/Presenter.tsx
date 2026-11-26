// The matted presenter, composited on the GPU from one stacked clip (colour 1920x1080 on top, the
// half-size RVM matte bottom-left — scripts/december/matte.mjs → tools/matte/rvm.mjs). Forked from
// src/JesusLife/hook/Presenter.tsx. Two passes share one decoded frame:
//   layer="bg"  his painted wall with HIM REMOVED (matte-weighted fill), a stop down — so the night,
//               the candle and the giant words can sit between the wall and him;
//   layer="fg"  the presenter alone: edge decontamination (the pale wall bleeds into his rim), a
//               light grade, candle rim light on the edges that face the candle, a wrap of night.
// WebGL guard: a lost context is re-created on `webglcontextrestored`; if WebGL is unavailable the
// fg pass falls back to the plain colour frame on a 2D canvas, so a frame is never black.
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { baseSize } from "./camera";
import type { View } from "../types";

export type Look = {
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
  /** candle rim: rgb + amount, and the direction the light comes FROM (source uv, y down) */
  rim: [number, number, number, number];
  rimDir: [number, number];
  /** night wrapped round his silhouette: rgb + amount */
  wrap: [number, number, number, number];
  /** wall pass: dim, saturation, teal pull, blur radius (source px) */
  bg: [number, number, number, number];
};

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec4 uView;      // source point at screen centre (uv, y down), visible size (uv)
uniform vec2 uPx;        // one source pixel in uv
uniform float uMode;     // 0 wall without him, 1 the presenter
uniform float uZoomBlur;
uniform vec4 uGrade;     // exposure, contrast, saturation, warmth
uniform vec4 uBg;        // dim, saturation, teal pull, blur radius
uniform vec4 uRim;       // rgb, amount
uniform vec2 uRimDir;
uniform vec4 uWrap;      // rgb, amount
uniform float uSharpen;
varying vec2 vUv;

vec2 toSrc(vec2 uv) { return uView.xy + (vec2(uv.x, 1.0 - uv.y) - 0.5) * uView.zw; }
vec2 inside(vec2 p) { return clamp(p, uPx * 0.5, 1.0 - uPx * 0.5); }
vec3 col(vec2 p) { p = inside(p); return texture2D(uTex, vec2(p.x, 1.0 - p.y * (1080.0 / 1620.0))).rgb; }
float mat(vec2 p) { p = clamp(p, uPx, 1.0 - uPx); return texture2D(uTex, vec2(p.x * 0.5, 1.0 - (1080.0 + p.y * 540.0) / 1620.0)).r; }

vec3 grade(vec3 c) {
  c *= uGrade.x;
  c = (c - 0.45) * uGrade.y + 0.45;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGrade.z);
  // candle: warm the highlights a touch, keep the shadows toward night teal
  c += vec3(0.04, 0.014, -0.035) * uGrade.w * smoothstep(0.2, 0.85, l);
  c += vec3(-0.012, 0.006, 0.010) * uGrade.w * (1.0 - smoothstep(0.0, 0.35, l));
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 p = toSrc(vUv);
  vec2 ctr = uView.xy;
  vec2 dir = (p - ctr) * uZoomBlur * 0.03;
  if (uMode < 0.5) {
    vec3 acc = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 28; i++) {
      float fi = float(i);
      float a = fi * 2.39996;
      float r = sqrt((fi + 0.5) / 28.0) * uBg.w;
      vec2 q = p + vec2(cos(a), sin(a)) * r * uPx - dir * (fi / 28.0);
      float w = 1.0 - mat(q) * 0.985;
      acc += col(q) * w;
      ws += w;
    }
    vec3 c = acc / max(ws, 0.001);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uBg.y);
    c = mix(c, c * vec3(0.45, 0.78, 0.82), uBg.z);
    c *= uBg.x;
    gl_FragColor = vec4(grade(c), 1.0);
    return;
  }
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  vec3 c = vec3(0.0);
  float m = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 q = p - dir * (float(i) / 5.0);
    c += col(q);
    m += mat(q);
  }
  c /= 5.0;
  m /= 5.0;
  // edge decontamination: rim pixels still hold the pale wall — take colour from just inside
  float er = 4.0;
  vec2 gIn = vec2(mat(p + vec2(uPx.x * er, 0.0)) - mat(p - vec2(uPx.x * er, 0.0)), mat(p + vec2(0.0, uPx.y * er)) - mat(p - vec2(0.0, uPx.y * er)));
  float rimZone = smoothstep(0.98, 0.45, m) * step(0.01, length(gIn));
  vec3 inner = col(p + normalize(gIn + 1e-5) * uPx * 6.0);
  c = mix(c, min(c, inner), rimZone);
  vec3 nb = col(p + vec2(uPx.x, 0.0)) + col(p - vec2(uPx.x, 0.0)) + col(p + vec2(0.0, uPx.y)) + col(p - vec2(0.0, uPx.y));
  c = clamp(c + uSharpen * (c * 4.0 - nb), 0.0, 1.0);
  c = grade(c);
  // candle rim on the edges that face the light
  float r = 3.0;
  vec2 g = vec2(mat(p + vec2(uPx.x * r, 0.0)) - mat(p - vec2(uPx.x * r, 0.0)), mat(p + vec2(0.0, uPx.y * r)) - mat(p - vec2(0.0, uPx.y * r)));
  float edge = clamp(length(g) * 1.6, 0.0, 1.0);
  float facing = clamp(dot(normalize(-g + 1e-5), normalize(uRimDir)) * 0.9 + 0.2, 0.0, 1.0);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += uRim.rgb * uRim.a * edge * facing * m * m * (0.6 + 0.4 * lum);
  // night wraps round the silhouette
  float mb = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    mb += mat(p + vec2(cos(a), sin(a)) * uPx * 16.0);
  }
  mb /= 8.0;
  c = mix(c, c * 0.55 + uWrap.rgb * 0.45, (1.0 - mb) * uWrap.a);
  float a = smoothstep(0.22, 0.96, m);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0) * a, a);
}`;

type GL = { gl: WebGLRenderingContext; tex: WebGLTexture; u: Record<string, WebGLUniformLocation | null> };

const init = (canvas: HTMLCanvasElement): GL | null => {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true, antialias: false });
  if (!gl || gl.isContextLost()) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const names = ["uTex", "uView", "uPx", "uMode", "uZoomBlur", "uGrade", "uBg", "uRim", "uRimDir", "uWrap", "uSharpen"];
  return { gl, tex, u: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) };
};

/** One decoded clip frame shared by every layer that draws the presenter. */
export type FrameSource = { img: CanvasImageSource | null; version: number; listeners: Set<() => void> };
export const useFrameSource = (): FrameSource => useRef<FrameSource>({ img: null, version: 0, listeners: new Set() }).current;

/** The single (hidden, muted) video element of a matted beat. */
export const MatteVideo: React.FC<{ src: string; clipFrom: number; source: FrameSource }> = ({ src, clipFrom, source }) => {
  const onFrame = useCallback(
    (img: CanvasImageSource) => {
      source.img = img;
      source.version++;
      source.listeners.forEach((l) => l());
    },
    [source],
  );
  return <OffthreadVideo src={staticFile(src)} trimBefore={clipFrom} muted onVideoFrame={onFrame} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />;
};

export const Presenter: React.FC<{ source: FrameSource; view: View & { blur: number }; layer: "bg" | "fg"; look: Look; w: number; h: number }> = ({ source, view, layer, look, w, h }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctx = useRef<GL | null>(null);
  const uploaded = useRef(-1);
  const frame = useCurrentFrame();

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c || !source.img) return;
    if (!ctx.current) {
      ctx.current = init(c);
      uploaded.current = -1;
    }
    const g = ctx.current;
    const [bw, bh] = baseSize(w / h);
    if (!g) {
      // no WebGL: plain colour frame (fg only), never a black hole in the picture
      if (layer === "bg") return;
      const c2 = c.getContext("2d");
      if (!c2) return;
      const vw = bw / view.s;
      const vh = bh / view.s;
      c2.drawImage(source.img, (view.x - vw / 2) * 1920, (view.y - vh / 2) * 1080, vw * 1920, vh * 1080, 0, 0, w, h);
      return;
    }
    const { gl, u } = g;
    if (gl.isContextLost()) return;
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, g.tex);
    if (uploaded.current !== source.version) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source.img as TexImageSource);
      uploaded.current = source.version;
    }
    gl.uniform1i(u.uTex, 0);
    gl.uniform4f(u.uView, view.x, view.y, bw / view.s, bh / view.s);
    gl.uniform2f(u.uPx, 1 / 1920, 1 / 1080);
    gl.uniform1f(u.uMode, layer === "bg" ? 0 : 1);
    gl.uniform1f(u.uZoomBlur, view.blur);
    gl.uniform4f(u.uGrade, look.exposure, look.contrast, look.saturation, look.warmth);
    gl.uniform4f(u.uBg, ...look.bg);
    gl.uniform4f(u.uRim, ...look.rim);
    gl.uniform2f(u.uRimDir, ...look.rimDir);
    gl.uniform4f(u.uWrap, ...look.wrap);
    const up = h / ((bh / view.s) * 1080);
    gl.uniform1f(u.uSharpen, Math.min(0.45, 0.08 + 0.2 * Math.max(0, up - 1)));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, [w, h, view.x, view.y, view.s, view.blur, layer, look, source]);

  // context-loss guard: drop the dead context, rebuild on restore and redraw
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const lost = (e: Event) => {
      e.preventDefault();
      ctx.current = null;
    };
    const restored = () => {
      ctx.current = null;
      draw();
    };
    c.addEventListener("webglcontextlost", lost);
    c.addEventListener("webglcontextrestored", restored);
    return () => {
      c.removeEventListener("webglcontextlost", lost);
      c.removeEventListener("webglcontextrestored", restored);
    };
  }, [draw]);

  // free the context when the beat unmounts (browsers cap live contexts at ~16)
  useEffect(
    () => () => {
      const g = ctx.current;
      if (g) g.gl.getExtension("WEBGL_lose_context")?.loseContext();
      ctx.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    source.listeners.add(draw);
    draw();
    return () => {
      source.listeners.delete(draw);
    };
  }, [draw, source, frame]);

  return <canvas ref={canvas} width={w} height={h} style={{ position: "absolute", left: 0, top: 0, width: w, height: h }} />;
};
