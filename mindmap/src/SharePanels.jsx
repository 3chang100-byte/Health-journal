import React, { useMemo, useState } from 'react';
import { Monitor, Terminal, Copy, CalendarPlus, ExternalLink, Send, RefreshCw, Plus, X } from 'lucide-react';
import { Sheet } from './Panels.jsx';
import { download, todayStr } from './store.js';
import { buildIcs, buildPrompt, copyText, datedItems, googleCalUrl, sendLink } from './share.js';

const hosted = () => !!window.MINDMAP_HOST?.noDownload;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 저장해 둔 채팅방(이름 + 주소). 이 기기에만 보관한다.
const ROOMS_KEY = 'project-mindmap.rooms';
const loadRooms = () => {
  try {
    const v = JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((r) => r && typeof r.url === 'string' && typeof r.name === 'string') : [];
  } catch {
    return [];
  }
};
const storeRooms = (rooms) => {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  } catch {
    /* 저장하지 못해도 이번 화면에서는 그대로 쓸 수 있다 */
  }
};
const claudeUrl = (raw) => {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' && (u.hostname === 'claude.ai' || u.hostname.endsWith('.claude.ai')) ? u.href : null;
  } catch {
    return null;
  }
};

// 연결 오류는 원인마다 해결 방법이 다르므로 코드별로 안내한다
const ROOM_ERRORS = {
  needs_reauth: 'Claude 연결이 만료됐어요. claude.ai 설정 → 커넥터에서 Claude Code Remote를 다시 연결해 주세요.',
  server_not_connected: 'claude.ai 설정 → 커넥터에서 Claude Code Remote를 추가하면 채팅방을 불러올 수 있어요.',
  selection_required: '같은 이름의 커넥터가 여러 개예요. claude.ai에서 사용할 커넥터를 고른 뒤 다시 시도해 주세요.',
  not_in_manifest: '이 페이지에서 채팅방 연결을 허용하지 않았어요. 페이지의 권한 메뉴에서 허용하면 쓸 수 있습니다.',
  consent_required: '이 페이지에서 채팅방 연결을 허용하지 않았어요. 다시 눌러 허용해 주세요.',
  approval_required: '승인이 필요해요. 다시 눌러 승인해 주세요.',
  blocked_by_policy: '조직 정책으로 이 기능을 쓸 수 없어요. 아래에 채팅방 주소를 추가해 쓰세요.',
  server_unavailable: 'Claude에 잠시 연결할 수 없어요. 조금 뒤에 다시 시도해 주세요.',
  unavailable: '이 화면에서는 채팅방 목록을 불러올 수 없어요. 아래에 채팅방 주소를 추가해 쓰세요.',
};
const roomError = (e) => ROOM_ERRORS[e?.code] || (e?.code === 'tool_error' && e.message) || '채팅방 연결에 실패했어요. 다시 시도하거나 아래에 채팅방 주소를 추가해 쓰세요.';

const shortDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

export function SendSheet({ root, branch, onClose }) {
  const [kind, setKind] = useState('report');
  const [onlyBranch, setOnlyBranch] = useState(false);
  const [sent, setSent] = useState(null); // { tone: 'ok' | 'warn', text }
  const [dest, setDest] = useState('new'); // 'new' | 'live:<id>' | 'saved:<url>'
  const [saved, setSaved] = useState(loadRooms);
  const [live, setLive] = useState(null); // 불러온 내 채팅방 목록
  const [busy, setBusy] = useState(null); // 'list' | 'send'
  const [liveError, setLiveError] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', url: '' });
  const [draftError, setDraftError] = useState('');

  const bridge = window.MINDMAP_HOST?.rooms || null;
  const node = branch && onlyBranch ? branch : root;
  const prompt = useMemo(() => buildPrompt(kind, node), [kind, node]);
  const links = useMemo(() => ({ cowork: sendLink('cowork', prompt), code: sendLink('code', prompt) }), [prompt]);
  const liveRoom = dest.startsWith('live:') ? (live || []).find((r) => `live:${r.id}` === dest) : null;
  const savedRoom = dest.startsWith('saved:') ? saved.find((r) => `saved:${r.url}` === dest) : null;
  const reset = () => setSent(null);

  // 새 채팅방: 링크가 열리는 것과 별개로 항상 전체 내용을 클립보드에 넣어 둔다
  const go = async (target) => {
    const copied = await copyText(prompt.text);
    const name = { cowork: '코워크', code: '클로드 코드' }[target];
    if (target === 'copy') {
      setSent(copied ? { tone: 'ok', text: '내용을 복사했어요.' } : { tone: 'warn', text: '복사하지 못했어요. 미리보기를 열어 직접 복사해 주세요.' });
    } else if (target === 'saved') {
      setSent(copied
        ? { tone: 'ok', text: '채팅방을 새 탭에서 열었어요. 내용을 복사해 두었으니 입력란에 붙여 넣고 보내세요.' }
        : { tone: 'warn', text: '채팅방은 열었지만 복사하지 못했어요. 미리보기를 열어 직접 복사해 주세요.' });
    } else if (links[target].full) {
      setSent({ tone: 'ok', text: `${name} 입력란에 내용이 채워집니다. 확인한 뒤 보내기를 누르세요.${copied ? ' 채워지지 않으면 붙여 넣으세요(복사해 두었어요).' : ''}` });
    } else {
      setSent({ tone: 'warn', text: `마인드맵이 길어 지시문만 채워집니다. ${name} 입력란에 붙여 넣은 뒤 보내세요${copied ? '(전체 내용을 복사해 두었어요).' : '. 복사하지 못했으니 미리보기에서 직접 복사해 주세요.'}` });
    }
  };

  const loadLive = async () => {
    setBusy('list');
    setLiveError('');
    try {
      setLive(await bridge.list());
    } catch (e) {
      setLiveError(roomError(e));
    }
    setBusy(null);
  };

  const sendLive = async () => {
    setBusy('send');
    reset();
    try {
      await bridge.send(liveRoom.id, prompt.text);
      setSent({ tone: 'ok', text: `‘${liveRoom.title}’ 채팅방으로 보냈어요. 그 채팅방에서 작업이 시작됩니다.` });
    } catch (e) {
      // 시간 초과 등은 실제로 전송됐을 수도 있으므로 다시 누르기 전에 확인하게 한다
      const unsure = e?.code === 'server_unavailable' || e?.code === 'upstream_error';
      setSent({ tone: 'warn', text: unsure ? '전송 결과를 확인하지 못했어요. 채팅방을 먼저 확인한 뒤 필요하면 다시 보내세요.' : roomError(e) });
    }
    setBusy(null);
  };

  const addRoom = (e) => {
    e.preventDefault();
    const url = claudeUrl(draft.url);
    if (!url) return setDraftError('claude.ai 채팅방 주소를 붙여 넣어 주세요. (예: https://claude.ai/code/session_…)');
    const name = draft.name.trim() || '이름 없는 채팅방';
    const next = [{ name, url }, ...saved.filter((r) => r.url !== url)].slice(0, 20);
    setSaved(next);
    storeRooms(next);
    setDest(`saved:${url}`);
    setDraft({ name: '', url: '' });
    setDraftError('');
    setAdding(false);
    reset();
  };

  const removeRoom = (url) => {
    const next = saved.filter((r) => r.url !== url);
    setSaved(next);
    storeRooms(next);
    if (dest === `saved:${url}`) setDest('new');
  };

  const Room = ({ value, title, sub, onRemove }) => (
    <div className={`room ${dest === value ? 'on' : ''}`}>
      <label>
        <input type="radio" name="send-room" id={`room-${value}`} checked={dest === value} onChange={() => { setDest(value); reset(); }} />
        <span className="room-text"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      </label>
      {onRemove && <button className="icon-btn" onClick={onRemove} aria-label={`${title} 삭제`}><X size={16} /></button>}
    </div>
  );

  return (
    <Sheet title="Claude로 보내기" onClose={onClose}>
      <label className="field-label">무엇을 만들까요</label>
      <div className="segmented two">
        <button className={kind === 'report' ? 'on' : ''} onClick={() => { setKind('report'); reset(); }}>요약 보고서</button>
        <button className={kind === 'app' ? 'on' : ''} onClick={() => { setKind('app'); reset(); }}>앱 만들기</button>
      </div>

      {branch && (
        <label className="check">
          <input id="only-branch" type="checkbox" checked={onlyBranch} onChange={(e) => { setOnlyBranch(e.target.checked); reset(); }} />
          선택한 가지 ‘{branch.text.split('\n')[0] || '제목 없음'}’만 보내기
        </label>
      )}

      <label className="field-label">어느 채팅방으로 보낼까요</label>
      <div className="rooms" role="radiogroup" aria-label="보낼 채팅방">
        <Room value="new" title="새 채팅방" sub="코워크 또는 클로드 코드에서 새로 시작" />
        {(live || []).map((r) => (
          <Room key={r.id} value={`live:${r.id}`} title={r.title} sub={[r.kind, r.updated && `${shortDate(r.updated)} 대화`].filter(Boolean).join(' · ')} />
        ))}
        {saved.map((r) => (
          <Room key={r.url} value={`saved:${r.url}`} title={r.name} sub="저장한 주소 · 열어서 붙여 넣기" onRemove={() => removeRoom(r.url)} />
        ))}
      </div>
      {live && live.length === 0 && <p className="fine">진행 중인 채팅방이 없어요.</p>}
      {liveError && <p className="send-status warn" role="status">{liveError}</p>}

      <div className="room-tools">
        {bridge && (
          <button className="ghost-btn" disabled={busy === 'list'} onClick={loadLive}>
            <RefreshCw size={15} /> {busy === 'list' ? '불러오는 중…' : live ? '채팅방 새로 고침' : '내 채팅방 불러오기'}
          </button>
        )}
        <button className="ghost-btn" onClick={() => { setAdding(!adding); setDraftError(''); }}>
          <Plus size={15} /> 채팅방 주소 추가
        </button>
      </div>

      {adding && (
        <form className="room-form" onSubmit={addRoom}>
          <input id="room-name" placeholder="채팅방 이름 (예: 리뉴얼 프로젝트)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input id="room-url" placeholder="채팅방 주소 붙여넣기 (https://claude.ai/…)" inputMode="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          {draftError && <p className="overdue">{draftError}</p>}
          <button className="solid-btn" type="submit">저장</button>
        </form>
      )}

      <details className="preview">
        <summary>보낼 내용 미리보기 ({prompt.text.length.toLocaleString()}자)</summary>
        <pre>{prompt.text}</pre>
      </details>

      <div className="send-actions">
        {dest === 'new' && (
          <>
            <a className="send-btn" href={links.cowork.href} onClick={() => go('cowork')}>
              <Monitor size={20} />
              <strong>코워크로 보내기</strong>
              <small>Claude 데스크톱 앱의 코워크가 열립니다</small>
            </a>
            <a className="send-btn" href={links.code.href} target="_blank" rel="noopener noreferrer" onClick={() => go('code')}>
              <Terminal size={20} />
              <strong>클로드 코드로 보내기</strong>
              <small>새 탭에서 claude.ai/code가 열립니다</small>
            </a>
          </>
        )}
        {liveRoom && (
          <button className="send-btn" disabled={busy === 'send'} onClick={sendLive}>
            <Send size={20} />
            <strong>{busy === 'send' ? '보내는 중…' : `‘${liveRoom.title}’(으)로 보내기`}</strong>
            <small>누르면 이 채팅방에 바로 전송됩니다</small>
          </button>
        )}
        {savedRoom && (
          <a className="send-btn" href={savedRoom.url} target="_blank" rel="noopener noreferrer" onClick={() => go('saved')}>
            <ExternalLink size={20} />
            <strong>‘{savedRoom.name}’ 열기</strong>
            <small>내용을 복사한 뒤 채팅방을 새 탭에서 엽니다</small>
          </a>
        )}
        <button className="send-btn alt" onClick={() => go('copy')}>
          <Copy size={20} />
          <strong>내용만 복사</strong>
          <small>원하는 곳에 직접 붙여 넣기</small>
        </button>
      </div>

      {sent && <p className={`send-status ${sent.tone === 'warn' ? 'warn' : ''}`} role="status">{sent.text}</p>}

      <p className="fine">
        {dest === 'new' && '새 채팅방은 내용이 입력란에 채워지기만 하고 자동으로 전송되지 않습니다. 코워크는 Claude 데스크톱 앱이 설치된 컴퓨터에서만 열립니다.'}
        {liveRoom && '불러온 채팅방은 확인 단계 없이 바로 전송되고, 그 채팅방의 Claude가 곧바로 작업을 시작합니다.'}
        {savedRoom && '저장한 채팅방은 자동으로 채워지지 않습니다. 열린 채팅방 입력란에 붙여 넣은 뒤 보내세요.'}
        {dest === 'new' && hosted() && ' 이 미리보기 화면에서는 코워크 링크가 열리지 않을 수 있어요. 그럴 땐 ‘내용만 복사’ 후 코워크에 붙여 넣으세요.'}
      </p>
    </Sheet>
  );
}

export function CalendarSheet({ root, onFocus, onClose }) {
  const items = useMemo(() => datedItems(root), [root]);
  const [off, setOff] = useState(() => new Set());
  const today = todayStr();
  const canFile = !hosted();
  const picked = items.filter((it) => !off.has(it.id));

  const toggle = (id) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Sheet title="캘린더에 추가" onClose={onClose}>
      {items.length === 0 ? (
        <p className="empty-note">
          날짜가 있는 가지가 없어요. 가지의 <b>상세</b>에서 마감일을 정하거나, 이름에 ‘12/3’, ‘12월 3일’처럼 날짜를 적으면 여기에 나타납니다.
        </p>
      ) : (
        <>
          {items.map((it) => {
            const [, m, d] = it.date.split('-').map(Number);
            const wd = WEEK[new Date(`${it.date}T00:00:00`).getDay()];
            return (
              <div key={it.id} className="cal-item">
                {canFile && (
                  <input
                    id={`cal-${it.id}`}
                    type="checkbox"
                    checked={!off.has(it.id)}
                    onChange={() => toggle(it.id)}
                    aria-label={`${it.title} 일정 파일에 포함`}
                  />
                )}
                <div className="cal-date">
                  <b className={it.date < today && it.status !== 'done' ? 'overdue' : ''}>{m}/{d}</b>
                  <small>{wd}요일</small>
                </div>
                <button className="cal-main" onClick={() => onFocus(it.id)}>
                  <span>{it.title}</span>
                  {(it.path || it.fromText) && <small>{[it.fromText && '이름에서 찾은 날짜', it.path].filter(Boolean).join(' · ')}</small>}
                </button>
                <a className="cal-add" href={googleCalUrl(it)} target="_blank" rel="noopener noreferrer">
                  Google <ExternalLink size={13} />
                </a>
              </div>
            );
          })}

          {canFile && (
            <button
              className="solid-btn cal-all"
              disabled={!picked.length}
              onClick={() => download('mindmap-schedule.ics', buildIcs(picked), 'text/calendar')}
            >
              <CalendarPlus size={18} /> 선택한 {picked.length}개를 캘린더 파일로 받기
            </button>
          )}
          <p className="fine">
            {canFile
              ? '받은 .ics 파일을 열면 기기의 캘린더(Apple·Google·Outlook 등)에 종일 일정으로 한 번에 추가됩니다. ‘Google’은 해당 일정 하나를 Google 캘린더 새 일정 화면으로 엽니다.'
              : '‘Google’을 누르면 해당 일정이 Google 캘린더 새 일정 화면으로 열립니다. 저장을 눌러야 추가됩니다.'}
          </p>
        </>
      )}
    </Sheet>
  );
}
