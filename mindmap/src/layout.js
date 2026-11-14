// 텍스트 크기 측정 + 트리 자동 배치
import { PALETTE, fmtDue, todayStr } from './store.js';

export const HGAP = 52;
export const VGAP = 14;
const PAD = [
  { x: 22, y: 12 },
  { x: 14, y: 8 },
  { x: 11, y: 6 },
];
const STATUS_W = 24;

let ruler = null;
const cache = new Map();

/** 실제 DOM으로 줄바꿈까지 포함해 텍스트 크기를 잰다 (노드와 같은 CSS 클래스 사용) */
export function measure(text, cls) {
  const key = cls + '\n' + text;
  let v = cache.get(key);
  if (v) return v;
  if (!ruler) {
    ruler = document.createElement('div');
    document.body.appendChild(ruler);
  }
  ruler.className = 'ruler nt ' + cls;
  ruler.textContent = text.endsWith('\n') ? text + ' ' : text;
  const r = ruler.getBoundingClientRect();
  v = { w: Math.ceil(r.width) + 1, h: Math.ceil(r.height) };
  if (cache.size > 4000) cache.clear();
  cache.set(key, v);
  return v;
}

/** 노드별 박스 크기와 메타 표시(마감·메모·하위 진행률) 계산 */
export function buildSizes(root, editingId) {
  const sizes = new Map();
  const today = todayStr();
  const rec = (n, depth) => {
    let total = 0;
    let done = 0;
    for (const c of n.children) {
      const s = rec(c, depth + 1);
      total += s.total + (c.status ? 1 : 0);
      done += s.done + (c.status === 'done' ? 1 : 0);
    }
    const level = Math.min(depth, 2);
    const editing = n.id === editingId;
    const shown = n.text || (depth === 0 && !editing ? '제목 없음' : ' ');
    const m = measure(shown, 'd' + level);
    const parts = [];
    if (n.due) parts.push('◷ ' + fmtDue(n.due));
    if (n.note) parts.push('✎ 메모');
    if (total) parts.push(`✓ ${done}/${total}`);
    const meta = parts.join('  ·  ');
    const mm = meta ? measure(meta, 'meta') : null;
    const tw = Math.max(m.w, mm ? mm.w : 0, editing ? 56 : 18);
    const p = PAD[level];
    sizes.set(n.id, {
      w: tw + (n.status ? STATUS_W : 0) + p.x * 2 + 4,
      h: m.h + (mm ? mm.h + 2 : 0) + p.y * 2 + 4,
      tw,
      th: m.h,
      pad: p,
      level,
      meta,
      overdue: !!n.due && n.due < today && n.status !== 'done',
      progress: total ? done / total : null,
    });
    return { total, done };
  };
  rec(root, 0);
  return sizes;
}

/** 루트를 (0,0) 중심에 두고 좌우(또는 오른쪽)로 가지를 펼친다 */
export function computeLayout(root, mode, sizes) {
  const pos = new Map();
  const kids = (n) => (n.collapsed ? [] : n.children);
  const hCache = new Map();
  const subH = (n) => {
    let h = hCache.get(n.id);
    if (h !== undefined) return h;
    const ch = kids(n);
    h = sizes.get(n.id).h;
    if (ch.length) h = Math.max(h, ch.reduce((a, c) => a + subH(c), 0) + VGAP * (ch.length - 1));
    hCache.set(n.id, h);
    return h;
  };

  const place = (n, depth, side, edge, cy, color, parentId) => {
    const s = sizes.get(n.id);
    const c = n.color || color;
    const x = side > 0 ? edge : edge - s.w;
    pos.set(n.id, { x, y: cy - s.h / 2, w: s.w, h: s.h, side, depth, color: c, parentId, node: n });
    const ch = kids(n);
    if (!ch.length) return;
    const total = ch.reduce((a, k) => a + subH(k), 0) + VGAP * (ch.length - 1);
    const next = side > 0 ? x + s.w + HGAP : x - HGAP;
    let y = cy - total / 2;
    for (const k of ch) {
      const h = subH(k);
      place(k, depth + 1, side, next, y + h / 2, c, n.id);
      y += h + VGAP;
    }
  };

  const rs = sizes.get(root.id);
  pos.set(root.id, { x: -rs.w / 2, y: -rs.h / 2, w: rs.w, h: rs.h, side: 0, depth: 0, color: null, parentId: null, node: root });

  const all = root.children.map((c, i) => ({ c, color: c.color || PALETTE[i % PALETTE.length] }));
  const split = mode === 'right' ? all.length : Math.ceil(all.length / 2);
  const groups = [
    { side: 1, items: all.slice(0, split), edge: rs.w / 2 + HGAP },
    { side: -1, items: all.slice(split), edge: -rs.w / 2 - HGAP },
  ];
  for (const g of groups) {
    const total = g.items.reduce((a, it) => a + subH(it.c), 0) + VGAP * Math.max(0, g.items.length - 1);
    let y = -total / 2;
    for (const it of g.items) {
      const h = subH(it.c);
      place(it.c, 1, g.side, g.edge, y + h / 2, it.color, root.id);
      y += h + VGAP;
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  return { pos, bounds: { minX, minY, maxX, maxY } };
}

export function edgePath(parent, child) {
  const right = child.side > 0;
  const x1 = right ? parent.x + parent.w : parent.x;
  const y1 = parent.y + parent.h / 2;
  const x2 = right ? child.x : child.x + child.w;
  const y2 = child.y + child.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1}C${mx} ${y1},${mx} ${y2},${x2} ${y2}`;
}
