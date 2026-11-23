import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Undo2, Redo2, ListTodo, MoreVertical, Plus, Trash2, Pencil, Circle, CircleDot,
  CheckCircle2, ZoomIn, ZoomOut, Maximize, CornerDownRight, SlidersHorizontal, Copy, CalendarPlus, Sprout, ArrowUpRight, Scissors,
} from 'lucide-react';
import { STATUSES, STATUS_LABEL, find, makeNode, resolved, stats, uid, walk } from './store.js';
import { buildSizes, computeLayout, edgePath } from './layout.js';
import { DetailSheet, TasksSheet, Menu } from './Panels.jsx';
import { CopySheet, CalendarSheet } from './SharePanels.jsx';
import { countNodes } from './share.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MIN_K = 0.06;
const MAX_K = 2.5;

export const StatusIcon = ({ status, size = 18 }) =>
  status === 'done' ? <CheckCircle2 size={size} /> : status === 'doing' ? <CircleDot size={size} /> : <Circle size={size} />;

// 작업공간 전체를 하나의 나무처럼 다루기 위한 보이지 않는 뿌리. 그 아래 가지 하나하나가 마인드맵의 중심 주제다.
const FOREST = '__forest';
const VIEW_KEY = 'project-mindmap.view';
const sameJson = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
// 축소 단계: 0 = 전부, 1 = 제목과 큰 가지만, 2 = 제목만
const lodOf = (k) => (k < 0.3 ? 2 : k < 0.55 ? 1 : 0);

/**
 * 작업공간: 하나의 넓은 캔버스에 여러 마인드맵이 각자 심은 자리에 놓인다.
 * maps: [{ id, layout, createdAt, updatedAt, root }] · 각 root.pos 가 캔버스 위 자리.
 */
export default function Editor({ maps, onChange, menuItems = [] }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [anim, setAnim] = useState(false);
  const [sheet, setSheet] = useState(null); // 'detail' | 'tasks' | 'send' | 'calendar'
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState(null);
  const [delAsk, setDelAsk] = useState(null);
  const [moving, setMoving] = useState(null); // 끌어서 옮기는 중인 마인드맵 { id, dx, dy }
  const [, bump] = useState(0);

  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const mapsRef = useRef(maps);
  mapsRef.current = maps;
  const root = useMemo(() => ({ id: FOREST, text: '생각의 정원', children: maps.map((m) => m.root) }), [maps]);
  const rootRef = useRef(root);
  rootRef.current = root;
  const layoutMode = maps[0]?.layout === 'right' ? 'right' : 'both';
  const viewRef = useRef(view);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const editRef = useRef(null); // { id, orig, fresh, pushed }
  const revealRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef({ type: 'none' });
  const lastTap = useRef({ id: null, t: 0 });
  const lastBgTap = useRef({ x: 0, y: 0, t: 0 });

  // shownRoot: 완료한 가지 아래를 모두 완료로 처리한 보기용 사본. 고칠 때는 항상 원본(root)을 쓴다
  const shownRoot = useMemo(() => resolved(root), [root]);
  const tops = useMemo(() => new Set(root.children.map((r) => r.id)), [root]);
  const sizes = useMemo(() => {
    const all = new Map();
    for (const r of shownRoot.children) for (const [id, v] of buildSizes(r, editingId, tops)) all.set(id, v);
    return all;
  }, [shownRoot, editingId, tops]);
  // 마인드맵마다 따로 배치한 뒤, 심은 자리(root.pos)만큼 옮겨 한 캔버스에 모은다
  const layout = useMemo(() => {
    const pos = new Map();
    const mapBounds = new Map();
    let all = null;
    for (const r of shownRoot.children) {
      const l = computeLayout(r, layoutMode, sizes);
      const ox = (r.pos?.x || 0) + (moving?.id === r.id ? moving.dx : 0);
      const oy = (r.pos?.y || 0) + (moving?.id === r.id ? moving.dy : 0);
      for (const [id, q] of l.pos) pos.set(id, { ...q, x: q.x + ox, y: q.y + oy, top: r.id });
      const b = { minX: l.bounds.minX + ox, minY: l.bounds.minY + oy, maxX: l.bounds.maxX + ox, maxY: l.bounds.maxY + oy };
      mapBounds.set(r.id, b);
      all = all ? { minX: Math.min(all.minX, b.minX), minY: Math.min(all.minY, b.minY), maxX: Math.max(all.maxX, b.maxX), maxY: Math.max(all.maxY, b.maxY) } : b;
    }
    return { pos, mapBounds, bounds: all || { minX: -200, minY: -120, maxX: 200, maxY: 120 } };
  }, [shownRoot, layoutMode, sizes, moving]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const total = useMemo(() => stats(root), [root]);
  const selected = selectedId ? find(root, selectedId) : null;
  const shown = selectedId ? find(shownRoot, selectedId)?.node : null; // 선택한 가지의 보기용 상태

  // ── 뷰 ───────────────────────────────────────────────
  const applyView = (v, animate = false) => {
    viewRef.current = v;
    setView(v);
    setAnim(animate);
  };

  // readable=true: 처음 열 때는 글자가 읽히는 배율을 지키고, 다 안 들어가면 첫 마인드맵을 가운데에 둔다
  const fit = (animate = true, readable = false) => {
    const el = canvasRef.current;
    if (!el) return;
    const { minX, minY, maxX, maxY } = layoutRef.current.bounds;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const bw = maxX - minX;
    const bh = maxY - minY;
    const fitK = Math.min((cw - 48) / bw, (ch - 150) / bh);
    const k = clamp(fitK, readable ? 0.8 : MIN_K, 1);
    const whole = fitK >= k;
    const first = rootRef.current.children[0]?.pos;
    const cx = whole ? minX + bw / 2 : first?.x || 0;
    const cy = whole ? minY + bh / 2 : first?.y || 0;
    applyView({ k, x: cw / 2 - cx * k, y: (ch - 60) / 2 - cy * k }, animate);
  };

  const zoomAt = (factor, cx, cy, animate = false) => {
    const v = viewRef.current;
    const k = clamp(v.k * factor, MIN_K, MAX_K);
    applyView({ k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }, animate);
  };
  const zoomCenter = (factor) => {
    const el = canvasRef.current;
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2, true);
  };

  // 마인드맵 하나가 화면에 꽉 차게
  const fitMap = (topId) => {
    const el = canvasRef.current;
    const b = layoutRef.current.mapBounds.get(topId);
    if (!el || !b) return;
    const k = clamp(Math.min((el.clientWidth - 80) / (b.maxX - b.minX), (el.clientHeight - 190) / (b.maxY - b.minY)), 0.6, 1);
    applyView({ k, x: el.clientWidth / 2 - ((b.minX + b.maxX) / 2) * k, y: (el.clientHeight - 60) / 2 - ((b.minY + b.maxY) / 2) * k }, true);
  };
  const jump = (topId) => {
    finishEdit();
    setSelectedId(topId);
    fitMap(topId);
  };

  // 마지막으로 보던 자리와 배율을 기억해 다음에 그대로 연다
  useLayoutEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY));
      const el = canvasRef.current;
      const seen = v && [...layoutRef.current.pos.values()].some((p) => (p.x + p.w) * v.k + v.x > 0 && p.x * v.k + v.x < el.clientWidth && (p.y + p.h) * v.k + v.y > 0 && p.y * v.k + v.y < el.clientHeight);
      if (seen && [v.x, v.y, v.k].every(Number.isFinite) && v.k >= MIN_K && v.k <= MAX_K) return applyView(v);
    } catch {
      /* 저장된 화면이 없으면 맞춰서 연다 */
    }
    fit(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(view));
      } catch {
        /* 기억하지 못해도 쓰는 데는 지장이 없다 */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [view]);

  // 새로 선택된 노드가 화면 밖이면 보이도록 이동
  useEffect(() => {
    const id = revealRef.current;
    const el = canvasRef.current;
    const p = id && layout.pos.get(id);
    if (!p || !el) return;
    revealRef.current = null;
    let { x, y, k } = viewRef.current;
    const m = 28;
    const L = p.x * k + x;
    const R = (p.x + p.w) * k + x;
    const T = p.y * k + y;
    const B = (p.y + p.h) * k + y;
    // 열려 있는 시트(넓은 화면: 오른쪽, 좁은 화면: 아래)에 가려지지 않게
    const wide = el.clientWidth >= 760;
    const right = el.clientWidth - m - (sheet && wide ? 352 : 0);
    const bottom = el.clientHeight - (sheet && !wide ? el.clientHeight * 0.62 + 16 : 120);
    if (L < m) x += m - L;
    else if (R > right) x -= R - right;
    if (T < m) y += m - T;
    else if (B > bottom) y -= B - bottom;
    if (x !== viewRef.current.x || y !== viewRef.current.y) applyView({ x, y, k }, true);
  }, [layout, selectedId, sheet]);

  useEffect(() => {
    const el = canvasRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      } else {
        const v = viewRef.current;
        applyView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── 변경 · 실행 취소 ─────────────────────────────────
  // 고친 숲을 마인드맵 목록으로 되돌린다. 내용이 바뀐 마인드맵만 수정 시각을 올려야 동기화가 정확하다
  const commitRoot = (next) => {
    rootRef.current = next;
    const old = new Map(mapsRef.current.map((m) => [m.root.id, m]));
    const now = Date.now();
    const nextMaps = next.children.map((r) => {
      const m = old.get(r.id);
      if (!m) return { id: uid(), layout: layoutMode, createdAt: now, updatedAt: now, root: r };
      return sameJson(m.root, r) ? m : { ...m, root: r, updatedAt: now };
    });
    mapsRef.current = nextMaps;
    onChange(nextMaps);
  };
  const pushUndo = () => {
    undoRef.current.push(rootRef.current);
    if (undoRef.current.length > 100) undoRef.current.shift();
    redoRef.current = [];
  };
  const mutate = (fn, { undo = true } = {}) => {
    const next = structuredClone(rootRef.current);
    if (fn(next) === false) return;
    if (undo) pushUndo();
    commitRoot(next);
  };
  const stepHistory = (from, to) => {
    if (!from.current.length) return;
    finishEdit();
    to.current.push(rootRef.current);
    const next = from.current.pop();
    commitRoot(next);
    if (selectedId && !find(next, selectedId)) setSelectedId(null);
    bump((n) => n + 1);
  };
  const undo = () => stepHistory(undoRef, redoRef);
  const redo = () => stepHistory(redoRef, undoRef);

  // ── 편집 ─────────────────────────────────────────────
  const select = (id, reveal = false) => {
    setSelectedId(id);
    setDelAsk(null);
    if (!id) setSheet((s) => (s === 'detail' ? null : s));
    if (reveal) revealRef.current = id;
  };

  const startEdit = (id, fresh = false) => {
    finishEdit();
    const hit = find(rootRef.current, id);
    if (!hit) return;
    editRef.current = { id, orig: hit.node.text, fresh, pushed: fresh };
    setSelectedId(id);
    setEditingId(id);
    revealRef.current = id;
  };

  const onEditChange = (value) => {
    const e = editRef.current;
    if (!e) return;
    if (!e.pushed) {
      pushUndo();
      e.pushed = true;
    }
    mutate((r) => { find(r, e.id).node.text = value; }, { undo: false });
  };

  function finishEdit(cancel = false) {
    const e = editRef.current;
    if (!e) return;
    editRef.current = null;
    setEditingId(null);
    const hit = find(rootRef.current, e.id);
    if (!hit) return;
    const empty = !hit.node.text.trim();
    if (e.fresh && (empty || cancel)) {
      // 방금 만든 빈 노드는 흔적 없이 제거
      undoRef.current.pop();
      mutate((r) => { const h = find(r, e.id); h.parent.children.splice(h.index, 1); }, { undo: false });
      setSelectedId(hit.parent && hit.parent.id !== FOREST ? hit.parent.id : null);
    } else if (empty || cancel) {
      if (hit.node.text !== e.orig) mutate((r) => { find(r, e.id).node.text = e.orig; }, { undo: false });
      if (e.pushed) undoRef.current.pop();
    } else if (hit.node.text !== hit.node.text.trim()) {
      mutate((r) => { const n = find(r, e.id).node; n.text = n.text.trim(); }, { undo: false });
    }
    bump((n) => n + 1);
  }

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!editingId || !el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editingId]);

  const addNode = (id, asSibling) => {
    finishEdit();
    const hit = find(rootRef.current, id);
    if (!hit || !hit.parent) return;
    const fresh = makeNode('');
    mutate((r) => {
      const h = find(r, hit.node.id);
      if (asSibling && h.parent.id !== FOREST) h.parent.children.splice(h.index + 1, 0, fresh);
      else {
        delete h.node.collapsed;
        h.node.children.push(fresh);
      }
    });
    startEdit(fresh.id, true);
  };

  const removeNode = (id, withChildren) => {
    const hit = find(rootRef.current, id);
    if (!hit || !hit.parent) return;
    finishEdit();
    const top = hit.parent.id === FOREST;
    // 기본은 선택한 가지만 지우고, 하위 가지는 그 자리로 올린다. 중심 주제를 지우면 그 마인드맵 전체가 지워진다
    mutate((r) => {
      const h = find(r, id);
      h.parent.children.splice(h.index, 1, ...(withChildren || top ? [] : h.node.children));
    });
    setDelAsk(null);
    select(top ? null : hit.parent.id, !top);
  };

  // 하위 가지가 있으면 어디까지 지울지 먼저 묻는다
  const askRemove = (id) => {
    const hit = find(rootRef.current, id);
    if (!hit || !hit.parent) return;
    // 마인드맵 전체를 지우는 일은 언제나 한 번 더 묻는다
    if (hit.node.children.length || hit.parent.id === FOREST) setDelAsk(id);
    else removeNode(id, false);
  };

  // 새 씨앗: 캔버스의 그 자리에 새 마인드맵의 중심 주제를 심는다
  const plantSeed = (x, y) => {
    finishEdit();
    const seed = makeNode('', { pos: { x: Math.round(x), y: Math.round(y) } });
    mutate((r) => { r.children.push(seed); });
    startEdit(seed.id, true);
  };
  const plantSeedInView = () => {
    const el = canvasRef.current;
    const v = viewRef.current;
    plantSeed((el.clientWidth / 2 - v.x) / v.k, ((el.clientHeight - 60) / 2 - v.y) / v.k);
  };

  // 가지를 독립된 마인드맵으로 심는다: 하위 가지를 가지고 원래 마인드맵 아래쪽 빈자리로 옮겨 가고,
  // 원래 가지에는 그곳으로 가는 표시를 남긴다
  const plantBranch = (id) => {
    finishEdit();
    const hit = find(rootRef.current, id);
    const p = layoutRef.current.pos.get(id);
    if (!hit || !hit.parent || hit.parent.id === FOREST || !p) return;
    const home = layoutRef.current.mapBounds.get(p.top);
    const seed = makeNode(hit.node.text, { pos: { x: Math.round(p.x + p.w / 2), y: Math.round(home.maxY + 170) } });
    if (hit.node.note) seed.note = hit.node.note;
    seed.children = structuredClone(hit.node.children);
    mutate((r) => {
      const n = find(r, id).node;
      n.children = [];
      n.link = seed.id;
      delete n.collapsed;
      r.children.push(seed);
    });
    setSelectedId(id);
  };

  const patchNode = (id, patch) =>
    mutate((r) => {
      const n = find(r, id)?.node;
      if (!n) return false;
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === undefined) delete n[k];
        else n[k] = v;
      }
    });

  const cycleStatus = (id) => {
    const n = find(rootRef.current, id)?.node;
    if (!n) return;
    const next = STATUSES[STATUSES.indexOf(n.status) + 1] ?? null;
    patchNode(id, { status: next });
  };

  const toggleCollapse = (id) =>
    mutate((r) => {
      const h = find(r, id);
      if (!h || !h.parent || h.parent.id === FOREST || !h.node.children.length) return false;
      if (h.node.collapsed) delete h.node.collapsed;
      else h.node.collapsed = true;
    });

  const setAllCollapsed = (collapsed) =>
    mutate((r) => walk(r, (n, parent) => {
      if (collapsed && parent && parent.id !== FOREST && n.children.length) n.collapsed = true;
      else delete n.collapsed;
    }));

  const moveNode = (id, targetId) => {
    revealRef.current = id;
    mutate((r) => {
      const h = find(r, id);
      if (!h || !h.parent || h.parent.id === FOREST || find(h.node, targetId) || h.parent.id === targetId) return false;
      h.parent.children.splice(h.index, 1);
      const t = find(r, targetId).node;
      delete t.collapsed;
      t.children.push(h.node);
    });
  };

  const reorder = (id, dir) =>
    mutate((r) => {
      const h = find(r, id);
      const j = h && h.parent && h.parent.id !== FOREST ? h.index + dir : -1;
      if (j < 0 || j >= h.parent.children.length) return false;
      const list = h.parent.children;
      [list[h.index], list[j]] = [list[j], list[h.index]];
    });

  // ── 포인터 (이동 · 확대 · 탭 · 드래그) ───────────────
  const local = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const beginDrag = (id, pt, origin = pt) => {
    const g = gesture.current;
    clearTimeout(g.timer);
    const hit = find(rootRef.current, id);
    if (!hit) return;
    navigator.vibrate?.(12);
    setSelectedId(id);
    if (hit.parent.id === FOREST) {
      // 중심 주제를 끌면 그 마인드맵 전체가 따라 움직인다
      gesture.current = { type: 'movemap', id, origin, pos0: hit.node.pos || { x: 0, y: 0 } };
      return;
    }
    const sub = new Set();
    walk(hit.node, (n) => sub.add(n.id));
    gesture.current = { type: 'drag', id, sub };
    setDrag({ id, x: pt.x, y: pt.y, targetId: null, sub });
  };

  const dropTargetAt = (pt, sub) => {
    const v = viewRef.current;
    const wx = (pt.x - v.x) / v.k;
    const wy = (pt.y - v.y) / v.k;
    let best = null;
    let bestD = Infinity;
    for (const [id, p] of layoutRef.current.pos) {
      if (sub.has(id) || !visibleRef.current.has(id)) continue;
      const m = 12;
      if (wx < p.x - m || wx > p.x + p.w + m || wy < p.y - m || wy > p.y + p.h + m) continue;
      const d = Math.hypot(wx - (p.x + p.w / 2), wy - (p.y + p.h / 2));
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };

  const onPointerDown = (e) => {
    if (e.target.closest('textarea')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    finishEdit();
    setAnim(false);
    canvasRef.current.setPointerCapture(e.pointerId);
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    clearTimeout(gesture.current.timer);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: 'pinch',
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view0: viewRef.current,
      };
      setDrag(null);
      return;
    }
    if (pointers.current.size > 2) return;

    const nodeId = e.target.closest('[data-id]')?.dataset.id || null;
    const g = {
      type: 'press',
      nodeId,
      toggleId: e.target.closest('[data-toggle]')?.dataset.toggle || null,
      onStatus: !!e.target.closest('[data-st]'),
      jumpTo: e.target.closest('[data-jump]')?.dataset.jump || null,
      start: pt,
      view0: viewRef.current,
      pointerType: e.pointerType,
    };
    if (nodeId && e.pointerType !== 'mouse') {
      g.timer = setTimeout(() => beginDrag(nodeId, g.last || pt), 380);
    }
    gesture.current = g;
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    const g = gesture.current;

    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = clamp((g.view0.k * d) / g.d0, MIN_K, MAX_K);
      const s = k / g.view0.k;
      applyView({ k, x: mid.x - (g.mid0.x - g.view0.x) * s, y: mid.y - (g.mid0.y - g.view0.y) * s });
      return;
    }
    if (g.type === 'press') {
      g.last = pt;
      if (Math.hypot(pt.x - g.start.x, pt.y - g.start.y) < 6) return;
      if (g.nodeId && g.pointerType === 'mouse') {
        beginDrag(g.nodeId, pt, g.start);
        if (gesture.current.type !== 'movemap') return;
      } else {
        clearTimeout(g.timer);
        g.type = 'pan';
      }
    }
    const cur = gesture.current;
    if (cur.type === 'movemap') {
      const k = viewRef.current.k;
      setMoving({ id: cur.id, dx: (pt.x - cur.origin.x) / k, dy: (pt.y - cur.origin.y) / k });
      return;
    }
    if (g.type === 'pan') {
      applyView({ k: g.view0.k, x: g.view0.x + pt.x - g.start.x, y: g.view0.y + pt.y - g.start.y });
    } else if (g.type === 'drag') {
      setDrag((d) => d && { ...d, x: pt.x, y: pt.y, targetId: dropTargetAt(pt, g.sub) });
    }
  };

  const endPointer = (e, cancelled) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    clearTimeout(g.timer);

    if (g.type === 'pinch') {
      const rest = [...pointers.current.values()][0];
      gesture.current = rest ? { type: 'pan', start: rest, view0: viewRef.current } : { type: 'none' };
      return;
    }
    gesture.current = { type: 'none' };
    if (g.type === 'movemap') {
      const m = moving;
      setMoving(null);
      if (!cancelled && m && (Math.abs(m.dx) > 1 || Math.abs(m.dy) > 1)) {
        mutate((r) => {
          const n = find(r, g.id)?.node;
          if (!n) return false;
          n.pos = { x: Math.round(g.pos0.x + m.dx), y: Math.round(g.pos0.y + m.dy) };
        });
      }
      return;
    }
    if (g.type === 'drag') {
      const target = drag?.targetId;
      setDrag(null);
      if (!cancelled && target) moveNode(g.id, target);
      return;
    }
    if (g.type !== 'press' || cancelled) return;

    // 탭
    if (g.toggleId) return toggleCollapse(g.toggleId);
    const now = Date.now();
    if (!g.nodeId) {
      // 빈 곳을 두 번 누르면 그 자리에 새 씨앗
      const b = lastBgTap.current;
      if (now - b.t < 380 && Math.hypot(g.start.x - b.x, g.start.y - b.y) < 24) {
        lastBgTap.current = { x: 0, y: 0, t: 0 };
        const v = viewRef.current;
        return plantSeed((g.start.x - v.x) / v.k, (g.start.y - v.y) / v.k);
      }
      lastBgTap.current = { x: g.start.x, y: g.start.y, t: now };
      return select(null);
    }
    if (g.jumpTo) return jump(g.jumpTo);
    if (g.onStatus) {
      select(g.nodeId);
      return cycleStatus(g.nodeId);
    }
    if (lastTap.current.id === g.nodeId && now - lastTap.current.t < 380) {
      lastTap.current = { id: null, t: 0 };
      // 축소해서 제목만 보일 때는 이름 수정 대신 그 마인드맵으로 확대한다
      if (lodOf(viewRef.current.k) > 0) fitMap(layoutRef.current.pos.get(g.nodeId)?.top);
      else startEdit(g.nodeId);
    } else {
      lastTap.current = { id: g.nodeId, t: now };
      select(g.nodeId);
    }
  };

  // ── 키보드 ───────────────────────────────────────────
  const navigate = (key) => {
    const pos = layoutRef.current.pos;
    const p = pos.get(selectedId);
    if (!p) return root.children[0] && select(root.children[0].id, true);
    const n = p.node;
    const firstOn = (side) => [...pos.values()].find((q) => q.parentId === n.id && q.side === side)?.node.id;
    let next = null;
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const dir = key === 'ArrowRight' ? 1 : -1;
      if (p.side === 0) next = firstOn(dir);
      else if (p.side === dir) next = n.collapsed ? null : n.children[0]?.id;
      else next = p.parentId;
    } else {
      const col = [...pos.values()]
        .filter((q) => q.top === p.top && q.depth === p.depth && q.side === p.side)
        .sort((a, b) => a.y - b.y);
      const i = col.indexOf(p);
      next = col[i + (key === 'ArrowDown' ? 1 : -1)]?.node.id;
    }
    if (next) select(next, true);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (e.target.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return;
      if (mod && k.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (mod && k.toLowerCase() === 'y') {
        e.preventDefault();
        return redo();
      }
      if (mod || e.altKey) return;
      if (k.startsWith('Arrow')) {
        e.preventDefault();
        return navigate(k);
      }
      if (!selectedId) return;
      if (k === 'Tab') {
        e.preventDefault();
        addNode(selectedId, false);
      } else if (k === 'Enter') {
        e.preventDefault();
        addNode(selectedId, true);
      } else if (k === 'F2') {
        e.preventDefault();
        startEdit(selectedId);
      } else if (k === ' ') {
        e.preventDefault();
        toggleCollapse(selectedId);
      } else if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        askRemove(selectedId);
      } else if (k === 'Escape') {
        if (delAsk) setDelAsk(null);
        else select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onInputKey = (e) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finishEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishEdit(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const id = editRef.current?.id;
      finishEdit();
      if (id && find(rootRef.current, id)) addNode(id, false);
    }
  };

  // ── 렌더 ─────────────────────────────────────────────
  // 축소 단계에 따라 보여 줄 가지를 고른다. 자리는 그대로 두고 깊은 가지만 숨긴다
  const lod = lodOf(view.k);
  const nodes = [...layout.pos.values()].filter((p) => p.depth <= (lod === 2 ? 0 : lod === 1 ? 1 : Infinity));
  const visibleRef = useRef(new Set());
  visibleRef.current = new Set(nodes.map((p) => p.node.id));
  // 축소해도 제목이 읽히도록 남은 가지를 키운다
  const boost = (depth) => (lod === 0 ? 1 : depth === 0 ? clamp(0.85 / view.k, 1, lod === 2 ? 6 : 1.5) : Math.min(1.35, 0.7 / view.k));
  const topSelected = !!selected && selected.parent?.id === FOREST;
  // 화면 안에 보이는 가지가 하나도 없으면(멀리 옮겨 갔거나 잘못 확대했을 때) 돌아오는 길을 보여 준다
  const lost = (() => {
    const el = canvasRef.current;
    if (!el || !nodes.length) return false;
    const w = el.clientWidth;
    const h = el.clientHeight;
    return !nodes.some((p) => (p.x + p.w) * view.k + view.x > 0 && p.x * view.k + view.x < w && (p.y + p.h) * view.k + view.y > 0 && p.y * view.k + view.y < h);
  })();
  const setLayoutMode = (mode) => {
    const now = Date.now();
    const next = mapsRef.current.map((m) => ({ ...m, layout: mode, updatedAt: now }));
    mapsRef.current = next;
    onChange(next);
  };
  const focusNode = (id) => {
    mutate((r) => {
      // 접힌 조상을 펼쳐서 보이게
      let changed = false;
      const open = (n) => {
        if (n.id === id) return true;
        for (const c of n.children) {
          if (open(c)) {
            if (n.collapsed) {
              delete n.collapsed;
              changed = true;
            }
            return true;
          }
        }
        return false;
      };
      open(r);
      return changed;
    }, { undo: false });
    select(id, true);
  };

  return (
    <div className="editor">
      <header className="topbar">
        <h1 className="map-title">생각의 정원</h1>
        {total.total > 0 && (
          <button className="progress-pill" onClick={() => setSheet(sheet === 'tasks' ? null : 'tasks')} data-tip="끝낸 할 일 / 전체 할 일 · 누르면 할 일 목록">
            <span className="bar"><i style={{ width: `${(total.done / total.total) * 100}%` }} /></span>
            {total.done}/{total.total}
          </button>
        )}
        <button className="icon-btn" onClick={undo} disabled={!undoRef.current.length} aria-label="실행 취소" data-tip="실행 취소 (Ctrl+Z)"><Undo2 size={19} /></button>
        <button className="icon-btn" onClick={redo} disabled={!redoRef.current.length} aria-label="다시 실행" data-tip="다시 실행 (Ctrl+Shift+Z)"><Redo2 size={19} /></button>
        <button className={`icon-btn ${sheet === 'tasks' ? 'on' : ''}`} onClick={() => setSheet(sheet === 'tasks' ? null : 'tasks')} aria-label="할 일 목록" data-tip="할 일 목록 보기: 상태별로 모아 보고 가지로 이동"><ListTodo size={19} /></button>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="더 보기" data-tip="더 보기: 펼침 방향, 모두 접기·펼치기, 동기화, 앱 설치"><MoreVertical size={19} /></button>
        {menu && (
          <Menu
            onClose={() => setMenu(false)}
            items={[
              { label: layoutMode === 'right' ? '양쪽으로 펼치기' : '오른쪽으로만 펼치기', run: () => setLayoutMode(layoutMode === 'right' ? 'both' : 'right') },
              { label: '모두 펼치기', run: () => setAllCollapsed(false) },
              { label: '모두 접기', run: () => setAllCollapsed(true) },
              { label: '전체가 보이게 맞추기', run: () => fit() },
              ...menuItems,
            ]}
          />
        )}
      </header>

      <div className="stage">
        <div
          ref={canvasRef}
          className={`canvas ${drag ? 'dragging' : ''}`}
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.k * (lod === 2 ? 8 : lod === 1 ? 2 : 1)}px ${24 * view.k * (lod === 2 ? 8 : lod === 1 ? 2 : 1)}px` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endPointer(e, false)}
          onPointerCancel={(e) => endPointer(e, true)}
        >
          <div className={`world ${anim ? 'anim' : ''} ${moving ? 'moving' : ''}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            <svg className="edges" width="1" height="1">
              {nodes.map((p) => p.parentId && (
                <path
                  key={p.node.id}
                  d={edgePath(layout.pos.get(p.parentId), p)}
                  stroke={p.color}
                  strokeWidth={p.depth === 1 ? 2.5 : 1.75}
                  opacity={drag?.sub.has(p.node.id) ? 0.25 : 1}
                />
              ))}
            </svg>

            {nodes.map((p) => {
              const n = p.node;
              const s = sizes.get(n.id);
              const editing = editingId === n.id;
              const cls = [
                'node', `d${s.level}`,
                n.id === selectedId && 'sel',
                (n.status === 'done' || n.doneBy) && 'done',
                drag?.targetId === n.id && 'drop',
                drag?.sub.has(n.id) && 'ghost',
              ].filter(Boolean).join(' ');
              return (
                <React.Fragment key={n.id}>
                  <div
                    data-id={n.id}
                    className={cls}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h, padding: `${s.pad.y}px ${s.pad.x}px`, '--c': p.color || 'var(--accent)', transform: lod ? `scale(${boost(p.depth)})` : undefined }}
                  >
                    {n.status && <span className={`st ${n.status}`} data-st="1" data-tip={`${STATUS_LABEL[n.status]} · 누르면 다음 상태로`}><StatusIcon status={n.status} /></span>}
                    {n.link && tops.has(n.link) && (
                      <span className="jump" data-jump={n.link} data-tip="이 가지를 따로 심은 마인드맵으로 이동"><ArrowUpRight size={15} /></span>
                    )}
                    <div className="body">
                      {editing ? (
                        <textarea
                          ref={inputRef}
                          className={`nt d${s.level}`}
                          style={{ width: s.tw, height: s.th }}
                          value={n.text}
                          rows={1}
                          enterKeyHint="done"
                          onChange={(e) => onEditChange(e.target.value)}
                          onKeyDown={onInputKey}
                          onBlur={() => finishEdit()}
                        />
                      ) : (
                        <div className={`nt d${s.level} ${n.text ? '' : 'empty'}`} style={{ width: s.tw }}>
                          {n.text || (p.depth === 0 ? '제목 없음' : ' ')}
                        </div>
                      )}
                      {s.meta && <div className={`nt meta ${s.overdue ? 'overdue' : ''}`}>{s.meta}</div>}
                    </div>
                  </div>
                  {lod === 0 && p.depth > 0 && n.children.length > 0 && (
                    <div
                      data-toggle={n.id}
                      data-tip={n.collapsed ? `접힌 가지 ${n.children.length}개 펼치기` : '하위 가지 접기 (Space)'}
                      className={`toggle ${n.collapsed ? 'closed' : ''}`}
                      style={{ left: p.side > 0 ? p.x + p.w + 5 : p.x - 27, top: p.y + p.h / 2 - 11, '--c': p.color }}
                    >
                      {n.collapsed ? n.children.length : '−'}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="share">
          <button onClick={plantSeedInView} data-tip="새 씨앗: 화면 가운데에 새 마인드맵을 심기 (빈 곳을 두 번 눌러도 됩니다)">
            <Sprout size={18} /><span>새 씨앗</span>
          </button>
          <button className={sheet === 'send' ? 'on' : ''} onClick={() => setSheet(sheet === 'send' ? null : 'send')} data-tip="요약 복사: 보고서·앱 만들기 요청문·일정 안내를 만들어 복사">
            <Copy size={18} /><span>요약 복사</span>
          </button>
          <button className={sheet === 'calendar' ? 'on' : ''} onClick={() => setSheet(sheet === 'calendar' ? null : 'calendar')} data-tip="캘린더에 추가: 날짜가 있는 가지를 Google 캘린더나 일정 파일로">
            <CalendarPlus size={18} /><span>캘린더</span>
          </button>
        </div>

        <div className="zoom">
          <button onClick={() => zoomCenter(1.25)} aria-label="확대" data-tip="확대 (Ctrl+휠)"><ZoomIn size={18} /></button>
          <button onClick={() => zoomCenter(0.8)} aria-label="축소" data-tip="축소 (Ctrl+휠)"><ZoomOut size={18} /></button>
          <button onClick={() => fit()} aria-label="화면에 맞추기" data-tip="심은 마인드맵 전체가 보이게 맞추기"><Maximize size={18} /></button>
        </div>

        {lost && !sheet && (
          <button className="hint lost" onClick={() => fit()}>화면에 마인드맵이 없어요 · 눌러서 전체 보기</button>
        )}
        {!lost && !selected && !sheet && (
          <div className="hint">
            {!root.children.length ? '빈 곳을 두 번 누르거나 ‘새 씨앗’을 눌러 첫 마인드맵을 심어 보세요'
              : lod === 2 ? '제목만 보는 중 · 제목을 두 번 누르면 그 마인드맵으로 확대'
              : lod === 1 ? '제목과 큰 가지만 보는 중 · 확대하면 전부 보여요'
              : '빈 곳을 두 번 누르면 새 씨앗 · 중심 주제를 끌면 마인드맵 이동 · 축소하면 여러 마인드맵을 한눈에'}
          </div>
        )}

        {selected && (
          <div className="toolbar">
            <button onClick={() => addNode(selectedId, false)} data-tip="하위 가지 추가 (Tab)"><CornerDownRight size={19} /><span>하위</span></button>
            {!topSelected && <button onClick={() => addNode(selectedId, true)} data-tip="같은 단계에 가지 추가 (Enter)"><Plus size={19} /><span>형제</span></button>}
            <button onClick={() => startEdit(selectedId)} data-tip="이름 수정 (F2 또는 두 번 누르기)"><Pencil size={18} /><span>수정</span></button>
            {!topSelected && (selected.node.link && tops.has(selected.node.link) ? (
              <button className="on" onClick={() => jump(selected.node.link)} data-tip="이 가지를 따로 심은 마인드맵으로 이동"><ArrowUpRight size={19} /><span>열기</span></button>
            ) : (
              <button onClick={() => plantBranch(selectedId)} data-tip="이 가지를 따로 심기: 하위 가지와 함께 독립된 마인드맵이 됩니다"><Scissors size={18} /><span>따로 심기</span></button>
            ))}
            <button
              onClick={() => cycleStatus(selectedId)}
              className={shown?.status ? `st ${shown.status}` : ''}
              data-tip={shown?.doneBy ? '상위 가지가 완료라서 완료로 처리됩니다. 상위 가지의 완료를 풀면 이 가지의 원래 상태로 돌아갑니다' : '상태 바꾸기: 없음 → 할 일 → 진행 중 → 완료'}
            >
              <StatusIcon status={shown?.status} size={19} />
              <span>{shown?.status ? STATUS_LABEL[shown.status] : shown?.doneBy ? '완료' : '상태'}</span>
            </button>
            <button onClick={() => { revealRef.current = selectedId; setSheet(sheet === 'detail' ? null : 'detail'); }} className={sheet === 'detail' ? 'on' : ''} data-tip="상세: 상태, 마감일, 메모, 가지 색, 순서"><SlidersHorizontal size={18} /><span>상세</span></button>
            <button onClick={() => askRemove(selectedId)} className="danger" data-tip={topSelected ? '이 마인드맵 전체 삭제 (Delete)' : '삭제 (Delete): 하위 가지가 있으면 범위를 고릅니다'}><Trash2 size={18} /><span>삭제</span></button>
          </div>
        )}

        {delAsk && selected && delAsk === selectedId && (
          <div className="del-choice" role="dialog" aria-label="삭제 범위 선택">
            {topSelected ? (
              <>
                <p>‘{selected.node.text.split('\n')[0] || '제목 없음'}’ 마인드맵 전체(가지 {countNodes(selected.node) - 1}개 포함)를 삭제할까요? 실행 취소로 되돌릴 수 있어요.</p>
                <button className="ghost-btn danger" onClick={() => removeNode(delAsk, true)}>마인드맵 삭제 <small>{countNodes(selected.node)}개</small></button>
              </>
            ) : (
              <>
                <p>‘{selected.node.text.split('\n')[0] || '제목 없음'}’ 아래에 가지가 {countNodes(selected.node) - 1}개 있어요.</p>
                <button className="ghost-btn" onClick={() => removeNode(delAsk, false)}>이 가지만 삭제 <small>하위 가지는 한 단계 위로</small></button>
                <button className="ghost-btn danger" onClick={() => removeNode(delAsk, true)}>하위 가지까지 모두 삭제 <small>{countNodes(selected.node)}개</small></button>
              </>
            )}
            <button className="text-btn" onClick={() => setDelAsk(null)}>취소</button>
          </div>
        )}

        {sheet === 'detail' && selected && (
          <DetailSheet
            key={selectedId}
            node={selected.node}
            isRoot={topSelected}
            canUp={!topSelected && selected.index > 0}
            canDown={!topSelected && selected.index < selected.parent.children.length - 1}
            onPatch={(patch) => patchNode(selectedId, patch)}
            onReorder={(dir) => reorder(selectedId, dir)}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'tasks' && (
          <TasksSheet root={shownRoot} onCycle={cycleStatus} onFocus={focusNode} onClose={() => setSheet(null)} />
        )}

        {sheet === 'send' && (
          <CopySheet root={shownRoot} defaultKind="report" branch={selected ? shown : null} onClose={() => setSheet(null)} />
        )}
        {sheet === 'calendar' && (
          <CalendarSheet root={shownRoot} onFocus={focusNode} onClose={() => setSheet(null)} />
        )}

        {drag && (
          <div className="drag-label" style={{ left: drag.x, top: drag.y }}>
            {find(root, drag.id)?.node.text || '항목'}
            <small>{drag.targetId ? '여기에 놓기' : '옮길 가지 위에 놓으세요'}</small>
          </div>
        )}
      </div>
    </div>
  );
}
