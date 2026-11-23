import React, { useRef, useState } from 'react';
import { X, RefreshCw, Upload, Sparkles } from 'lucide-react';
import { CATEGORIES, CATEGORY_KEYS, todayStr } from './store.js';
import { AI_PROMPT, dataToTree, fmtDuration, stripSubtitles, textToTree } from './importer.js';

// 연결 오류는 원인마다 해결 방법이 다르므로 코드별로 안내한다
const ERRORS = {
  needs_reauth: '플라우드 연결이 만료됐어요. claude.ai 설정 → 커넥터에서 Plaud를 다시 연결해 주세요.',
  server_not_connected: 'claude.ai 설정 → 커넥터에서 Plaud를 추가하면 녹음을 불러올 수 있어요.',
  selection_required: 'Plaud 커넥터가 여러 개예요. claude.ai에서 사용할 것을 고른 뒤 다시 시도해 주세요.',
  not_in_manifest: '이 페이지에서 플라우드 연결을 허용하지 않았어요. 페이지의 권한 메뉴에서 허용해 주세요.',
  consent_required: '플라우드 연결을 허용해야 불러올 수 있어요. 다시 눌러 허용해 주세요.',
  approval_required: '승인이 필요해요. 다시 눌러 승인해 주세요.',
  blocked_by_policy: '조직 정책으로 플라우드 연결을 쓸 수 없어요. 파일이나 붙여넣기를 이용해 주세요.',
  server_unavailable: '플라우드에 잠시 연결할 수 없어요. 조금 뒤에 다시 시도해 주세요.',
  not_granted: 'Claude 사용을 허용하지 않아 정리하지 못했어요. ‘Claude로 정리’를 끄면 바로 만들 수 있어요.',
  rate_limited: '요청이 많아요. 잠시 뒤에 다시 시도해 주세요.',
  unavailable: '이 화면에서는 쓸 수 없는 기능이에요.',
};
const explain = (e) => ERRORS[e?.code] || (e instanceof Error && e.message) || '문제가 생겼어요. 다시 시도해 주세요.';

const shortDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function ImportDialog({ onCreate, onClose }) {
  const host = window.MINDMAP_HOST || {};
  const [source, setSource] = useState(host.plaud ? 'plaud' : 'file');
  const [category, setCategory] = useState('business');
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(''); // 진행 중인 일의 설명
  const [error, setError] = useState('');
  // 플라우드
  const [files, setFiles] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [mode, setMode] = useState('note');
  // 파일 · 붙여넣기
  const [picked, setPicked] = useState(null); // { name, text }
  const [pasted, setPasted] = useState('');
  const inputRef = useRef(null);

  const loadFiles = async () => {
    setBusy('녹음 목록을 불러오는 중…');
    setError('');
    try {
      setFiles(await host.plaud.list());
    } catch (e) {
      setError(explain(e));
    }
    setBusy('');
  };

  const onFile = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    setError('');
    setPicked(null);
    if (!f) return;
    if (/^(audio|video)\//.test(f.type) || /\.(mp3|m4a|wav|aac|ogg|flac|mp4|webm|opus)$/i.test(f.name)) {
      return setError('음성 파일을 글로 바꾸는 기능은 아직 없어요. 플라우드에서 가져오거나, 녹음 앱에서 내보낸 대본·요약 파일(.txt, .md, .srt)을 올려 주세요.');
    }
    if (f.size > 2 * 1024 * 1024) return setError('파일이 너무 커요. 2MB 이하의 글 파일을 올려 주세요.');
    const text = await f.text();
    setPicked({ name: f.name.replace(/\.[^.]+$/, ''), text: /\.(srt|vtt)$/i.test(f.name) ? stripSubtitles(text) : text });
  };

  const ready = source === 'plaud' ? !!fileId : source === 'file' ? !!picked : pasted.trim().length > 0;

  const create = async () => {
    setError('');
    try {
      let title;
      let text;
      if (source === 'plaud') {
        setBusy('플라우드에서 내용을 가져오는 중…');
        const rec = files.find((f) => f.id === fileId);
        title = rec.name;
        text = await host.plaud.fetch(fileId, mode);
      } else if (source === 'file') {
        ({ name: title, text } = picked);
      } else {
        title = '녹음 정리';
        text = pasted;
      }
      if (!text || !text.trim()) throw new Error('가져온 내용이 비어 있어요. 플라우드에서 요약이나 대본이 만들어졌는지 확인해 주세요.');

      let root;
      if (useAi && host.ai) {
        setBusy('Claude가 내용을 정리하는 중… (1분쯤 걸릴 수 있어요)');
        root = dataToTree(await host.ai.json(AI_PROMPT(text.slice(0, 60000), title, todayStr())), title);
      } else {
        root = textToTree(text, title);
      }
      onCreate(root, category);
    } catch (e) {
      setError(explain(e));
      setBusy('');
    }
  };

  return (
    <div className="dialog-wrap" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog import" role="dialog" aria-modal="true" aria-label="녹음으로 마인드맵 만들기">
        <header>
          <h2>녹음으로 마인드맵 만들기</h2>
          <button className="icon-btn" onClick={onClose} disabled={!!busy} aria-label="닫기"><X size={19} /></button>
        </header>

        <div className="segmented three">
          <button className={source === 'plaud' ? 'on' : ''} onClick={() => { setSource('plaud'); setError(''); }}>플라우드</button>
          <button className={source === 'file' ? 'on' : ''} onClick={() => { setSource('file'); setError(''); }}>파일 올리기</button>
          <button className={source === 'paste' ? 'on' : ''} onClick={() => { setSource('paste'); setError(''); }}>붙여넣기</button>
        </div>

        {source === 'plaud' && (host.plaud ? (
          <>
            {!files && <button className="ghost-btn" disabled={!!busy} onClick={loadFiles}><RefreshCw size={15} /> 플라우드 녹음 불러오기</button>}
            {files && files.length === 0 && <p>플라우드에 녹음이 없어요.</p>}
            {files && files.length > 0 && (
              <div className="rec-list" role="radiogroup" aria-label="가져올 녹음">
                {files.map((f) => (
                  <label key={f.id} className={`rec ${fileId === f.id ? 'on' : ''}`}>
                    <input type="radio" name="plaud-rec" id={`rec-${f.id}`} checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                    <span><b>{f.name}</b><small>{[shortDate(f.date), f.duration ? fmtDuration(f.duration) : ''].filter(Boolean).join(' · ')}</small></span>
                  </label>
                ))}
              </div>
            )}
            {files && files.length > 0 && (
              <div className="segmented two">
                <button className={mode === 'note' ? 'on' : ''} onClick={() => setMode('note')}>요약 노트로</button>
                <button className={mode === 'transcript' ? 'on' : ''} onClick={() => setMode('transcript')}>전체 대본으로</button>
              </div>
            )}
          </>
        ) : (
          <p>플라우드에서 바로 가져오기는 Claude 안에서 연 화면에서만 됩니다. 여기서는 플라우드 앱에서 요약이나 대본을 내보낸 뒤 ‘파일 올리기’나 ‘붙여넣기’로 넣어 주세요.</p>
        ))}

        {source === 'file' && (
          <>
            <button className="ghost-btn" onClick={() => inputRef.current.click()}><Upload size={15} /> 파일 고르기</button>
            <input ref={inputRef} id="import-file" type="file" accept=".txt,.md,.srt,.vtt,text/plain,text/markdown,audio/*" hidden onChange={onFile} />
            {picked
              ? <p>‘{picked.name}’ · {picked.text.length.toLocaleString()}자</p>
              : <p>녹음 앱에서 내보낸 대본·요약 파일(.txt, .md, .srt, .vtt)을 올릴 수 있어요.</p>}
          </>
        )}

        {source === 'paste' && (
          <textarea id="import-paste" rows={7} placeholder="녹음 대본이나 요약을 붙여 넣으세요" value={pasted} onChange={(e) => setPasted(e.target.value)} />
        )}

        <div className="import-opts">
          <label htmlFor="import-cat">심을 씨앗</label>
          <select id="import-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORIES[k].plantName}</option>)}
          </select>
        </div>
        {host.ai ? (
          <label className="check">
            <input id="import-ai" type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            <span><Sparkles size={14} /> Claude로 정리 <small>주제별로 묶고 할 일을 뽑아 줍니다. 대본처럼 구조가 없는 글에 권장</small></span>
          </label>
        ) : (
          <p className="fine">제목(#)과 글머리표(-)의 구조대로 가지를 만듭니다. 구조가 없는 대본은 발언마다 가지 하나가 됩니다.</p>
        )}

        {error && <p className="send-status warn" role="alert">{error}</p>}
        {busy && <p className="send-status" role="status">{busy}</p>}

        <div className="dialog-actions">
          <button className="ghost-btn" onClick={onClose} disabled={!!busy}>취소</button>
          <button className="solid-btn" onClick={create} disabled={!ready || !!busy}>마인드맵 만들기</button>
        </div>
      </div>
    </div>
  );
}
