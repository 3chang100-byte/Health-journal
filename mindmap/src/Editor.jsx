import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Undo2, Redo2, ListTodo, MoreVertical, Plus, Trash2, Pencil, Circle, CircleDot,
  CheckCircle2, ZoomIn, ZoomOut, Maximize, CornerDownRight, SlidersHorizontal, Copy, CalendarPlus, Sprout, ArrowUpRight, CornerLeftUp,
} from 'lucide-react';
import { CATEGORIES, STATUSES, STATUS_LABEL, categoryOf, find, makeNode, newMapIn, stats, titleOf, walk } from './store.js';
import { buildSizes, computeLayout, edgePath } from './layout.js';
import { DetailSheet, TasksSheet, Menu } from './Panels.jsx';
import { CopySheet, CalendarSheet } from './SharePanels.jsx';
import { countNodes } from './share.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MIN_K = 0.25;
const MAX_K = 2.5;

export const StatusIcon = ({ status, size = 18 }) =>
  status === 'done' ? <CheckCircle2 size={size} /> : status === 'doing' ? <CircleDot size={size} /> : <Circle size={size} />;

export default function Editor({ map, mapTitles, onChange, onCreateMap, onBack, onExport, onToggleDone, onPickCategory, onShowPlant }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [anim, setAnim] = useState(false);
  const [sheet, setSheet] = useState(null); // 'detail' | 'tasks' | 'send' | 'calendar'
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState(null);
  const [delAsk, setDelAsk] = useState(null);
  const [, bump] = useState(0);

  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const mapRef = useRef(map);
  mapRef.current = map;
  const viewRef = useRef(view);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const editRef = useRef(null); // { id, orig, fresh, pushed }
  const revealRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef({ type: 'none' });
  const lastTap = useRef({ id: null, t: 0 });

  const root = map.root;
  // mapTitles: 지금 있는 마인드맵 id → 제목. 지워진 마인드맵으로 가는 연결은 표시하지 않는다
  const sizes = useMemo(() => buildSizes(root, editingId, mapTitles), [root, editingId, mapTitles]);
  const jump = (mapId) => { finishEdit(); location.hash = `#m-${mapId}`; };
  const layout = useMemo(() => computeLayout(root, map.layout, sizes), [root, map.layout, sizes]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const total = useMemo(() => stats(root), [root]);
  const selected = selectedId ? find(root, selectedId) : null;

  // ── 뷰 ───────────────────────────────────────────────
  const applyView = (v, animate = false) => {
    viewRef.current = v;
    setView(v);
    setAnim(animate);
  };

  // readable=true: 처음 열 때는 글자가 읽히는 배율을 지키고, 다 안 들어가면 중심 주제를 가운데에 둔다
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
    const cx = whole ? minX + bw / 2 : 0;
    const cy = whole ? minY + bh / 2 : 0;
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

  useLayoutEffect(() => {
    fit(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id]);

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
  const commitRoot = (next) => {
    const m = { ...mapRef.current, root: next, updatedAt: Date.now() };
    mapRef.current = m;
    onChange(m);
  };
  const pushUndo = () => {
    undoRef.current.push(mapRef.current.root);
    if (undoRef.current.length > 100) undoRef.current.shift();
    redoRef.current = [];
  };
  const mutate = (fn, { undo = true } = {}) => {
    const next = structuredClone(mapRef.current.root);
    if (fn(next) === false) return;
    if (undo) pushUndo();
    commitRoot(next);
  };
  const stepHistory = (from, to) => {
    if (!from.current.length) return;
    finishEdit();
    to.current.push(mapRef.current.root);
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
    const hit = find(mapRef.current.root, id);
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
    const hit = find(mapRef.current.root, e.id);
    if (!hit) return;
    const empty = !hit.node.text.trim();
    if (e.fresh && (empty || cancel)) {
      // 방금 만든 빈 노드는 흔적 없이 제거
      undoRef.current.pop();
      mutate((r) => { const h = find(r, e.id); h.parent.children.splice(h.index, 1); }, { undo: false });
      setSelectedId(hit.parent ? hit.parent.id : null);
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
    const cur = mapRef.current.root;
    const hit = find(cur, id) || { node: cur, parent: null };
    const fresh = makeNode('');
    mutate((r) => {
      const h = find(r, hit.node.id);
      if (asSibling && h.parent) h.parent.children.splice(h.index + 1, 0, fresh);
      else {
        delete h.node.collapsed;
        h.node.children.push(fresh);
      }
    });
    startEdit(fresh.id, true);
  };

  const removeNode = (id, withChildren) => {
    const hit = find(mapRef.current.root, id);
    if (!hit || !hit.parent) return;
    finishEdit();
    // 기본은 선택한 가지만 지우고, 하위 가지는 그 자리로 올린다
    mutate((r) => {
      const h = find(r, id);
      h.parent.children.splice(h.index, 1, ...(withChildren ? [] : h.node.children));
    });
    setDelAsk(null);
    select(hit.parent.id, true);
  };

  // 하위 가지가 있으면 어디까지 지울지 먼저 묻는다
  const askRemove = (id) => {
    const hit = find(mapRef.current.root, id);
    if (!hit || !hit.parent) return;
    if (hit.node.children.length) setDelAsk(id);
    else removeNode(id, false);
  };

  // 가지를 새 마인드맵으로 심는다: 하위 가지는 새 마인드맵으로 옮기고, 이 가지에는 그곳으로 가는 연결을 남긴다
  const plantBranch = (id) => {
    finishEdit();
    const hit = find(mapRef.current.root, id);
    if (!hit || !hit.parent) return;
    const child = newMapIn(categoryOf(mapRef.current));
    child.parent = { mapId: mapRef.current.id };
    child.root.text = hit.node.text;
    if (hit.node.note) child.root.note = hit.node.note;
    child.root.children = structuredClone(hit.node.children);
    onCreateMap(child);
    mutate((r) => {
      const n = find(r, id).node;
      n.children = [];
      n.link = child.id;
      delete n.collapsed;
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
    const n = find(mapRef.current.root, id)?.node;
    if (!n) return;
    const next = STATUSES[STATUSES.indexOf(n.status) + 1] ?? null;
    patchNode(id, { status: next });
  };

  const toggleCollapse = (id) =>
    mutate((r) => {
      const h = find(r, id);
      if (!h || !h.parent || !h.node.children.length) return false;
      if (h.node.collapsed) delete h.node.collapsed;
      else h.node.collapsed = true;
    });

  const setAllCollapsed = (collapsed) =>
    mutate((r) => walk(r, (n, parent) => {
      if (collapsed && parent && n.children.length) n.collapsed = true;
      else delete n.collapsed;
    }));

  const moveNode = (id, targetId) => {
    revealRef.current = id;
    mutate((r) => {
      const h = find(r, id);
      if (!h || !h.parent || find(h.node, targetId) || h.parent.id === targetId) return false;
      h.parent.children.splice(h.index, 1);
      const t = find(r, targetId).node;
      delete t.collapsed;
      t.children.push(h.node);
    });
  };

  const reorder = (id, dir) =>
    mutate((r) => {
      const h = find(r, id);
      const j = h && h.parent ? h.index + dir : -1;
      if (j < 0 || j >= h.parent.children.length) return false;
      const list = h.parent.children;
      [list[h.index], list[j]] = [list[j], list[h.index]];
    });

  // ── 포인터 (이동 · 확대 · 탭 · 드래그) ───────────────
  const local = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const beginDrag = (id, pt) => {
    const g = gesture.current;
    clearTimeout(g.timer);
    const sub = new Set();
    walk(find(mapRef.current.root, id).node, (n) => sub.add(n.id));
    gesture.current = { type: 'drag', id, sub };
    navigator.vibrate?.(12);
    setSelectedId(id);
    setDrag({ id, x: pt.x, y: pt.y, targetId: null, sub });
  };

  const dropTargetAt = (pt, sub) => {
    const v = viewRef.current;
    const wx = (pt.x - v.x) / v.k;
    const wy = (pt.y - v.y) / v.k;
    let best = null;
    let bestD = Infinity;
    for (const [id, p] of layoutRef.current.pos) {
      if (sub.has(id)) continue;
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
    if (nodeId && nodeId !== mapRef.current.root.id && e.pointerType !== 'mouse') {
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
      if (g.nodeId && g.nodeId !== mapRef.current.root.id && g.pointerType === 'mouse') {
        beginDrag(g.nodeId, pt);
        return;
      }
      clearTimeout(g.timer);
      g.type = 'pan';
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
    if (g.type === 'drag') {
      const target = drag?.targetId;
      setDrag(null);
      if (!cancelled && target) moveNode(g.id, target);
      return;
    }
    if (g.type !== 'press' || cancelled) return;

    // 탭
    if (g.toggleId) return toggleCollapse(g.toggleId);
    if (!g.nodeId) return select(null);
    if (g.jumpTo) return jump(g.jumpTo);
    if (g.onStatus) {
      select(g.nodeId);
      return cycleStatus(g.nodeId);
    }
    const now = Date.now();
    if (lastTap.current.id === g.nodeId && now - lastTap.current.t < 380) {
      lastTap.current = { id: null, t: 0 };
      startEdit(g.nodeId);
    } else {
      lastTap.current = { id: g.nodeId, t: now };
      select(g.nodeId);
    }
  };

  // ── 키보드 ───────────────────────────────────────────
  const navigate = (key) => {
    const pos = layoutRef.current.pos;
    const p = pos.get(selectedId);
    if (!p) return select(root.id, true);
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
        .filter((q) => q.depth === p.depth && q.side === p.side)
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
      if (id && find(mapRef.current.root, id)) addNode(id, false);
    }
  };

  // ── 렌더 ─────────────────────────────────────────────
  const nodes = [...layout.pos.values()];
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
        <button className="icon-btn" onClick={onBack} aria-label="정원으로" data-tip="정원으로 돌아가기"><ArrowLeft size={20} /></button>
        {map.parent && mapTitles.has(map.parent.mapId) && (
          <button className="parent-chip" onClick={() => jump(map.parent.mapId)} data-tip="이 가지가 뻗어 나온 원래 마인드맵으로 이동">
            <CornerLeftUp size={15} /><span>{mapTitles.get(map.parent.mapId)}</span>
          </button>
        )}
        <h1 className="map-title">{titleOf(map)}</h1>
        {total.total > 0 && (
          <button className="progress-pill" onClick={() => setSheet(sheet === 'tasks' ? null : 'tasks')} data-tip="끝낸 할 일 / 전체 할 일 · 누르면 할 일 목록">
            <span className="bar"><i style={{ width: `${(total.done / total.total) * 100}%` }} /></span>
            {total.done}/{total.total}
          </button>
        )}
        <button className="icon-btn" onClick={undo} disabled={!undoRef.current.length} aria-label="실행 취소" data-tip="실행 취소 (Ctrl+Z)"><Undo2 size={19} /></button>
        <button className="icon-btn" onClick={redo} disabled={!redoRef.current.length} aria-label="다시 실행" data-tip="다시 실행 (Ctrl+Shift+Z)"><Redo2 size={19} /></button>
        <button className={`icon-btn ${sheet === 'tasks' ? 'on' : ''}`} onClick={() => setSheet(sheet === 'tasks' ? null : 'tasks')} aria-label="할 일 목록" data-tip="할 일 목록 보기: 상태별로 모아 보고 가지로 이동"><ListTodo size={19} /></button>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="더 보기" data-tip="더 보기: 펼침 방향, 모두 접기·펼치기, 식물로 보기, 구역 바꾸기, 내보내기"><MoreVertical size={19} /></button>
        {menu && (
          <Menu
            onClose={() => setMenu(false)}
            items={[
              { label: map.layout === 'right' ? '양쪽으로 펼치기' : '오른쪽으로만 펼치기', run: () => { onChange({ ...mapRef.current, layout: map.layout === 'right' ? 'both' : 'right' }); setTimeout(() => fit(), 0); } },
              { label: '모두 펼치기', run: () => setAllCollapsed(false) },
              { label: '모두 접기', run: () => setAllCollapsed(true) },
              { label: '화면에 맞추기', run: () => fit() },
              { label: `${CATEGORIES[categoryOf(map)].plantName}로 보기`, run: onShowPlant },
              { label: map.completedAt ? '완료 취소' : '프로젝트 완료', run: onToggleDone },
              { label: `구역 바꾸기 (지금: ${CATEGORIES[categoryOf(map)].zone})`, run: onPickCategory },
              { label: '이 마인드맵 내보내기 (JSON)', run: onExport },
            ]}
          />
        )}
      </header>

      <div className="stage">
        <div
          ref={canvasRef}
          className={`canvas ${drag ? 'dragging' : ''}`}
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.k}px ${24 * view.k}px` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endPointer(e, false)}
          onPointerCancel={(e) => endPointer(e, true)}
        >
          <div className={`world ${anim ? 'anim' : ''}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
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
                n.status === 'done' && 'done',
                drag?.targetId === n.id && 'drop',
                drag?.sub.has(n.id) && 'ghost',
              ].filter(Boolean).join(' ');
              return (
                <React.Fragment key={n.id}>
                  <div
                    data-id={n.id}
                    className={cls}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h, padding: `${s.pad.y}px ${s.pad.x}px`, '--c': p.color || 'var(--accent)' }}
                  >
                    {n.status && <span className={`st ${n.status}`} data-st="1" data-tip={`${STATUS_LABEL[n.status]} · 누르면 다음 상태로`}><StatusIcon status={n.status} /></span>}
                    {n.link && mapTitles.has(n.link) && (
                      <span className="jump" data-jump={n.link} data-tip="이 가지를 심은 마인드맵으로 이동"><ArrowUpRight size={15} /></span>
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
                  {p.depth > 0 && n.children.length > 0 && (
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
          <button onClick={() => fit()} aria-label="화면에 맞추기" data-tip="마인드맵 전체가 보이게 맞추기"><Maximize size={18} /></button>
        </div>

        {!selected && !sheet && (
          !map.completedAt && total.total > 0 && total.done === total.total ? (
            <button className="hint plant-cta" onClick={onToggleDone}>
              할 일을 모두 끝냈어요 · 프로젝트 완료하기
            </button>
          ) : (
            <div className="hint">{map.completedAt ? '완료한 프로젝트 · 정원에서 다 자란 모습을 볼 수 있어요' : '가지를 눌러 선택 · 두 번 눌러 이름 수정 · 길게 눌러 옮기기'}</div>
          )
        )}

        {selected && (
          <div className="toolbar">
            <button onClick={() => addNode(selectedId, false)} data-tip="하위 가지 추가 (Tab)"><CornerDownRight size={19} /><span>하위</span></button>
            {selected.parent && <button onClick={() => addNode(selectedId, true)} data-tip="같은 단계에 가지 추가 (Enter)"><Plus size={19} /><span>형제</span></button>}
            <button onClick={() => startEdit(selectedId)} data-tip="이름 수정 (F2 또는 두 번 누르기)"><Pencil size={18} /><span>수정</span></button>
            {selected.parent && (selected.node.link && mapTitles.has(selected.node.link) ? (
              <button className="on" onClick={() => jump(selected.node.link)} data-tip="이 가지를 심은 마인드맵 열기"><ArrowUpRight size={19} /><span>열기</span></button>
            ) : (
              <button onClick={() => plantBranch(selectedId)} data-tip="이 가지를 새 마인드맵으로 심기: 하위 가지가 새 마인드맵으로 옮겨집니다"><Sprout size={19} /><span>심기</span></button>
            ))}
            <button onClick={() => cycleStatus(selectedId)} className={selected.node.status ? `st ${selected.node.status}` : ''} data-tip="상태 바꾸기: 없음 → 할 일 → 진행 중 → 완료">
              <StatusIcon status={selected.node.status} size={19} />
              <span>{selected.node.status ? STATUS_LABEL[selected.node.status] : '상태'}</span>
            </button>
            <button onClick={() => { revealRef.current = selectedId; setSheet(sheet === 'detail' ? null : 'detail'); }} className={sheet === 'detail' ? 'on' : ''} data-tip="상세: 상태, 마감일, 메모, 가지 색, 순서"><SlidersHorizontal size={18} /><span>상세</span></button>
            {selected.parent && <button onClick={() => askRemove(selectedId)} className="danger" data-tip="삭제 (Delete): 하위 가지가 있으면 범위를 고릅니다"><Trash2 size={18} /><span>삭제</span></button>}
          </div>
        )}

        {delAsk && selected && delAsk === selectedId && (
          <div className="del-choice" role="dialog" aria-label="삭제 범위 선택">
            <p>‘{selected.node.text.split('\n')[0] || '제목 없음'}’ 아래에 가지가 {countNodes(selected.node) - 1}개 있어요.</p>
            <button className="ghost-btn" onClick={() => removeNode(delAsk, false)}>이 가지만 삭제 <small>하위 가지는 한 단계 위로</small></button>
            <button className="ghost-btn danger" onClick={() => removeNode(delAsk, true)}>하위 가지까지 모두 삭제 <small>{countNodes(selected.node)}개</small></button>
            <button className="text-btn" onClick={() => setDelAsk(null)}>취소</button>
          </div>
        )}

        {sheet === 'detail' && selected && (
          <DetailSheet
            key={selectedId}
            node={selected.node}
            isRoot={!selected.parent}
            canUp={selected.index > 0}
            canDown={!!selected.parent && selected.index < selected.parent.children.length - 1}
            onPatch={(patch) => patchNode(selectedId, patch)}
            onReorder={(dir) => reorder(selectedId, dir)}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'tasks' && (
          <TasksSheet root={root} onCycle={cycleStatus} onFocus={focusNode} onClose={() => setSheet(null)} />
        )}

        {sheet === 'send' && (
          <CopySheet root={root} defaultKind={categoryOf(map) === 'app' ? 'app' : 'report'} branch={selected && selected.parent ? selected.node : null} onClose={() => setSheet(null)} />
        )}
        {sheet === 'calendar' && (
          <CalendarSheet root={root} onFocus={focusNode} onClose={() => setSheet(null)} />
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
