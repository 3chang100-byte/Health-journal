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

// 프로젝트 주제 = 정원 구역 = 식물 종류
export const CATEGORIES = {
  app: { label: '앱 만들기', zone: '앱 만들기', plant: 'tree', plantName: '나무', desc: '아이디어를 정리해 Claude에 붙여 넣으면 앱 제작을 시작할 수 있어요. 정원에 나무로 자라요.' },
  business: { label: '사업 확장', zone: '사업 확장', plant: 'fruit', plantName: '열매 나무', desc: '목표·고객·마케팅·실행 계획을 한 장에. 정원에 열매 나무로 자라요.' },
  personal: { label: '개인 프로젝트', zone: '개인 정원', plant: 'flower', plantName: '꽃', desc: '하고 싶은 일을 목표와 첫 걸음으로. 정원에 꽃으로 자라요.' },
  free: { label: '자유 프로젝트', zone: '기타', plant: 'bush', plantName: '덤불', desc: '빈 마인드맵에서 자유롭게 시작합니다. 정원에 덤불로 자라요.' },
};
/** 받침 유무에 맞는 조사를 붙인다: josa('꽃', '을', '를') → '꽃을' */
export const josa = (word, withFinal, without) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : without);
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES);
export const categoryOf = (map) => (CATEGORIES[map.category] ? map.category : 'free');

const T = (text, children = [], extra = {}) => ({ ...makeNode(text, extra), children });
const TEMPLATES = {
  app: () => ['새 앱 프로젝트', [
    T('목적', [T('누가 쓰나요'), T('어떤 문제를 해결하나요')]),
    T('핵심 기능', [T('꼭 필요한 기능', [], { status: 'todo' }), T('있으면 좋은 기능')]),
    T('화면 구성', [T('첫 화면'), T('주요 화면')]),
    T('데이터', [T('저장할 정보')]),
    T('만들기', [T('Claude에 붙여 넣어 첫 버전 만들기', [], { status: 'todo', note: '왼쪽 아래 ‘요약 복사’ → ‘앱 만들기’ → ‘전체 복사’ 후 Claude에 붙여 넣기' }), T('써 보고 고칠 점 적기', [], { status: 'todo' })]),
  ]],
  business: () => ['새 사업 프로젝트', [
    T('목표', [T('매출·고객 목표'), T('기한')]),
    T('고객', [T('누구에게 파나요'), T('고객이 원하는 것')]),
    T('상품·서비스', [T('지금 있는 것'), T('새로 더할 것')]),
    T('마케팅', [T('알릴 채널'), T('첫 홍보', [], { status: 'todo' })]),
    T('운영', [T('필요한 사람'), T('비용')]),
    T('실행 계획', [T('이번 달 할 일', [], { status: 'todo' })]),
  ]],
  personal: () => ['새 개인 프로젝트', [
    T('왜 하고 싶은가'),
    T('목표', [T('끝났을 때의 모습')]),
    T('준비', [T('필요한 것'), T('도와줄 사람')]),
    T('실행', [T('첫 걸음', [], { status: 'todo' }), T('다음 걸음', [], { status: 'todo' })]),
    T('기록', [T('배운 점')]),
  ]],
  free: () => ['새 프로젝트', []],
};

export function fromTemplate(category) {
  const [title, children] = TEMPLATES[category]();
  const map = makeMap(title);
  map.category = category;
  map.root.children = children;
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

export function stats(root) {
  const s = { nodes: 0, total: 0, done: 0, doing: 0, todo: 0 };
  walk(root, (n) => {
    s.nodes++;
    if (n.status) {
      s.total++;
      s[n.status]++;
    }
  });
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
