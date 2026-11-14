import React, { useEffect, useMemo, useState } from 'react';
import { Copy, CalendarPlus, ExternalLink } from 'lucide-react';
import { Sheet } from './Panels.jsx';
import { download, todayStr } from './store.js';
import { buildIcs, buildPrompt, copyText, datedItems, googleCalUrl } from './share.js';

const hosted = () => !!window.MINDMAP_HOST?.noDownload;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function CopySheet({ root, branch, defaultKind = 'report', onClose }) {
  const [kind, setKind] = useState(defaultKind);
  const [onlyBranch, setOnlyBranch] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null); // 'ok' | 'fail'

  const node = branch && onlyBranch ? branch : root;
  const prompt = useMemo(() => buildPrompt(kind, node), [kind, node]);
  // 설정이나 마인드맵이 바뀌면 글을 새로 만든다 (직접 고친 내용은 그때까지 유지)
  useEffect(() => {
    setText(prompt);
    setStatus(null);
  }, [prompt]);

  const copy = async () => setStatus((await copyText(text)) ? 'ok' : 'fail');

  return (
    <Sheet title="Claude에 붙여 넣을 내용" onClose={onClose}>
      <label className="field-label">무엇을 부탁할까요</label>
      <div className="segmented two">
        <button className={kind === 'report' ? 'on' : ''} onClick={() => setKind('report')}>요약 보고서</button>
        <button className={kind === 'app' ? 'on' : ''} onClick={() => setKind('app')}>앱 만들기</button>
      </div>

      {branch && (
        <label className="check">
          <input id="only-branch" type="checkbox" checked={onlyBranch} onChange={(e) => setOnlyBranch(e.target.checked)} />
          선택한 가지 ‘{branch.text.split('\n')[0] || '제목 없음'}’만 담기
        </label>
      )}

      <label className="field-label" htmlFor="copy-text">정리한 내용 ({text.length.toLocaleString()}자) · 고쳐 쓸 수 있어요</label>
      <textarea id="copy-text" className="copy-text" rows={10} value={text} onChange={(e) => { setText(e.target.value); setStatus(null); }} />

      <button className="solid-btn copy-btn" onClick={copy}>
        <Copy size={18} /> {status === 'ok' ? '복사했어요' : '전체 복사'}
      </button>
      {status === 'fail' && <p className="send-status warn" role="status">복사하지 못했어요. 위 내용을 길게 눌러(또는 Ctrl+A) 직접 복사해 주세요.</p>}
      <p className="fine">복사한 뒤 Claude(채팅, 코워크, 클로드 코드) 입력란에 붙여 넣고 보내면 됩니다.</p>
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
