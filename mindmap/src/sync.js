// 기기 간 동기화: 사용자의 GitHub 비밀 Gist 하나에 마인드맵 전체를 저장한다
import { useCallback, useEffect, useRef, useState } from 'react';

const SETTINGS_KEY = 'project-mindmap.sync';
const DELETED_KEY = 'project-mindmap.deleted';
const FILE = 'saenggak-garden.json';
const API = 'https://api.github.com';
const KEEP_DELETED_MS = 90 * 86400000;

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 공간이 없으면 이번 실행에서만 유지된다 */
  }
};

export const loadDeleted = () => read(DELETED_KEY, {});
/** 지운 마인드맵을 기록해 둔다. 다른 기기에 남은 사본이 되살아나지 않게 하기 위함 */
export function markDeleted(id) {
  const d = loadDeleted();
  d[id] = Date.now();
  write(DELETED_KEY, d);
}

/**
 * 두 기기의 내용을 합친다. 같은 마인드맵은 더 최근에 고친 쪽이 남고,
 * 지운 기록이 마지막 수정보다 나중이면 지워진 것으로 본다.
 */
export function merge(localMaps, localDeleted, remote) {
  const deleted = { ...(remote?.deleted || {}) };
  for (const [id, t] of Object.entries(localDeleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);
  const cutoff = Date.now() - KEEP_DELETED_MS;
  for (const id of Object.keys(deleted)) if (deleted[id] < cutoff) delete deleted[id];

  const byId = new Map();
  for (const m of [...(remote?.maps || []), ...localMaps]) {
    if (!m || !m.id || !m.root) continue;
    const cur = byId.get(m.id);
    if (!cur || (m.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(m.id, m);
  }
  const maps = [...byId.values()].filter((m) => !(deleted[m.id] >= (m.updatedAt || 0)));
  return { maps, deleted };
}

const fingerprint = (maps, deleted) =>
  JSON.stringify([[...maps].sort((a, b) => a.id.localeCompare(b.id)).map((m) => [m.id, m.updatedAt]), Object.entries(deleted).sort()]);

class SyncError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function gh(token, path, options = {}) {
  let res;
  try {
    res = await fetch(path.startsWith('http') ? path : API + path, {
      ...options,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch {
    throw new SyncError('offline', '인터넷에 연결되지 않았어요. 연결되면 다시 동기화합니다.');
  }
  if (res.status === 401) throw new SyncError('auth', '연결 키가 올바르지 않거나 만료됐어요. 새 키를 발급해 다시 연결해 주세요.');
  if (res.status === 403 || res.status === 429) throw new SyncError('denied', 'GitHub가 요청을 거절했어요. 키에 gist 권한이 있는지 확인하거나 잠시 뒤 다시 시도해 주세요.');
  if (res.status === 404) throw new SyncError('missing', '저장 공간을 찾지 못했어요. 키에 gist 권한이 있는지 확인해 주세요.');
  if (!res.ok) throw new SyncError('server', `GitHub에 문제가 있어요(${res.status}). 잠시 뒤 다시 시도해 주세요.`);
  return res.json();
}

async function findOrCreateGist(token) {
  for (let page = 1; page <= 3; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  const created = await gh(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: '생각의 정원 동기화 데이터 (앱이 자동으로 관리합니다)',
      public: false,
      files: { [FILE]: { content: JSON.stringify({ version: 1, maps: [], deleted: {} }) } },
    }),
  });
  return created.id;
}

async function pull(token, gistId) {
  const gist = await gh(token, `/gists/${gistId}`);
  const file = gist.files?.[FILE];
  if (!file) return { maps: [], deleted: {} };
  let text = file.content;
  if (file.truncated) {
    const res = await fetch(file.raw_url);
    text = await res.text();
  }
  try {
    const data = JSON.parse(text);
    return { maps: Array.isArray(data.maps) ? data.maps : [], deleted: data.deleted && typeof data.deleted === 'object' ? data.deleted : {} };
  } catch {
    throw new SyncError('corrupt', '저장된 동기화 데이터를 읽지 못했어요. 이 기기의 내용은 그대로 있습니다.');
  }
}

const push = (token, gistId, data) =>
  gh(token, `/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify({ version: 1, savedAt: Date.now(), ...data }) } } }),
  });

/**
 * 동기화 상태와 동작. mapsRef 는 항상 최신 마인드맵 배열을 가리켜야 한다.
 * status: 'off' | 'idle' | 'syncing' | 'error'
 */
export function useSync(mapsRef, setMaps) {
  const [settings, setSettings] = useState(() => read(SETTINGS_KEY, null));
  const [state, setState] = useState({ status: settings?.token ? 'idle' : 'off', message: '', lastSync: settings?.lastSync || 0 });
  const running = useRef(false);
  const again = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const run = useCallback(async (cfg) => {
    if (!cfg?.token) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setState((s) => ({ ...s, status: 'syncing', message: '' }));
    try {
      const remote = await pull(cfg.token, cfg.gistId);
      // 응답을 기다리는 동안 고친 내용까지 합치도록 지금 시점의 내용을 쓴다
      const merged = merge(mapsRef.current, loadDeleted(), remote);
      if (fingerprint(merged.maps, merged.deleted) !== fingerprint(remote.maps, remote.deleted)) {
        await push(cfg.token, cfg.gistId, merged);
      }
      write(DELETED_KEY, merged.deleted);
      setMaps((cur) => {
        const next = merge(cur, loadDeleted(), merged).maps;
        return fingerprint(next, {}) === fingerprint(cur, {}) ? cur : next;
      });
      const lastSync = Date.now();
      const saved = { ...cfg, lastSync };
      write(SETTINGS_KEY, saved);
      setSettings(saved);
      setState({ status: 'idle', message: '', lastSync });
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', message: e instanceof SyncError ? e.message : '동기화하지 못했어요. 잠시 뒤 다시 시도합니다.' }));
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(() => run(settingsRef.current), 1500);
      }
    }
  }, [mapsRef, setMaps]);

  const connect = useCallback(async (rawToken) => {
    const token = rawToken.trim();
    if (!token) throw new SyncError('auth', '연결 키를 붙여 넣어 주세요.');
    const gistId = await findOrCreateGist(token);
    const cfg = { token, gistId, lastSync: 0 };
    write(SETTINGS_KEY, cfg);
    setSettings(cfg);
    await run(cfg);
  }, [run]);

  const disconnect = useCallback(() => {
    write(SETTINGS_KEY, null);
    setSettings(null);
    setState({ status: 'off', message: '', lastSync: 0 });
  }, []);

  const syncNow = useCallback(() => run(settingsRef.current), [run]);

  // 앱을 열 때, 화면으로 돌아올 때, 그리고 2분마다 다른 기기의 변경을 가져온다
  useEffect(() => {
    if (!settings?.token) return undefined;
    const onShow = () => document.visibilityState === 'visible' && run(settingsRef.current);
    onShow();
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('online', onShow);
    const timer = setInterval(onShow, 120000);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('online', onShow);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.token, settings?.gistId]);

  return { ...state, connected: !!settings?.token, connect, disconnect, syncNow };
}
