import { useEffect, useRef, useState } from "react";

/**
 * A light WebGL globe for the story page: NASA Blue Marble with one of our proven-trend maps on top.
 * Spins slowly, can be dragged, and turns a little as the page scrolls (via `spinRef`).
 * Falls back to the flat Blue Marble image when WebGL is unavailable.
 */

const VERT = `
attribute vec2 p;
varying vec2 v;
void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 v;
uniform sampler2D earth;
uniform sampler2D overlayA;
uniform sampler2D overlayB;
uniform float mixAB;
uniform float overlayAlpha;
uniform float rot;
uniform float tilt;
const float PI = 3.14159265;
void main() {
  float r2 = dot(v, v);
  if (r2 > 1.0) discard;
  float z = sqrt(1.0 - r2);
  vec3 n = vec3(v.x, v.y, z);
  // tilt around x, then spin around y
  float ct = cos(tilt), st = sin(tilt);
  vec3 q = vec3(n.x, ct * n.y - st * n.z, st * n.y + ct * n.z);
  float cr = cos(rot), sr = sin(rot);
  vec3 w = vec3(cr * q.x + sr * q.z, q.y, -sr * q.x + cr * q.z);
  float lat = asin(clamp(w.y, -1.0, 1.0));
  float lon = atan(w.x, w.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  vec3 base = texture2D(earth, uv).rgb;
  vec4 a = texture2D(overlayA, uv);
  vec4 b = texture2D(overlayB, uv);
  vec4 o = mix(a, b, mixAB);
  vec3 c = mix(base, o.rgb, o.a * overlayAlpha);
  float light = 0.62 + 0.38 * max(dot(n, normalize(vec3(-0.45, 0.5, 0.75))), 0.0);
  c *= light;
  // soft limb so the edge reads as a sphere on white paper
  float edge = smoothstep(1.0, 0.985, sqrt(r2));
  c = mix(vec3(0.86, 0.92, 0.97), c, 0.15 + 0.85 * smoothstep(0.0, 0.35, z));
  gl_FragColor = vec4(c, edge);
}`;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}

export interface EarthHandle {
  /** extra rotation in radians, driven by scroll */
  spin: number;
}

export function SpinningEarth({
  overlay,
  className = "",
  spinRef,
  label,
  startLon = 20,
}: {
  overlay: string | null;
  className?: string;
  spinRef?: React.MutableRefObject<EarthHandle>;
  label: string;
  startLon?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const api = useRef<{ setOverlay: (src: string | null) => void } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext("webgl", { premultipliedAlpha: false, alpha: true, antialias: true });
    if (!gl) {
      setFailed(true);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);
    } catch {
      setFailed(true);
      return;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const makeTex = (unit: number, img?: TexImageSource) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      return t;
    };
    const earthTex = makeTex(0);
    const texA = makeTex(1);
    const texB = makeTex(2);
    gl.uniform1i(u("earth"), 0);
    gl.uniform1i(u("overlayA"), 1);
    gl.uniform1i(u("overlayB"), 2);

    let ready = false;
    let mixAB = 0;
    let showingB = false;
    let fade = 0; // overlay fade-in on first load
    let overlayToken = 0;
    const upload = (tex: WebGLTexture, unit: number, img: TexImageSource) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };
    api.current = {
      setOverlay: (src) => {
        const token = ++overlayToken;
        if (!src) return;
        loadImage(src)
          .then((img) => {
            if (token !== overlayToken) return;
            // write into the hidden slot, then crossfade to it
            if (showingB) upload(texA, 1, img);
            else upload(texB, 2, img);
            showingB = !showingB;
          })
          .catch(() => {
            /* the globe stays useful without the overlay */
          });
      },
    };

    loadImage("/landing/blue-marble.jpg")
      .then((img) => {
        upload(earthTex, 0, img);
        ready = true;
      })
      .catch(() => setFailed(true));

    let rot = (startLon * Math.PI) / 180;
    let dragging = false;
    let lastX = 0;
    let velocity = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      velocity = (-dx / el.clientWidth) * Math.PI;
      rot += velocity;
    };
    const onUp = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(el.clientWidth * dpr);
      if (el.width !== w) {
        el.width = w;
        el.height = w;
      }
      gl.viewport(0, 0, el.width, el.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(el);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || !ready) return;
      if (!dragging) {
        velocity *= 0.92;
        rot += velocity + (reduce ? 0 : dt * 0.03); // slow, so Africa stays in view
      }
      const target = showingB ? 1 : 0;
      mixAB += (target - mixAB) * Math.min(1, dt * 5);
      fade = Math.min(1, fade + dt * 1.2);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u("rot"), rot + (spinRef?.current.spin ?? 0));
      gl.uniform1f(u("tilt"), -0.32);
      gl.uniform1f(u("mixAB"), mixAB);
      gl.uniform1f(u("overlayAlpha"), 0.62 * fade);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      api.current = null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [spinRef, startLon]);

  // Runs after the GL setup effect above, so the renderer exists.
  useEffect(() => {
    api.current?.setOverlay(overlay);
  }, [overlay]);

  if (failed) {
    return <img src="/landing/blue-marble.jpg" alt={label} className={`${className} rounded-full object-cover`} />;
  }
  return <canvas ref={canvas} role="img" aria-label={label} className={`${className} cursor-grab touch-pan-y active:cursor-grabbing`} />;
}
