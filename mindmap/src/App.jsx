import React, { useEffect, useRef, useState } from 'react';
import Editor from './Editor.jsx';
import { Dialog } from './Panels.jsx';
import SyncDialog from './SyncDialog.jsx';
import { markDeleted, useSync } from './sync.js';
import { download, exportPayload, loadMaps, saveMaps, titleOf, withPositions } from './store.js';

const KEEP_TITLE = '새 프로젝트';
const CLEANUP_KEY = 'project-mindmap.cleanup1';
const flag = (key, value) => {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* 저장하지 못하면 다음에 다시 묻는다 */
  }
  return null;
};

/**
 * 이전 버전 정리: '새 프로젝트'만 남기고 나머지 마인드맵을 지운다.
 * 되돌릴 수 없으므로 백업 파일을 받은 뒤에만 지울 수 있다.
 */
function CleanupDialog({ extras, onDelete, onLater }) {
  const [saved, setSaved] = useState(false);
  const backup = () => {
    download(`생각의정원-백업-${new Date().toISOString().slice(0, 10)}.json`, exportPayload(extras));
    setSaved(true);
  };
  return (
    <div className="dialog-wrap">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="이전 마인드맵 정리">
        <h2>이전 마인드맵 정리</h2>
        <p>‘{KEEP_TITLE}’만 남기고 아래 마인드맵 {extras.length}개를 삭제합니다. 삭제하면 되돌릴 수 없으니 먼저 백업 파일을 받아 주세요.</p>
        <ul className="cleanup-list">
          {extras.map((m) => <li key={m.id}>{titleOf(m)}</li>)}
        </ul>
        <p>‘{KEEP_TITLE}’는 지우지 않습니다.</p>
        <div className="dialog-actions">
          <button className="text-btn" onClick={onLater}>나중에</button>
          <button className="ghost-btn" onClick={backup}>{saved ? '백업 다시 받기' : '백업 파일 받기'}</button>
          <button className="solid-btn danger" disabled={!saved} onClick={onDelete}>삭제</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [maps, setMaps] = useState(loadMaps);
  const [saveFailed, setSaveFailed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [cleanupLater, setCleanupLater] = useState(false);
  const mapsRef = useRef(maps);
  mapsRef.current = maps;

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

  // 다른 기기에서 넘어온 마인드맵에 캔버스 자리가 없으면 빈자리에 놓는다
  useEffect(() => {
    const placed = withPositions(maps);
    if (placed !== maps) setMaps(placed);
  }, [maps]);

  // 기기 간 동기화: 고친 뒤 잠시 멈추면 올린다
  const sync = useSync(mapsRef, setMaps);
  const { connected, syncNow } = sync;
  useEffect(() => {
    if (!connected) return undefined;
    const t = setTimeout(syncNow, 4000);
    return () => clearTimeout(t);
  }, [maps, connected, syncNow]);

  // 작업공간에서 마인드맵이 지워지면 다른 기기에서도 지워지도록 기록해 둔다
  const onChange = (next) => {
    const alive = new Set(next.map((m) => m.id));
    for (const m of mapsRef.current) if (!alive.has(m.id)) markDeleted(m.id);
    mapsRef.current = next;
    setMaps(next);
  };

  // 앱으로 설치: 브라우저가 설치할 수 있다고 알려 주면 그 요청을 보관해 두었다가 메뉴에서 띄운다
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

  // 이전 버전 정리는 '새 프로젝트'가 분명히 있을 때만 제안한다
  const keepers = maps.filter((m) => titleOf(m) === KEEP_TITLE);
  const extras = maps.filter((m) => titleOf(m) !== KEEP_TITLE);
  const askCleanup = !flag(CLEANUP_KEY) && !cleanupLater && keepers.length > 0 && extras.length > 0;
  useEffect(() => {
    // 정리할 것이 없는 기기(새로 설치했거나 이미 정리한 기기)에서는 다시 묻지 않는다
    if (!flag(CLEANUP_KEY) && keepers.length > 0 && extras.length === 0) flag(CLEANUP_KEY, 'none');
  }, [keepers.length, extras.length]);
  const cleanup = () => {
    extras.forEach((m) => markDeleted(m.id));
    flag(CLEANUP_KEY, 'done');
    setMaps(keepers);
  };

  const syncLabel = { off: '기기 간 동기화 켜기', syncing: '동기화 중…', error: '동기화 확인 필요', idle: '기기 간 동기화 (켜짐)' }[sync.status];
  return (
    <>
      {saveFailed && <div className="save-banner">저장 공간이 부족해 저장하지 못했어요. 쓰지 않는 마인드맵을 지워 주세요.</div>}
      <Editor
        maps={maps}
        onChange={onChange}
        menuItems={[
          { label: syncLabel, run: () => setSyncOpen(true) },
          ...(installed ? [] : [{ label: '앱으로 설치', run: install }]),
        ]}
      />
      {syncOpen && <SyncDialog sync={sync} onClose={() => setSyncOpen(false)} />}
      {dialog && <Dialog {...dialog} onClose={() => setDialog(null)} />}
      {askCleanup && <CleanupDialog extras={extras} onDelete={cleanup} onLater={() => setCleanupLater(true)} />}
    </>
  );
}
