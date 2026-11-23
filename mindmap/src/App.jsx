import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, MoreVertical, Upload, Download, CheckCircle2, Sprout, Mic, Cloud, CloudOff, AlertTriangle, MonitorDown } from 'lucide-react';
import Editor from './Editor.jsx';
import { Dialog, Menu } from './Panels.jsx';
import { Park, PlantView, TemplatePicker } from './Park.jsx';
import ImportDialog from './ImportDialog.jsx';
import SyncDialog from './SyncDialog.jsx';
import { markDeleted, useSync } from './sync.js';
import { CATEGORIES, categoryOf, josa, download, exportPayload, newMapIn, loadMaps, makeMap, parseImport, reId, saveMaps, stats, titleOf } from './store.js';

const routeId = () => (location.hash.match(/^#m-(.+)$/) || [])[1] || null;

const fmtDate = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};

export default function App() {
  const [maps, setMaps] = useState(loadMaps);
  const [openId, setOpenId] = useState(routeId);
  const [tab, setTab] = useState(() => (location.hash === '#list' ? 'list' : 'garden'));
  const [picker, setPicker] = useState(null); // 'new' | 바꿀 마인드맵 id
  const [plantId, setPlantId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  // 앱으로 설치: 브라우저가 설치할 수 있다고 알려 주면 그 요청을 보관해 두었다가 버튼을 누를 때 띄운다
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallEvent(e); };
    const onDone = () => { setInstalled(true); setInstallEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onDone);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onDone);
    };
  }, []);
  const install = async () => {
    if (installEvent) {
      installEvent.prompt();
      await installEvent.userChoice.catch(() => null);
      setInstallEvent(null);
      return;
    }
    setDialog({
      title: '앱으로 설치하기',
      message: '컴퓨터(Chrome·Edge): 주소창 오른쪽의 설치 아이콘을 누르거나, 브라우저 메뉴(⋮)에서 ‘앱 설치’ 또는 ‘앱 → 이 사이트를 앱으로 설치’를 고르세요. 설치한 뒤 작업 표시줄의 아이콘을 마우스 오른쪽 버튼으로 눌러 ‘작업 표시줄에 고정’을 고르면 됩니다.\n\n아이폰(Safari): 공유 버튼 → ‘홈 화면에 추가’.\n안드로이드(Chrome): 메뉴(⋮) → ‘앱 설치’ 또는 ‘홈 화면에 추가’.',
    });
  };
  const [saveFailed, setSaveFailed] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [dialog, setDialog] = useState(null);
  const fileRef = useRef(null);
  const mapsRef = useRef(maps);
  mapsRef.current = maps;

  useEffect(() => {
    const onHash = () => {
      setOpenId(routeId());
      setTab(location.hash === '#list' ? 'list' : 'garden');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSaveFailed(!saveMaps(maps)), 250);
    return () => clearTimeout(t);
  }, [maps]);

  // 기기 간 동기화: 고친 뒤 잠시 멈추면 올린다 (미리보기 페이지에서는 외부 연결이 막혀 있어 끈다)
  const canSync = !window.MINDMAP_HOST?.noDownload;
  const sync = useSync(mapsRef, setMaps);
  const { connected, syncNow } = sync;
  useEffect(() => {
    if (!connected) return undefined;
    const t = setTimeout(syncNow, 4000);
    return () => clearTimeout(t);
  }, [maps, connected, syncNow]);

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
  const mapTitles = useMemo(() => new Map(maps.map((m) => [m.id, titleOf(m)])), [maps]);

  const create = (category) => {
    const m = newMapIn(category);
    setMaps((ms) => [m, ...ms]);
    open(m.id);
  };

  // 녹음에서 만든 가지로 새 마인드맵을 심는다
  const createFromTree = (root, category) => {
    const m = { ...makeMap(), category, root };
    setImporting(false);
    setMaps((ms) => [m, ...ms]);
    open(m.id);
  };

  const patchMap = (id, patch) =>
    setMaps((ms) => ms.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch, updatedAt: Date.now() };
      if (!next.completedAt) delete next.completedAt;
      return next;
    }));

  // 완료하면 정원에서 다 자란 모습이 된다
  const toggleDone = (m, celebrate = true) => {
    patchMap(m.id, { completedAt: m.completedAt ? 0 : Date.now() });
    if (!m.completedAt && celebrate) {
      const info = CATEGORIES[categoryOf(m)];
      setDialog({
        title: '프로젝트 완료',
        message: `‘${titleOf(m)}’ 프로젝트가 정원에서 다 자란 ${josa(info.plantName, '이', '가')} 됐어요.`,
        confirmLabel: '정원 보기',
        onConfirm: () => { location.hash = ''; },
      });
    }
  };

  const duplicate = (m) => {
    const copy = { ...structuredClone(m), ...makeMap(), root: reId(structuredClone(m.root)) };
    copy.root.text = `${titleOf(m)} 사본`;
    copy.layout = m.layout;
    copy.category = categoryOf(m);
    delete copy.completedAt;
    setMaps((ms) => [copy, ...ms]);
  };

  const remove = (m) => {
    setDialog({
      title: '마인드맵 삭제',
      message: `'${titleOf(m)}' 마인드맵을 삭제할까요? 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      danger: true,
      onConfirm: () => { markDeleted(m.id); setMaps((ms) => ms.filter((x) => x.id !== m.id)); },
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
          mapTitles={mapTitles}
          onCreateMap={(m) => setMaps((ms) => [m, ...ms])}
          onChange={(next) => setMaps((ms) => ms.map((m) => (m.id === next.id ? next : m)))}
          onBack={() => { location.hash = ''; }}
          onExport={() => exportMaps(`${titleOf(current)}.json`, [mapsRef.current.find((m) => m.id === current.id)])}
          onToggleDone={() => toggleDone(mapsRef.current.find((m) => m.id === current.id))}
          onPickCategory={() => setPicker(current.id)}
          onShowPlant={() => setPlantId(current.id)}
        />
        {plantId === current.id && (
          <PlantView
            map={current}
            onOpen={() => setPlantId(null)}
            openLabel="마인드맵으로 돌아가기"
            onToggleDone={() => toggleDone(mapsRef.current.find((m) => m.id === current.id), false)}
            onClose={() => setPlantId(null)}
          />
        )}
        {picker && (
          <TemplatePicker
            title="씨앗 바꾸기"
            note="씨앗에 따라 정원에서 자라는 모습이 달라집니다. 마인드맵 내용은 그대로예요."
            onPick={(c) => patchMap(current.id, { category: c })}
            onClose={() => setPicker(null)}
          />
        )}
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
          <h1>생각의 정원</h1>
          <p>마인드맵을 시작하면 정원에 심기고, 일을 해낼수록 자라요.</p>
        </div>
        <div className="home-actions">
          <button className="solid-btn plant-new" onClick={() => setPicker('new')} data-tip="새 마인드맵을 만들어 정원에 심기"><Sprout size={17} /> 새로 심기</button>
          <button className="ghost-btn" onClick={() => setImporting(true)} data-tip="녹음 대본·요약으로 마인드맵 만들기"><Mic size={16} /> 녹음으로 심기</button>
          {canSync && !installed && (
            <button className="ghost-btn" onClick={install} data-tip="이 앱을 컴퓨터나 휴대폰에 설치: 설치하면 작업 표시줄에 고정할 수 있어요">
              <MonitorDown size={16} /> 앱으로 설치
            </button>
          )}
          {canSync && (
            <button className={`ghost-btn sync-btn ${sync.status}`} onClick={() => setSyncOpen(true)} data-tip="여러 기기에서 같은 마인드맵 보기 (GitHub 계정에 저장)">
              {sync.status === 'off' ? <CloudOff size={16} /> : sync.status === 'error' ? <AlertTriangle size={16} /> : <Cloud size={16} />}
              {sync.status === 'off' ? '동기화 켜기' : sync.status === 'syncing' ? '동기화 중…' : sync.status === 'error' ? '동기화 확인 필요' : '동기화됨'}
            </button>
          )}
          <button className="ghost-btn" onClick={() => fileRef.current.click()} data-tip="백업 파일(JSON)에서 마인드맵 불러오기"><Upload size={16} /> 가져오기</button>
          <button
            className="ghost-btn"
            disabled={!maps.length}
            onClick={() => exportMaps(`mindmap-backup-${new Date().toISOString().slice(0, 10)}.json`, maps)}
            data-tip="모든 마인드맵을 파일 하나로 내려받기"
          >
            <Download size={16} /> 전체 백업
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'garden'} className={tab === 'garden' ? 'on' : ''} onClick={() => { location.hash = ''; }} data-tip="정원: 마인드맵이 식물로 자라는 모습">정원</button>
        <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => { location.hash = '#list'; }} data-tip="목록: 마인드맵을 카드로 보고 복제·삭제">목록 {maps.length}</button>
      </div>

      {tab === 'garden' && <Park maps={maps} onPick={open} />}
      {syncOpen && <SyncDialog sync={sync} onClose={() => setSyncOpen(false)} />}
      {importing && <ImportDialog onCreate={createFromTree} onClose={() => setImporting(false)} />}
      {picker === 'new' && (
        <TemplatePicker
          title="새로 심기"
          note="어떤 씨앗을 심을지 고르면 빈 마인드맵으로 시작합니다. 씨앗은 나중에 바꿀 수 있어요."
          onPick={create}
          onClose={() => setPicker(null)}
        />
      )}

      {tab === 'list' && <>
      <div className="grid">
        <button className="card new" onClick={() => setPicker('new')}><Plus size={22} /> 새 마인드맵</button>
        {sorted.map((m) => {
          const s = stats(m.root);
          return (
            <div key={m.id} className="card">
              <button className="card-main" onClick={() => open(m.id)}>
                <strong>{titleOf(m)}</strong>
                <span className="card-tags">
                  <span className="chip">{CATEGORIES[categoryOf(m)].label}</span>
                  {m.completedAt && <span className="chip done"><CheckCircle2 size={12} /> 완료</span>}
                </span>
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
              <button className="icon-btn card-more" onClick={() => setMenuFor(m.id)} aria-label="더 보기" data-tip="더 보기: 완료, 복제, 내보내기, 삭제"><MoreVertical size={18} /></button>
              {menuFor === m.id && (
                <Menu
                  onClose={() => setMenuFor(null)}
                  items={[
                    { label: m.completedAt ? '완료 취소' : '프로젝트 완료', run: () => toggleDone(m) },
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
      <p className="foot">모든 내용은 이 기기의 브라우저에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 <b>전체 백업</b>을 받아 두세요.</p>
      </>}
      {dialog && <Dialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
