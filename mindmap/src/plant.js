// 마인드맵 → 식물 도형. 밑동이 (0,0), 위쪽이 -y 인 좌표로 그린다.
import { CATEGORIES, PALETTE, categoryOf, resolved, stats, walk } from './store.js';

// 같은 프로젝트는 언제나 같은 모양이 되도록 id로 난수를 만든다
const rnd = (str, salt = 0) => {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
};
const short = (s, n = 14) => {
  const t = (s || '').trim().split('\n')[0] || '제목 없음';
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const size = (node) => {
  let c = 0;
  walk(node, () => c++);
  return c;
};
const rad = (deg) => (deg * Math.PI) / 180;

function finish(geo) {
  let minX = -20;
  let maxX = 20;
  let minY = -20;
  let maxY = 4;
  const grow = (x, y, r = 0) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  };
  geo.segs.forEach((s) => { grow(s.x1, s.y1, s.w); grow(s.x2, s.y2, s.w); });
  geo.blobs.forEach((b) => grow(b.x, b.y, Math.max(b.rx, b.ry)));
  geo.bounds = { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  return geo;
}

// ── 나무: 줄기 = 중심 주제, 가지 = 하위 가지, 잎 = 맨 끝 항목 ──
function treeGeo(map, { detail, fruit }) {
  const geo = { segs: [], blobs: [], labels: [] };
  const done = !!map.completedAt;
  const total = size(map.root);
  const k = detail ? 1.7 : 1;
  // 잎은 가지 끝에서 가지가 뻗은 방향으로 난다. 색으로 진행 상태를 나타낸다.
  const leaf = (x, y, ang, len, fill) =>
    geo.blobs.push({ leaf: true, x, y, rx: len, ry: len * 0.36, rot: -ang, fill });
  const tone = (n) => (done || (n.status === 'done' || n.doneBy) ? 'var(--leaf)' : n.status === 'doing' ? 'var(--leaf-2)' : 'var(--leaf-pale)');

  const rec = (n, x, y, ang, len, w, depth) => {
    const x2 = x + Math.cos(rad(ang)) * len;
    const y2 = y - Math.sin(rad(ang)) * len;
    geo.segs.push({ x1: x, y1: y, x2, y2, w });
    const kids = n.children;
    const L = Math.max(9, 16 - depth * 1.4) * (detail ? 1.3 : 1);

    if (!kids.length && depth > 0) {
      leaf(x2, y2, ang, L, tone(n));
      if (done) {
        // 완료한 프로젝트는 곁잎이 돋아 울창해진다
        leaf(x2, y2, ang + 42 + rnd(n.id, 1) * 14, L * 0.78, 'var(--leaf-2)');
        leaf(x2, y2, ang - 42 - rnd(n.id, 2) * 14, L * 0.78, 'var(--leaf-2)');
      }
      if (fruit && (n.status === 'done' || n.doneBy)) {
        geo.blobs.push({ x: x2 + 1.5, y: y2 + L * 0.34, rx: L * 0.24, ry: L * 0.24, fill: 'var(--fruit)', top: true });
      }
    } else if (done && depth > 0) {
      leaf(x2, y2, ang + (rnd(n.id, 3) > 0.5 ? 62 : -62), L * 0.6, 'var(--leaf-2)');
    }

    if (detail && depth > 0) {
      const c = Math.cos(rad(ang));
      const out = kids.length ? 3 : L + 2;
      geo.labels.push({
        x: x2 + (c > 0.25 ? out : c < -0.25 ? -out : 0),
        y: y2 + (Math.abs(c) <= 0.25 ? -out - 1 : 1.8) - (kids.length ? 0 : Math.sin(rad(ang)) * L * 0.5),
        anchor: c > 0.25 ? 'start' : c < -0.25 ? 'end' : 'middle',
        text: short(n.text),
        strong: depth === 1,
      });
    }

    const count = kids.length;
    const spread = depth === 0 ? Math.min(150, 36 + count * 28) : Math.min(105, 26 + count * 24);
    kids.forEach((c, i) => {
      const base = count === 1 ? (rnd(c.id, 3) - 0.5) * 36 : (i / (count - 1) - 0.5) * spread;
      const a = Math.max(12, Math.min(168, ang - base + (rnd(c.id, 4) - 0.5) * 14));
      rec(c, x2, y2, a, Math.max(11 * k, len * (0.7 + rnd(c.id, 5) * 0.12)), Math.max(1.1, w * 0.66), depth + 1);
    });
  };

  rec(map.root, 0, 0, 90, (30 + Math.min(26, total * 1.1)) * k, 4.5 + Math.min(6, total * 0.22), 0);
  if (total === 1) {
    // 가지가 없으면 새싹 두 잎
    const top = geo.segs[0].y2;
    leaf(0, top, 150, 11, 'var(--leaf-2)');
    leaf(0, top, 30, 11, 'var(--leaf-2)');
  }
  return finish(geo);
}

// ── 꽃: 가운데 = 중심 주제, 꽃잎 = 하위 가지 ──
function flowerGeo(map, { detail }) {
  const geo = { segs: [], blobs: [], labels: [] };
  const done = !!map.completedAt;
  const k = detail ? 1.8 : 1;
  const kids = map.root.children;
  const stem = (58 + Math.min(20, kids.length * 3)) * k;
  const lean = (rnd(map.id, 1) - 0.5) * 10;
  geo.segs.push({ x1: 0, y1: 0, x2: lean, y2: -stem, w: 3, stem: true });
  geo.blobs.push(
    { x: lean * 0.4 - 9 * k, y: -stem * 0.42, rx: 10 * k, ry: 4 * k, rot: 28, fill: 'var(--leaf)' },
    { x: lean * 0.6 + 9 * k, y: -stem * 0.6, rx: 10 * k, ry: 4 * k, rot: -28, fill: 'var(--leaf-2)' },
  );
  const cx = lean;
  const cy = -stem;
  const core = 9 * k;
  const count = Math.max(kids.length, 1);
  const petals = kids.length ? kids : [null, null, null, null, null];
  const n = petals.length;
  petals.forEach((c, i) => {
    const ang = -90 + (360 / n) * i + (kids.length ? 0 : 36);
    const weight = c ? size(c) : 1;
    const len = (15 + Math.min(13, weight * 2.2)) * k;
    const wid = Math.min(11 * k, Math.max(4.5 * k, (core + len) * Math.sin(Math.PI / Math.max(n, 3)) * 0.95));
    const d = core * 0.7 + len;
    const px = cx + Math.cos(rad(ang)) * d;
    const py = cy + Math.sin(rad(ang)) * d;
    const s = c ? stats(c) : { total: 0, done: 0 };
    const open = done || !c || !s.total || s.done === s.total;
    geo.blobs.push({
      x: px, y: py, rx: len, ry: wid, rot: ang,
      fill: c ? c.color || PALETTE[i % PALETTE.length] : 'var(--bud)',
      opacity: open ? 0.92 : 0.38,
    });
    if (c && detail) {
      // 손자 가지는 꽃잎 위의 점으로
      c.children.slice(0, 5).forEach((g, j, arr) => {
        const t = 0.35 + (j / Math.max(arr.length - 1, 1)) * 0.5 * (arr.length > 1 ? 1 : 0);
        geo.blobs.push({
          x: cx + Math.cos(rad(ang)) * (core + len * 2 * t), y: cy + Math.sin(rad(ang)) * (core + len * 2 * t),
          rx: 1.6, ry: 1.6, fill: 'var(--surface)', opacity: 0.9,
        });
      });
      const lx = cx + Math.cos(rad(ang)) * (core * 0.7 + len * 2 + 5);
      const ly = cy + Math.sin(rad(ang)) * (core * 0.7 + len * 2 + 5);
      const co = Math.cos(rad(ang));
      geo.labels.push({ x: lx, y: ly + 1.6, anchor: co > 0.3 ? 'start' : co < -0.3 ? 'end' : 'middle', text: short(c.text), strong: true });
    }
  });
  geo.blobs.push({ x: cx, y: cy, rx: core, ry: core, fill: 'var(--pollen)', top: true });
  void count;
  return finish(geo);
}

// ── 덤불: 덩이 = 하위 가지, 열매 = 끝난 일 ──
function bushGeo(map, { detail }) {
  const geo = { segs: [], blobs: [], labels: [] };
  const done = !!map.completedAt;
  const k = detail ? 1.9 : 1;
  const kids = map.root.children.length ? map.root.children : [null];
  const n = kids.length;
  const gap = Math.min(20, 96 / n) * k;
  kids.forEach((c, i) => {
    const mid = (n - 1) / 2;
    const off = i - mid;
    const weight = c ? size(c) : 1;
    const r = (11 + Math.min(9, weight * 1.4)) * k;
    const x = off * gap;
    const y = -r * 0.85 - (1 - Math.abs(off) / (mid + 1)) * 12 * k - (c ? rnd(c.id, 2) * 5 : 0);
    const s = c ? stats(c) : { total: 0, done: 0 };
    geo.segs.push({ x1: x * 0.3, y1: 0, x2: x, y2: y + r * 0.4, w: 2 });
    geo.blobs.push({ x, y, rx: r, ry: r * 0.9, fill: i % 2 ? 'var(--leaf-2)' : 'var(--leaf)', opacity: done || !s.total || s.done ? 1 : 0.55 });
    const berries = done ? Math.max(s.done, 1) : s.done;
    for (let j = 0; j < Math.min(berries, 5); j++) {
      const a = rnd(c ? c.id : map.id, 10 + j) * Math.PI * 2;
      const d = rnd(c ? c.id : map.id, 20 + j) * r * 0.6;
      geo.blobs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, rx: 2 * k * 0.8, ry: 2 * k * 0.8, fill: 'var(--fruit)', top: true });
    }
    if (c && detail) geo.labels.push({ x, y: y - r - 3, anchor: 'middle', text: short(c.text), strong: true });
  });
  return finish(geo);
}

export function plantGeo(map, detail = false) {
  // 완료한 가지 아래는 모두 완료로 보고 그린다
  map = { ...map, root: resolved(map.root) };
  const kind = CATEGORIES[categoryOf(map)].plant;
  if (kind === 'flower') return flowerGeo(map, { detail });
  if (kind === 'bush') return bushGeo(map, { detail });
  return treeGeo(map, { detail, fruit: kind === 'fruit' });
}

/** 정원에서의 크기(0.3~1): 시작하면 묘목으로 심기고, 진행한 만큼 자란다 */
export function growth(map) {
  if (map.completedAt) return 1;
  const s = stats(map.root);
  // 할 일이 있으면 끝낸 비율만큼, 없으면 가지를 채운 만큼 자란다
  const progress = s.total ? s.done / s.total : Math.min(0.6, (s.nodes - 1) * 0.04);
  return 0.3 + progress * 0.62;
}

export const progressOf = (map) => {
  if (map.completedAt) return 1;
  const s = stats(map.root);
  return s.total ? s.done / s.total : 0;
};
