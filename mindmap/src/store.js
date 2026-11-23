// 데이터 모델 · 저장 · 트리 유틸
const KEY = 'project-mindmap.v1';

export const STATUSES = ['todo', 'doing', 'done'];
export const STATUS_LABEL = { todo: '할 일', doing: '진행 중', done: '완료' };
export const PALETTE = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#e03131', '#0c8599', '#f08c00', '#5f3dc4'];

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const makeNode = (text = '', extra = {}) => ({ id: uid(), text, children: [], ...extra });

export const makeMap = (title = '새 프로젝트') => ({
  id: uid(),
  layout: 'both',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  root: makeNode(title),
});

export const titleOf = (map) => (map.root.text || '').trim().split('\n')[0] || '제목 없음';

export function find(root, id) {
  const stack = [{ node: root, parent: null, index: 0 }];
  while (stack.length) {
    const cur = stack.pop();
    if (cur.node.id === id) return cur;
    cur.node.children.forEach((c, i) => stack.push({ node: c, parent: cur.node, index: i }));
  }
  return null;
}

export function walk(node, fn, parent = null, depth = 0) {
  fn(node, parent, depth);
  for (const c of node.children) walk(c, fn, node, depth + 1);
}

const resolvedCache = new WeakMap();
/**
 * 화면에 보여 줄 때 쓰는 사본: 완료한 가지 아래의 가지는 모두 완료로 처리한다.
 * 상위가 완료라서 완료가 된 가지에는 doneBy 표시가 붙는다. 저장되는 원본은 바꾸지 않는다.
 */
export function resolved(root) {
  const hit = resolvedCache.get(root);
  if (hit) return hit;
  const rec = (n, inherited) => {
    const copy = { ...n };
    if (inherited) {
      copy.doneBy = true;
      if (n.status) copy.status = 'done';
    }
    const pass = inherited || n.status === 'done';
    copy.children = n.children.map((c) => rec(c, pass));
    return copy;
  };
  const out = rec(root, false);
  resolvedCache.set(root, out);
  resolvedCache.set(out, out);
  return out;
}

/** 가지 수와 할 일 진행. 완료한 가지 아래의 할 일은 완료로 센다 */
export function stats(root) {
  const s = { nodes: 0, total: 0, done: 0, doing: 0, todo: 0 };
  const rec = (n, inherited) => {
    s.nodes++;
    if (n.status) {
      s.total++;
      s[inherited ? 'done' : n.status]++;
    }
    const pass = inherited || n.status === 'done';
    for (const c of n.children) rec(c, pass);
  };
  rec(root, false);
  return s;
}

export function reId(node) {
  node.id = uid();
  node.children.forEach(reId);
  return node;
}

export const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const fmtDue = (due) => {
  const [, m, d] = due.split('-');
  return `${Number(m)}/${Number(d)}`;
};

// ── 가져오기 검증 ─────────────────────────────────────────
function cleanNode(raw, budget) {
  if (!raw || typeof raw !== 'object' || budget.left-- <= 0) return null;
  const n = makeNode(typeof raw.text === 'string' ? raw.text.slice(0, 2000) : '');
  if (STATUSES.includes(raw.status)) n.status = raw.status;
  if (typeof raw.note === 'string' && raw.note) n.note = raw.note.slice(0, 20000);
  if (typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due)) n.due = raw.due;
  if (typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)) n.color = raw.color;
  if (raw.collapsed === true) n.collapsed = true;
  if (typeof raw.link === 'string' && raw.link.length < 64) n.link = raw.link;
  if (Array.isArray(raw.children)) {
    n.children = raw.children.map((c) => cleanNode(c, budget)).filter(Boolean);
  }
  return n;
}

function cleanMap(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const root = cleanNode(raw.root, { left: 20000 });
  if (!root) return null;
  delete root.collapsed;
  return {
    id: uid(),
    layout: raw.layout === 'right' ? 'right' : 'both',
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    ...(Number(raw.completedAt) > 0 ? { completedAt: Number(raw.completedAt) } : {}),
    ...(typeof raw.parent?.mapId === 'string' ? { parent: { mapId: raw.parent.mapId } } : {}),
    oldId: typeof raw.id === 'string' ? raw.id : null,
    root,
  };
}

/** JSON 문자열 → 마인드맵 배열 (형식이 맞지 않으면 예외) */
export function parseImport(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data?.maps) ? data.maps : data?.root ? [data] : null;
  if (!list) throw new Error('마인드맵 파일 형식이 아닙니다.');
  const maps = list.map(cleanMap).filter(Boolean);
  if (!maps.length) throw new Error('가져올 마인드맵이 없습니다.');
  // 가져오면서 id가 새로 매겨지므로, 마인드맵끼리 이어진 연결도 새 id로 옮긴다
  const renamed = new Map(maps.filter((m) => m.oldId).map((m) => [m.oldId, m.id]));
  for (const m of maps) {
    delete m.oldId;
    if (m.parent) {
      if (renamed.has(m.parent.mapId)) m.parent.mapId = renamed.get(m.parent.mapId);
      else delete m.parent;
    }
    walk(m.root, (n) => {
      if (!n.link) return;
      if (renamed.has(n.link)) n.link = renamed.get(n.link);
      else delete n.link;
    });
  }
  return maps;
}

export const exportPayload = (maps) =>
  JSON.stringify({ app: 'project-mindmap', version: 1, exportedAt: new Date().toISOString(), maps }, null, 2);

export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 저장 ─────────────────────────────────────────────────
/**
 * 마인드맵마다 캔버스 위 자리(root.pos)가 있어야 한다. 자리가 없는 것(이전 버전에서 만든 것,
 * 다른 기기에서 넘어온 것)은 이미 있는 마인드맵들의 오른쪽에 나란히 놓는다. 바꿀 것이 없으면 같은 배열을 돌려준다.
 */
export function withPositions(maps) {
  if (maps.every((m) => m.root.pos)) return maps;
  let x = maps.reduce((mx, m) => (m.root.pos ? Math.max(mx, m.root.pos.x + 1100) : mx), 0);
  return maps.map((m) => {
    if (m.root.pos) return m;
    const placed = { ...m, root: { ...m.root, pos: { x, y: 0 } } };
    x += 1100;
    return placed;
  });
}

/** 처음 여는 기기의 빈 작업공간. 동기화로 다른 기기의 내용이 들어오면 손대지 않은 이 빈 마인드맵은 자리를 비켜 준다 */
function firstMap() {
  const map = makeMap('새 프로젝트');
  map.id = 'first';
  map.updatedAt = 1;
  map.root.pos = { x: 0, y: 0 };
  return map;
}
export const isUntouchedFirst = (m) => m.id === 'first' && m.updatedAt === 1 && !m.root.children.length;

export function loadMaps() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.maps)) {
        const maps = data.maps.filter((m) => m?.id && m?.root?.children);
        // '새 프로젝트'가 캔버스의 기준 자리(0,0)에 오도록 맨 앞에 둔다
        maps.sort((a, b) => (titleOf(b) === '새 프로젝트') - (titleOf(a) === '새 프로젝트'));
        return withPositions(maps);
      }
    }
  } catch {
    /* 손상된 데이터는 무시하고 새로 시작 */
  }
  return [firstMap()];
}

export function saveMaps(maps) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, maps }));
    return true;
  } catch {
    return false;
  }
}
