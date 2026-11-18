"use client";

// 핑계봇 배경: 밤 꽃 계곡 3D (Fernhollow 페이지의 장면을 가져와 배경 전용으로 줄인 것)
// - 화면 맨 뒤에 고정되고 클릭을 가로채지 않는다. 글씨는 위의 유리 패널이 읽히게 해 준다.
// - three.js는 브라우저에서만, 화면이 뜬 뒤에 불러온다. (서버·첫 화면 로딩을 늦추지 않는다)
// - WebGL을 못 쓰거나 오류가 나면 조용히 포기하고 기존 검은 배경 + 빛 번짐만 보인다.
// - "동작 줄이기" 설정이면 움직이지 않고 한 장면만 보여 준다. 탭이 숨겨지면 멈춘다.

import { useEffect, useRef } from "react";

const VERT = `
  uniform float uTime, uScale, uPush, uFog, uIntro, uAspect;
  uniform vec2 uMouse;
  attribute vec3 aColor;
  attribute vec2 aInfo;   // x: 크기, y: 위상(0~1)
  attribute float aKind;  // 0 꽃, 1 잎, 2 먼지
  varying vec3 vColor; varying float vKind; varying float vAlpha; varying float vGlow; varying float vPhase;
  void main() {
    float size = aInfo.x; float ph = aInfo.y;
    vec3 p = position;
    if (aKind < 1.5) {
      p.x += sin(uTime*0.7 + ph*40.0 + p.x*0.15) * 0.06;
      p.z += cos(uTime*0.6 + ph*31.0) * 0.06;
      p.y += sin(uTime*0.9 + ph*53.0) * 0.04;
    } else {
      p += vec3(sin(uTime*0.15+ph*20.0), cos(uTime*0.12+ph*13.0)*0.5, cos(uTime*0.17+ph*9.0)) * 2.0;
      p = cameraPosition + mod(p - cameraPosition + vec3(25.0), vec3(50.0)) - vec3(25.0);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(-mv.z, 0.001);
    float grow = 1.0;
    if (aKind < 0.5) grow = mix(0.2, 1.0, 1.0 - smoothstep(10.0, 38.0, dist));
    else if (aKind < 1.5) grow = 1.0 - smoothstep(60.0, 110.0, dist);
    float sz = size * grow;
    vec4 clip = projectionMatrix * mv;
    vec2 ndc = clip.xy / clip.w;
    vec2 diff = ndc - uMouse; diff.x *= uAspect;
    float len = length(diff);
    vec2 dir = len > 0.0001 ? diff / len : vec2(0.0);
    dir.x /= uAspect;
    clip.xy += dir * (uPush * exp(-len * 2.2)) * clip.w;
    gl_Position = clip;
    float near = 1.0 - smoothstep(0.0, 0.5, len);
    gl_PointSize = clamp(sz * uScale / dist * (1.0 + near * 0.6), 0.0, 240.0);
    float fog = exp(-pow(dist * uFog, 2.0));
    vAlpha = fog * smoothstep(0.8, 2.6, dist) * uIntro * step(0.0, clip.w);
    vGlow = 1.0 - smoothstep(0.0, 0.45, len);
    vColor = aColor; vKind = aKind; vPhase = ph;
  }`;

const FRAG = `
  varying vec3 vColor; varying float vKind; varying float vAlpha; varying float vGlow; varying float vPhase;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = length(uv);
    if (r > 1.0) discard;
    float a; vec3 col = vColor;
    if (vKind < 0.5) {
      float ang = atan(uv.y, uv.x) + vPhase * 6.2832;
      float petals = 0.58 + 0.42 * cos(ang * 5.0);
      float shape = 1.0 - smoothstep(petals - 0.25, petals, r * 1.15);
      float core = 1.0 - smoothstep(0.0, 0.3, r);
      a = shape * 0.8 + core * 0.9;
      col = mix(vColor, vec3(1.0, 0.95, 0.82), core * 0.85);
    } else if (vKind < 1.5) {
      a = (1.0 - smoothstep(0.1, 1.0, r)) * 0.42;
    } else {
      a = pow(1.0 - r, 2.0) * 0.9;
    }
    float glow = 1.0 + vGlow * 2.2;
    gl_FragColor = vec4(col * glow, clamp(a, 0.0, 1.0) * vAlpha);
  }`;

// 같은 결과가 나오도록 고정된 난수 (모양이 매번 같다)
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ground = (x: number, z: number) =>
  0.9 * Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.045) + 0.5 * Math.sin(x * 0.11 + z * 0.08);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function ValleyBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const small = Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 700;
        const maxDpr = 1.5; // 글씨 뒤 배경이라 선명함보다 가벼움이 우선이다

        const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
        renderer.setClearColor(0x03040a, 1);
        host.appendChild(renderer.domElement);
        renderer.domElement.style.cssText = "width:100%;height:100%;display:block";

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

        // 카메라가 따라 날아갈 닫힌 곡선 길
        const pts: InstanceType<typeof THREE.Vector3>[] = [];
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const R = 130 * (1 + 0.18 * Math.sin(3 * a + 0.5) + 0.12 * Math.cos(2 * a));
          const x = Math.cos(a) * R;
          const z = Math.sin(a) * R;
          pts.push(new THREE.Vector3(x, ground(x, z) + 2.4, z));
        }
        const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
        const length = curve.getLength();

        // ── 꽃·잎·먼지 점들 ──
        const rand = mulberry32(20240607);
        const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.7;
        const flowerPalette = [[1, 0.36, 0.6], [0.72, 0.42, 1], [0.3, 0.85, 1], [1, 0.8, 0.42], [0.5, 1, 0.8], [1, 0.95, 0.86]];
        const leafPalette = [[0.05, 0.36, 0.3], [0.1, 0.46, 0.26], [0.05, 0.26, 0.42], [0.12, 0.32, 0.2]];
        const N_FLOWER = small ? 8000 : 13000;
        const N_LEAF = small ? 5000 : 9000;
        const N_DUST = small ? 600 : 1000;
        const N = N_FLOWER + N_LEAF + N_DUST;
        const pos = new Float32Array(N * 3);
        const col = new Float32Array(N * 3);
        const info = new Float32Array(N * 2);
        const kind = new Float32Array(N);

        const side = new THREE.Vector3();
        for (let i = 0; i < N; i++) {
          info[i * 2 + 1] = rand();
          if (i >= N_FLOWER + N_LEAF) {
            kind[i] = 2;
            info[i * 2] = 0.12 + rand() * 0.22;
            pos[i * 3] = (rand() - 0.5) * 50;
            pos[i * 3 + 1] = (rand() - 0.5) * 20;
            pos[i * 3 + 2] = (rand() - 0.5) * 50;
            col.set([1, 0.9, 0.75], i * 3);
            continue;
          }
          const isFlower = i < N_FLOWER;
          const u = rand();
          const p = curve.getPointAt(u);
          const tg = curve.getTangentAt(u);
          side.set(-tg.z, 0, tg.x).normalize();
          const wide = !isFlower ? 12 : rand() < 0.45 ? 3.5 : 8;
          let lateral = rand() < 0.78 ? gauss() * wide : gauss() * 32;
          lateral += lateral < 0 ? -0.35 : 0.35;
          const along = (rand() - 0.5) * 3;
          const x = p.x + side.x * lateral + tg.x * along;
          const z = p.z + side.z * lateral + tg.z * along;
          const lift = isFlower ? 0.3 + rand() * 1.1 : 0.1 + rand() * 0.5;
          pos[i * 3] = x;
          pos[i * 3 + 1] = ground(x, z) + lift;
          pos[i * 3 + 2] = z;
          kind[i] = isFlower ? 0 : 1;
          info[i * 2] = isFlower ? 0.55 + rand() * 0.95 : 1.0 + rand() * 1.7;
          const palette = isFlower ? flowerPalette : leafPalette;
          col.set(palette[Math.floor(rand() * palette.length)], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
        geo.setAttribute("aInfo", new THREE.BufferAttribute(info, 2));
        geo.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
        const uniforms = {
          uTime: { value: 0 },
          uScale: { value: 150 },
          uPush: { value: 0.07 },
          uFog: { value: 0.012 },
          uIntro: { value: 0 },
          uAspect: { value: 1 },
          uMouse: { value: new THREE.Vector2(5, 5) },
        };
        const mat = new THREE.ShaderMaterial({
          uniforms,
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        });
        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        scene.add(points);

        // ── 크기 맞추기 ──
        let lookDown = 3.2;
        const resize = () => {
          const w = host.clientWidth || window.innerWidth;
          const h = host.clientHeight || window.innerHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
          renderer.setPixelRatio(dpr);
          renderer.setSize(w, h, false);
          const portrait = w < h;
          camera.fov = portrait ? 74 : 62;
          lookDown = portrait ? 4 : 3.2;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          uniforms.uAspect.value = w / h;
          uniforms.uScale.value = ((h * dpr) / 900) * 150;
        };
        resize();
        window.addEventListener("resize", resize);

        // ── 마우스(커서 근처 꽃이 밀려난다) ──
        const mouse = { x: 9, y: 9, sx: 9, sy: 9 };
        const onMove = (e: PointerEvent) => {
          if (e.pointerType === "touch") return;
          mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
          mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
        };
        const onLeave = () => {
          mouse.x = 9;
          mouse.y = 9;
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        document.addEventListener("pointerleave", onLeave);

        // ── 한 프레임 ──
        const INTRO_SEC = reduceMotion ? 0.01 : 3;
        const DRIFT = 4; // 초당 몇 미터 흐르는지
        let time = 0;
        let u = 0.02;
        let last = performance.now();
        const up = new THREE.Vector3(0, 1, 0);

        const frame = (dt: number) => {
          time += dt;
          const intro = 1 - Math.pow(1 - clamp(time / INTRO_SEC, 0, 1), 3);
          u = (((u + (DRIFT * dt) / length) % 1) + 1) % 1;
          const k = Math.min(1, dt * 6);
          mouse.sx += (mouse.x - mouse.sx) * k;
          mouse.sy += (mouse.y - mouse.sy) * k;

          const p = curve.getPointAt(u);
          const ahead = curve.getPointAt((u + 0.012) % 1);
          const tg = curve.getTangentAt(u);
          const right = new THREE.Vector3().crossVectors(tg, up).normalize();
          const mx = clamp(mouse.sx, -1, 1);
          const my = clamp(mouse.sy, -1, 1);
          camera.position.copy(p).addScaledVector(right, mx * 0.5);
          camera.position.y += (1 - intro) * 38;
          const target = ahead
            .clone()
            .addScaledVector(right, mx * 4)
            .add(new THREE.Vector3(0, my * 2.2 - lookDown - (1 - intro) * 20, 0));
          camera.lookAt(target);

          uniforms.uTime.value = time;
          uniforms.uIntro.value = intro;
          uniforms.uMouse.value.set(mouse.sx, mouse.sy);
          renderer.render(scene, camera);
        };

        // 첫 장면을 그리고 서서히 보이게 한다
        frame(0.02);
        requestAnimationFrame(() => {
          host.style.opacity = "1";
        });

        let raf = 0;
        const loop = (now: number) => {
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          frame(dt);
          raf = requestAnimationFrame(loop);
        };
        const start = () => {
          if (reduceMotion || raf || document.hidden) return;
          last = performance.now();
          raf = requestAnimationFrame(loop);
        };
        const stop = () => {
          cancelAnimationFrame(raf);
          raf = 0;
        };
        const onVisibility = () => (document.hidden ? stop() : start());
        document.addEventListener("visibilitychange", onVisibility);
        start();

        // 동작 줄이기: 도입이 끝난 모습 한 장만 보여 준다 (frame(0.02)로 이미 그림)
        if (reduceMotion) frame(0.02);

        cleanup = () => {
          stop();
          window.removeEventListener("resize", resize);
          window.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerleave", onLeave);
          document.removeEventListener("visibilitychange", onVisibility);
          geo.dispose();
          mat.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (error) {
        // WebGL을 쓸 수 없는 환경 등: 배경만 포기하고 화면은 그대로 쓰게 한다
        console.warn("[핑계봇] 3D 배경을 시작하지 못했습니다.", error);
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 opacity-0 transition-opacity duration-[1500ms]"
    />
  );
}
