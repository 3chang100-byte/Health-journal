// Claude에 붙여 넣을 글 만들기와 캘린더 내보내기
import { stats, todayStr, walk } from './store.js';

const MARK = { todo: '[ ] ', doing: '[~] ', done: '[x] ' };
const oneLine = (s) => (s || '').trim().replace(/\s*\n\s*/g, ' / ') || '제목 없음';

export function toOutline(node, depth = 0) {
  const pad = '  '.repeat(depth);
  const lines = [`${pad}- ${MARK[node.status] || ''}${oneLine(node.text)}${node.due ? ` (마감 ${node.due})` : ''}`];
  if (node.note) for (const l of node.note.trim().split('\n')) lines.push(`${pad}  > ${l}`);
  for (const c of node.children) lines.push(toOutline(c, depth + 1));
  return lines.join('\n');
}

const INSTRUCTIONS = {
  app: [
    '아래 마인드맵은 내가 만들려는 앱(프로젝트)의 구상입니다. 이 내용을 바탕으로 앱을 만들어 주세요.',
    '',
    '1. 먼저 마인드맵을 정리해 목적, 핵심 기능, 화면 구성, 데이터 구조를 짧게 요약해 주세요.',
    '2. 빠진 부분은 합리적으로 가정하고, 가정한 내용을 목록으로 알려 주세요.',
    '3. 그다음 실제로 동작하는 첫 버전을 만들어 주세요. 완료([x]) 항목은 이미 끝난 일이니 참고만 하고, 할 일([ ])과 진행 중([~]) 항목을 우선해 주세요.',
  ],
  report: [
    '아래 마인드맵 내용을 정리해 요약 보고서를 작성해 주세요.',
    '',
    '- 구성: 제목, 한 문단 개요, 가지별 핵심 내용, 진행 현황(완료·진행 중·할 일 개수와 진행률), 일정(마감일 순 표), 위험 요소와 다음 단계',
    '- 마인드맵에 없는 사실은 지어내지 말고, 추정한 내용은 추정이라고 표시해 주세요.',
    '- 바로 공유할 수 있는 읽기 좋은 보고서 문서로 만들어 주세요.',
  ],
};

function summaryLines(node) {
  const s = stats(node);
  const lines = [`- 가지 ${s.nodes - 1}개`];
  if (s.total) {
    lines.push(`- 할 일 ${s.total}개: 완료 ${s.done} · 진행 중 ${s.doing} · 남은 일 ${s.todo} (진행률 ${Math.round((s.done / s.total) * 100)}%)`);
  }
  const due = datedItems(node).filter((it) => it.status !== 'done').slice(0, 5);
  if (due.length) lines.push(`- 다가오는 일정: ${due.map((it) => `${it.date} ${it.title}`).join(', ')}`);
  return lines.join('\n');
}

/** Claude에 붙여 넣을 글: 지시문 + 요약 + 정리한 마인드맵 */
export function buildPrompt(kind, node) {
  return [
    INSTRUCTIONS[kind].join('\n'),
    '',
    `## 마인드맵: ${oneLine(node.text)}`,
    '',
    '### 요약',
    summaryLines(node),
    '',
    '### 내용',
    '표기: [ ] 할 일 · [~] 진행 중 · [x] 완료 · (마감 날짜) · > 메모',
    '',
    toOutline(node),
  ].join('\n');
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 이름에 적힌 날짜는 앞에 따로 쓰므로 제목에서는 뺀다
const withoutDate = (title) =>
  title
    .replace(/\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}\.?|\d{4}년\s*\d{1,2}월\s*\d{1,2}일|\d{1,2}월\s*\d{1,2}일|(?<![\d/.])\d{1,2}\/\d{1,2}(?![\d/.])/, '')
    .replace(/^[\s,·:()\-–~]+|[\s,·:(\-–~]+$/g, '')
    .replace(/\s{2,}/g, ' ') || title;

/** 상대에게 메시지로 보낼 수 있는 짧은 일정 안내: 날짜순, 끝낸 일정은 빼고 한 줄에 하나씩 */
export function buildSchedule(node, today = todayStr()) {
  const title = oneLine(node.text);
  const items = datedItems(node).filter((it) => it.status !== 'done');
  if (!items.length) {
    return `[${title}] 안내할 일정이 없습니다.\n\n가지의 ‘상세’에서 마감일을 정하거나, 이름에 ‘12/3’, ‘12월 3일’처럼 날짜를 적으면 여기에 정리됩니다.`;
  }
  const year = today.slice(0, 4);
  const line = (it) => {
    const [y, m, d] = it.date.split('-').map(Number);
    const day = `${String(y) === year ? '' : `${y}/`}${m}/${d}(${WEEK[new Date(`${it.date}T00:00:00`).getDay()]})`;
    const out = [`· ${day} ${withoutDate(it.title)}${it.date === today ? ' (오늘)' : ''}`];
    const subs = it.node.children.map((c) => oneLine(c.text));
    if (subs.length) out.push(`   - ${subs.slice(0, 5).join(', ')}${subs.length > 5 ? ` 외 ${subs.length - 5}건` : ''}`);
    return out.join('\n');
  };
  const late = items.filter((it) => it.date < today);
  const coming = items.filter((it) => it.date >= today);
  const parts = [`[${title}] 일정 안내`];
  if (coming.length) parts.push('', ...coming.map(line));
  if (late.length) parts.push('', '※ 날짜가 지난 일정', ...late.map(line));
  return parts.join('\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// ── 날짜 ─────────────────────────────────────────────────
const p2 = (n) => String(n).padStart(2, '0');
const valid = (y, m, d) => {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

/** 가지 이름에 적힌 날짜를 찾는다: 2026-12-03, 2026.12.3, 2026년 12월 3일, 12월 3일, 12/3 */
export function dateInText(text, now = new Date()) {
  let y = null;
  let m;
  let d;
  let hit =
    text.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/) ||
    text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else {
    hit = text.match(/(\d{1,2})월\s*(\d{1,2})일/) || text.match(/(?<![\d/.])(\d{1,2})\/(\d{1,2})(?![\d/.])/);
    if (!hit) return null;
    [m, d] = [Number(hit[1]), Number(hit[2])];
    y = now.getFullYear();
    // 연도가 없는 날짜가 두 달 넘게 지났으면 내년으로 본다
    if (valid(y, m, d) && new Date(y, m - 1, d) < new Date(now.getTime() - 60 * 86400000)) y += 1;
  }
  return valid(y, m, d) ? `${y}-${p2(m)}-${p2(d)}` : null;
}

export function datedItems(root) {
  const items = [];
  const path = [];
  const rec = (n) => {
    const fromText = n.due ? null : dateInText(n.text);
    const date = n.due || fromText;
    if (date) {
      items.push({ node: n, id: n.id, title: oneLine(n.text), date, fromText: !!fromText, path: path.slice().join(' › '), note: n.note || '', status: n.status });
    }
    path.push(oneLine(n.text));
    n.children.forEach(rec);
    path.pop();
  };
  rec(root);
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

const compact = (date) => date.replace(/-/g, '');
const nextDay = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return `${n.getUTCFullYear()}${p2(n.getUTCMonth() + 1)}${p2(n.getUTCDate())}`;
};
const describe = (it) => [it.path && `마인드맵: ${it.path}`, it.note].filter(Boolean).join('\n');

export function googleCalUrl(it) {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: it.title,
    dates: `${compact(it.date)}/${nextDay(it.date)}`,
    details: describe(it),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// iCalendar 한 줄은 75바이트까지: 넘으면 다음 줄을 공백으로 시작해 이어 쓴다
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 73) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

export function buildIcs(items) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//project-mindmap//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const it of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.id}-${compact(it.date)}@project-mindmap`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(it.date)}`,
      `DTEND;VALUE=DATE:${nextDay(it.date)}`,
      `SUMMARY:${esc(it.title)}`,
    );
    const desc = describe(it);
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export const countNodes = (node) => {
  let c = 0;
  walk(node, () => c++);
  return c;
};
