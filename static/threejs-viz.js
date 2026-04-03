import * as THREE from 'three';

// ── State machine ─────────────────────────────────────────────
let vizState = 'idle';
let stateTs = 0;

function setState(s) {
  vizState = s;
  stateTs = performance.now();
  if (s === 'done') {
    setTimeout(() => { vizState = 'idle'; }, 2000);
  }
}

// ── Theme helper (read every frame) ──────────────────────────
const isDark = () => document.documentElement.dataset.theme !== 'light';
const opacityScale = () => isDark() ? 1.0 : 0.25;

// ── Background particle field ─────────────────────────────────
const bgCanvas = document.getElementById('bg-canvas');
const bgRenderer = new THREE.WebGLRenderer({
  canvas: bgCanvas,
  alpha: true,
  antialias: false,
  powerPreference: 'low-power',
});
bgRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
bgRenderer.setSize(window.innerWidth, window.innerHeight);
bgRenderer.setClearColor(0x000000, 0);

const bgScene = new THREE.Scene();
const bgCamera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
bgCamera.position.set(0, 0, 50);

const PARTICLE_COUNT = 150;
const positions = new Float32Array(PARTICLE_COUNT * 3);
const colorData = new Float32Array(PARTICLE_COUNT * 3);
const velocities = [];

const neonGreen = new THREE.Color(0x00ff87);
const cyan = new THREE.Color(0x00d4ff);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  positions[i * 3]     = (Math.random() - 0.5) * 120;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 40;

  velocities.push({
    vx: (Math.random() - 0.5) * 0.008,
    vy: (Math.random() - 0.5) * 0.006,
    vz: (Math.random() - 0.5) * 0.004,
  });

  const col = new THREE.Color().lerpColors(neonGreen, cyan, Math.random());
  colorData[i * 3]     = col.r;
  colorData[i * 3 + 1] = col.g;
  colorData[i * 3 + 2] = col.b;
}

const bgGeometry = new THREE.BufferGeometry();
bgGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
bgGeometry.setAttribute('color',    new THREE.BufferAttribute(colorData, 3));

const bgMaterial = new THREE.PointsMaterial({
  size: 1.2,
  vertexColors: true,
  transparent: true,
  opacity: 0.2,
  sizeAttenuation: true,
  depthWrite: false,
});

bgScene.add(new THREE.Points(bgGeometry, bgMaterial));

function updateParticles() {
  const posAttr = bgGeometry.getAttribute('position');
  const scale = opacityScale();

  const audioEnergy = getAudioEnergy();
  let speedMult, targetOpacity;
  if (vizState === 'loading') {
    speedMult = 6.0;
    targetOpacity = 0.35 * scale;
  } else if (vizState === 'done') {
    const t = Math.min((performance.now() - stateTs) / 2000, 1);
    speedMult = 6.0 * (1 - t) + 1.0 * t;
    targetOpacity = (0.35 * (1 - t) + 0.2 * t) * scale;
  } else {
    // Audio energy (0..1) boosts speed and brightness when a preview is playing
    speedMult = 1.0 + audioEnergy * 7.0;
    targetOpacity = (0.2 + audioEnergy * 0.25) * scale;
  }

  bgMaterial.opacity += (targetOpacity - bgMaterial.opacity) * 0.05;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const v = velocities[i];
    posAttr.array[i * 3]     += v.vx * speedMult;
    posAttr.array[i * 3 + 1] += v.vy * speedMult;
    posAttr.array[i * 3 + 2] += v.vz * speedMult;

    if (posAttr.array[i * 3]     >  60) posAttr.array[i * 3]     = -60;
    if (posAttr.array[i * 3]     < -60) posAttr.array[i * 3]     =  60;
    if (posAttr.array[i * 3 + 1] >  40) posAttr.array[i * 3 + 1] = -40;
    if (posAttr.array[i * 3 + 1] < -40) posAttr.array[i * 3 + 1] =  40;
    if (posAttr.array[i * 3 + 2] >  20) posAttr.array[i * 3 + 2] = -20;
    if (posAttr.array[i * 3 + 2] < -20) posAttr.array[i * 3 + 2] =  20;
  }

  posAttr.needsUpdate = true;
}

// ── Animation loop ────────────────────────────────────────────
let lastTs = 0;

function animate(ts) {
  requestAnimationFrame(animate);
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (dt > 0.1) return;

  updateParticles();
  bgRenderer.render(bgScene, bgCamera);
}

requestAnimationFrame(animate);

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  bgCamera.aspect = window.innerWidth / window.innerHeight;
  bgCamera.updateProjectionMatrix();
  bgRenderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Audio analyser input ──────────────────────────────────────
let toneAnalyser = null;

function getAudioEnergy() {
  if (!toneAnalyser) return 0;
  try {
    const values = toneAnalyser.getValue();
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += Math.max(values[i], -100);
    return Math.max(0, (sum / values.length + 100) / 100);
  } catch { return 0; }
}

// ── Public API ────────────────────────────────────────────────
window.setVizState = setState;
window.setToneAnalyser = (a) => { toneAnalyser = a; };
