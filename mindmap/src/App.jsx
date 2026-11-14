import React, { useEffect, useRef, useState } from 'react';
import { Plus, MoreVertical, Upload, Download } from 'lucide-react';
import Editor from './Editor.jsx';
import { Dialog, Menu } from './Panels.jsx';
import { download, exportPayload, loadMaps, makeMap, parseImport, reId, saveMaps, stats, titleOf } from './store.js';

const routeId = () => (location.hash.match(/^#m-(.+)$/) || [])[1] || null;

const fmtDate = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};

export default function App() {
  const [maps, setMaps] = useState(loadMaps);
  const [openId, setOpenId] = useState(routeId);
  const [saveFailed, setSaveFailed] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [dialog, setDialog] = useState(null);
  const fileRef = useRef(null);
  const mapsRef = useRef(maps);
  mapsRef.current = maps;

  useEffect(() => {
    const onHash = () => setOpenId(routeId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSaveFailed(!saveMaps(maps)), 250);
    return () => clearTimeout(t);
  }, [maps]);

  useEffect(() => {
    const flush = () => saveMaps(mapsRef.current);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  const open = (id) => { location.hash = `#m-${id}`; };

  // 파일 저장이 막힌 환경(미리보기 페이지 등)에서는 내용을 복사할 수 있게 보여 준다
  const exportMaps = async (filename, list) => {
    const text = exportPayload(list);
    const host = window.MINDMAP_HOST;
    if (!host?.noDownload) return download(filename, text);
    try {
      if (host.save && (await host.save(filename, text))) return;
    } catch (err) {
      if (err?.code === 'declined') return;
    }
    setDialog({ title: '백업 내용 복사', message: '이 화면에서는 파일 저장이 막혀 있어요. 아래 내용을 복사해 .json 파일로 보관하세요.', copyText: text });
  };
  const current = maps.find((m) => m.id === openId);

  const create = () => {
    const m = makeMap();
    setMaps((ms) => [m, ...ms]);
    open(m.id);
  };

  const duplicate = (m) => {
    const copy = { ...structuredClone(m), ...makeMap(), root: reId(structuredClone(m.root)) };
    copy.root.text = `${titleOf(m)} 사본`;
    copy.layout = m.layout;
    setMaps((ms) => [copy, ...ms]);
  };

  const remove = (m) => {
    setDialog({
      title: '마인드맵 삭제',
      message: `'${titleOf(m)}' 마인드맵을 삭제할까요? 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      danger: true,
      onConfirm: () => setMaps((ms) => ms.filter((x) => x.id !== m.id)),
    });
  };

  const onImport = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = parseImport(await file.text());
      setMaps((ms) => [...incoming, ...ms]);
      setDialog({ title: '가져오기 완료', message: `마인드맵 ${incoming.length}개를 가져왔습니다.` });
    } catch (err) {
      setDialog({ title: '가져오지 못했습니다', message: err instanceof SyntaxError ? 'JSON 파일이 아닙니다. 이 앱에서 내보낸 백업 파일을 골라 주세요.' : err.message });
    }
  };

  const banner = saveFailed && (
    <div className="save-banner">저장 공간이 부족해 저장하지 못했어요. 백업을 내보낸 뒤 쓰지 않는 마인드맵을 지워 주세요.</div>
  );

  if (current) {
    return (
      <>
        {banner}
        <Editor
          key={current.id}
          map={current}
          onChange={(next) => setMaps((ms) => ms.map((m) => (m.id === next.id ? next : m)))}
          onBack={() => { location.hash = ''; }}
          onExport={() => exportMaps(`${titleOf(current)}.json`, [mapsRef.current.find((m) => m.id === current.id)])}
        />
        {dialog && <Dialog {...dialog} onClose={() => setDialog(null)} />}
      </>
    );
  }

  const sorted = [...maps].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="home">
      {banner}
      <header className="home-head">
        <div>
          <h1>마인드맵</h1>
          <p>프로젝트를 가지로 펼치고, 할 일까지 한 장에서.</p>
        </div>
        <div className="home-actions">
          <button className="ghost-btn" onClick={() => fileRef.current.click()}><Upload size={16} /> 가져오기</button>
          <button
            className="ghost-btn"
            disabled={!maps.length}
            onClick={() => exportMaps(`mindmap-backup-${new Date().toISOString().slice(0, 10)}.json`, maps)}
          >
            <Download size={16} /> 전체 백업
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
      </header>

      <div className="grid">
        <button className="card new" onClick={create}><Plus size={22} /> 새 마인드맵</button>
        {sorted.map((m) => {
          const s = stats(m.root);
          return (
            <div key={m.id} className="card">
              <button className="card-main" onClick={() => open(m.id)}>
                <strong>{titleOf(m)}</strong>
                <span className="card-sub">가지 {s.nodes - 1}개 · {fmtDate(m.updatedAt)}</span>
                {s.total > 0 ? (
                  <span className="card-progress">
                    <span className="bar"><i style={{ width: `${(s.done / s.total) * 100}%` }} /></span>
                    할 일 {s.done}/{s.total}
                  </span>
                ) : (
                  <span className="card-progress muted">할 일 없음</span>
                )}
              </button>
              <button className="icon-btn card-more" onClick={() => setMenuFor(m.id)} aria-label="더 보기"><MoreVertical size={18} /></button>
              {menuFor === m.id && (
                <Menu
                  onClose={() => setMenuFor(null)}
                  items={[
                    { label: '복제', run: () => duplicate(m) },
                    { label: '내보내기 (JSON)', run: () => exportMaps(`${titleOf(m)}.json`, [m]) },
                    { label: '삭제', danger: true, run: () => remove(m) },
                  ]}
                />
              )}
            </div>
          );
        })}
      </div>
      {dialog && <Dialog {...dialog} onClose={() => setDialog(null)} />}
      <p className="foot">모든 내용은 이 기기의 브라우저에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 <b>전체 백업</b>을 받아 두세요.</p>
    </div>
  );
}
