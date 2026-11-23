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

// 씨앗 종류: 정원에서 어떤 식물로 자랄지 정한다 (키는 예전 저장 데이터와 맞추기 위해 그대로 둔다)
export const CATEGORIES = {
  app: { label: '나무', plant: 'tree', plantName: '나무', desc: '가지는 가지로, 맨 끝 항목은 잎으로 자라요.' },
  business: { label: '열매 나무', plant: 'fruit', plantName: '열매 나무', desc: '나무처럼 자라고, 끝낸 일마다 열매가 달려요.' },
  personal: { label: '꽃', plant: 'flower', plantName: '꽃', desc: '가지 하나가 꽃잎 하나가 돼요.' },
  free: { label: '덤불', plant: 'bush', plantName: '덤불', desc: '가지 하나가 덩이 하나, 끝낸 일은 열매가 돼요.' },
};
/** 받침 유무에 맞는 조사를 붙인다: josa('꽃', '을', '를') → '꽃을' */
export const josa = (word, withFinal, without) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : without);
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES);
export const categoryOf = (map) => (CATEGORIES[map.category] ? map.category : 'free');

/** 고른 씨앗으로 심을 빈 마인드맵 */
export function newMapIn(category) {
  const map = makeMap();
  map.category = category;
  return map;
}

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
    ...(CATEGORIES[raw.category] ? { category: raw.category } : {}),
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
function sampleMap() {
  const day = (offset) => {
    const d = new Date(Date.now() + offset * 86400000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const n = (text, extra, children = []) => ({ ...makeNode(text, extra), children });
  const map = makeMap('웹사이트 리뉴얼');
  map.category = 'business';
  // 예시는 기기마다 따로 만들어지므로, 동기화할 때 하나로 합쳐지도록 같은 id와 가장 오래된 수정 시각을 준다
  map.id = 'sample-website';
  map.updatedAt = 1;
  map.root.children = [
    n('기획', {}, [
      n('목표 정리', { status: 'done' }),
      n('경쟁 사이트 조사', { status: 'done', note: '3곳 비교: 메뉴 구조, 첫 화면, 문의 동선' }),
      n('사이트맵 확정', { status: 'doing', due: day(2) }),
    ]),
    n('디자인', {}, [
      n('무드보드', { status: 'done' }),
      n('메인 시안', { status: 'doing', due: day(5) }),
      n('모바일 시안', { status: 'todo' }),
    ]),
    n('개발', {}, [
      n('프론트엔드', {}, [n('메인 페이지', { status: 'todo' }), n('문의 폼', { status: 'todo' })]),
      n('콘텐츠 이전', { status: 'todo' }),
    ]),
    n('출시', {}, [n('최종 점검', { status: 'todo', due: day(14) }), n('공지 올리기', { status: 'todo' })]),
  ];
  return map;
}

export function loadMaps() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.maps)) return data.maps.filter((m) => m?.id && m?.root?.children);
    }
  } catch {
    /* 손상된 데이터는 무시하고 새로 시작 */
  }
  return [sampleMap()];
}

export function saveMaps(maps) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, maps }));
    return true;
  } catch {
    return false;
  }
}
