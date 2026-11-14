import React, { useMemo, useState } from 'react';
import { Monitor, Terminal, Copy, CalendarPlus, ExternalLink } from 'lucide-react';
import { Sheet } from './Panels.jsx';
import { download, todayStr } from './store.js';
import { buildIcs, buildPrompt, copyText, datedItems, googleCalUrl, sendLink } from './share.js';

const hosted = () => !!window.MINDMAP_HOST?.noDownload;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function SendSheet({ root, branch, onClose }) {
  const [kind, setKind] = useState('report');
  const [onlyBranch, setOnlyBranch] = useState(false);
  const [sent, setSent] = useState(null); // { target, full, copied }

  const node = branch && onlyBranch ? branch : root;
  const prompt = useMemo(() => buildPrompt(kind, node), [kind, node]);
  const links = useMemo(() => ({ cowork: sendLink('cowork', prompt), code: sendLink('code', prompt) }), [prompt]);

  // 링크가 열리는 것과 별개로 항상 전체 내용을 클립보드에 넣어 둔다
  const go = async (target) => {
    const copied = await copyText(prompt.text);
    setSent({ target, full: links[target]?.full ?? true, copied });
  };

  const where = { cowork: '코워크', code: '클로드 코드', copy: '' };
  return (
    <Sheet title="Claude로 보내기" onClose={onClose}>
      <label className="field-label">무엇을 만들까요</label>
      <div className="segmented two">
        <button className={kind === 'report' ? 'on' : ''} onClick={() => { setKind('report'); setSent(null); }}>요약 보고서</button>
        <button className={kind === 'app' ? 'on' : ''} onClick={() => { setKind('app'); setSent(null); }}>앱 만들기</button>
      </div>

      {branch && (
        <label className="check">
          <input id="only-branch" type="checkbox" checked={onlyBranch} onChange={(e) => { setOnlyBranch(e.target.checked); setSent(null); }} />
          선택한 가지 ‘{branch.text.split('\n')[0] || '제목 없음'}’만 보내기
        </label>
      )}

      <details className="preview">
        <summary>보낼 내용 미리보기 ({prompt.text.length.toLocaleString()}자)</summary>
        <pre>{prompt.text}</pre>
      </details>

      <div className="send-actions">
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
        <button className="send-btn alt" onClick={() => go('copy')}>
          <Copy size={20} />
          <strong>내용만 복사</strong>
          <small>원하는 곳에 직접 붙여 넣기</small>
        </button>
      </div>

      {sent && (
        <p className="send-status" role="status">
          {sent.target === 'copy'
            ? (sent.copied ? '내용을 복사했어요.' : '복사하지 못했어요. 미리보기를 열어 직접 복사해 주세요.')
            : sent.full
              ? `${where[sent.target]} 입력란에 내용이 채워집니다. 확인한 뒤 보내기를 누르세요.${sent.copied ? ' 채워지지 않으면 붙여 넣으세요(복사해 두었어요).' : ''}`
              : `마인드맵이 길어 지시문만 채워집니다. ${where[sent.target]} 입력란에 붙여 넣은 뒤 보내세요${sent.copied ? '(전체 내용을 복사해 두었어요).' : '. 복사에 실패했으니 미리보기에서 직접 복사해 주세요.'}`}
        </p>
      )}

      <p className="fine">
        내용은 입력란에 채워지기만 하고 자동으로 전송되지 않습니다. 코워크는 Claude 데스크톱 앱이 설치된 컴퓨터에서만 열립니다.
        {hosted() && ' 이 미리보기 화면에서는 코워크 링크가 열리지 않을 수 있어요. 그럴 땐 ‘내용만 복사’ 후 코워크에 붙여 넣으세요.'}
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
