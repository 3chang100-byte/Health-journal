import React, { useState } from 'react';
import { X, ExternalLink, RefreshCw } from 'lucide-react';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=' + encodeURIComponent('생각의 정원 동기화');

const when = (t) => {
  if (!t) return '아직 없음';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function SyncDialog({ sync, onClose }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connect = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await sync.connect(token);
      setToken('');
    } catch (err) {
      setError(err.message || '연결하지 못했어요. 다시 시도해 주세요.');
    }
    setBusy(false);
  };

  return (
    <div className="dialog-wrap" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog import" role="dialog" aria-modal="true" aria-label="기기 간 동기화">
        <header>
          <h2>기기 간 동기화</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="닫기"><X size={19} /></button>
        </header>

        {sync.connected ? (
          <>
            <p>이 기기는 GitHub 계정에 연결되어 있어요. 마인드맵을 고치면 몇 초 뒤 자동으로 올라가고, 앱을 열거나 화면으로 돌아올 때 다른 기기의 변경을 받아 옵니다.</p>
            <div className="sync-state">
              <span>마지막 동기화</span><b>{sync.status === 'syncing' ? '동기화하는 중…' : when(sync.lastSync)}</b>
            </div>
            {sync.status === 'error' && <p className="send-status warn" role="alert">{sync.message}</p>}
            <div className="dialog-actions">
              <button className="text-btn danger" onClick={sync.disconnect}>이 기기 연결 끊기</button>
              <button className="solid-btn" onClick={sync.syncNow} disabled={sync.status === 'syncing'}><RefreshCw size={15} /> 지금 동기화</button>
            </div>
            <p className="fine">연결을 끊어도 이 기기와 GitHub에 있는 마인드맵은 지워지지 않습니다. 같은 마인드맵을 두 기기에서 동시에 고치면 나중에 고친 쪽이 남습니다.</p>
          </>
        ) : (
          <form onSubmit={connect} className="sync-form">
            <p>본인 GitHub 계정의 비공개 공간(비밀 Gist)에 마인드맵을 저장해 여러 기기에서 같은 내용을 봅니다.</p>
            <ol>
              <li><a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">GitHub에서 연결 키 만들기 <ExternalLink size={13} /></a>를 눌러 로그인합니다.</li>
              <li>만료 기간(Expiration)을 고르고, <b>gist</b>만 체크된 것을 확인한 뒤 맨 아래 <b>Generate token</b>을 누릅니다.</li>
              <li>나타난 키(ghp_로 시작)를 복사해 아래에 붙여 넣습니다. 다른 기기에서도 같은 키를 넣으면 됩니다.</li>
            </ol>
            <label className="field-label" htmlFor="sync-token">연결 키</label>
            <input id="sync-token" type="password" autoComplete="off" placeholder="ghp_…" value={token} onChange={(e) => setToken(e.target.value)} />
            {error && <p className="send-status warn" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>취소</button>
              <button type="submit" className="solid-btn" disabled={busy || !token.trim()}>{busy ? '연결하는 중…' : '연결'}</button>
            </div>
            <p className="fine">키는 이 기기의 브라우저에만 보관되고 GitHub 외에는 전송되지 않습니다. 이 키로는 Gist만 다룰 수 있고 저장소에는 접근할 수 없습니다. 키가 만료되면 새로 만들어 다시 연결하면 됩니다.</p>
          </form>
        )}
      </div>
    </div>
  );
}
