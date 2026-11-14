import React, { useState } from 'react';
import { X, ArrowUp, ArrowDown } from 'lucide-react';
import { PALETTE, STATUSES, STATUS_LABEL, fmtDue, todayStr } from './store.js';
import { StatusIcon } from './Editor.jsx';

export function Menu({ items, onClose }) {
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="menu" role="menu">
        {items.map((it) => (
          <button
            key={it.label}
            role="menuitem"
            className={it.danger ? 'danger' : ''}
            onClick={() => { onClose(); it.run(); }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <aside className="sheet">
      <div className="sheet-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="닫기"><X size={19} /></button>
      </div>
      <div className="sheet-body">{children}</div>
    </aside>
  );
}

export function DetailSheet({ node, isRoot, canUp, canDown, onPatch, onReorder, onClose }) {
  const [note, setNote] = useState(node.note || '');
  const saveNote = () => {
    if (note !== (node.note || '')) onPatch({ note });
  };
  return (
    <Sheet title={node.text.split('\n')[0] || '제목 없음'} onClose={() => { saveNote(); onClose(); }}>
      <label className="field-label">상태</label>
      <div className="segmented">
        <button className={!node.status ? 'on' : ''} onClick={() => onPatch({ status: null })}>없음</button>
        {STATUSES.map((s) => (
          <button key={s} className={node.status === s ? `on ${s}` : ''} onClick={() => onPatch({ status: s })}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="due">마감일</label>
      <div className="row">
        <input id="due" type="date" value={node.due || ''} onChange={(e) => onPatch({ due: e.target.value })} />
        {node.due && <button className="text-btn" onClick={() => onPatch({ due: null })}>지우기</button>}
      </div>

      <label className="field-label" htmlFor="note">메모</label>
      <textarea
        id="note"
        className="note"
        rows={4}
        placeholder="참고 사항, 링크, 결정한 내용…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
      />

      {!isRoot && (
        <>
          <label className="field-label">가지 색</label>
          <div className="swatches">
            <button className={`auto ${!node.color ? 'on' : ''}`} onClick={() => onPatch({ color: null })}>자동</button>
            {PALETTE.map((c) => (
              <button
                key={c}
                className={node.color === c ? 'on' : ''}
                style={{ '--c': c }}
                onClick={() => onPatch({ color: c })}
                aria-label={`색 ${c}`}
              />
            ))}
          </div>

          <label className="field-label">순서</label>
          <div className="row">
            <button className="ghost-btn" disabled={!canUp} onClick={() => onReorder(-1)}><ArrowUp size={16} /> 위로</button>
            <button className="ghost-btn" disabled={!canDown} onClick={() => onReorder(1)}><ArrowDown size={16} /> 아래로</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

export function TasksSheet({ root, onCycle, onFocus, onClose }) {
  const today = todayStr();
  const groups = { doing: [], todo: [], done: [] };
  const path = [];
  const rec = (n) => {
    if (n.status) groups[n.status].push({ n, path: path.slice(1).join(' › ') });
    path.push(n.text.split('\n')[0]);
    n.children.forEach(rec);
    path.pop();
  };
  rec(root);
  for (const k of ['doing', 'todo']) {
    groups[k].sort((a, b) => (a.n.due || '9999').localeCompare(b.n.due || '9999'));
  }
  const count = groups.doing.length + groups.todo.length + groups.done.length;

  return (
    <Sheet title="할 일" onClose={onClose}>
      {count === 0 && (
        <p className="empty-note">아직 할 일이 없어요. 가지를 선택하고 <b>상태</b>를 누르면 할 일로 바뀝니다.</p>
      )}
      {['doing', 'todo', 'done'].map((k) => groups[k].length > 0 && (
        <section key={k} className="task-group">
          <h3>{STATUS_LABEL[k]} <span>{groups[k].length}</span></h3>
          {groups[k].map(({ n, path: p }) => (
            <div key={n.id} className={`task ${k}`}>
              <button className={`st ${k}`} onClick={() => onCycle(n.id)} aria-label="상태 바꾸기"><StatusIcon status={k} size={20} /></button>
              <button className="task-main" onClick={() => onFocus(n.id)}>
                <span className="task-text">{n.text}</span>
                {(p || n.due) && (
                  <span className="task-sub">
                    {n.due && <b className={n.due < today && k !== 'done' ? 'overdue' : ''}>◷ {fmtDue(n.due)}</b>}
                    {p}
                  </span>
                )}
              </button>
            </div>
          ))}
        </section>
      ))}
    </Sheet>
  );
}
