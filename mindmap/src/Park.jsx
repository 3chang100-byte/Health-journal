import React, { useMemo, useState } from 'react';
import { X, ZoomIn, ZoomOut, ArrowRight } from 'lucide-react';
import { CATEGORIES, CATEGORY_KEYS, categoryOf, stats, titleOf } from './store.js';
import { growth, plantGeo } from './plant.js';

const LEVELS = [
  { at: 0, name: '빈터' },
  { at: 1, name: '새싹 정원' },
  { at: 3, name: '작은 숲' },
  { at: 6, name: '숲길' },
  { at: 10, name: '울창한 숲' },
];

function PlantShapes({ geo, labels }) {
  const under = geo.blobs.filter((b) => !b.top);
  const over = geo.blobs.filter((b) => b.top);
  const blob = (b, i) => (
    <ellipse key={i} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} fill={b.fill} opacity={b.opacity ?? 1} transform={b.rot ? `rotate(${b.rot} ${b.x} ${b.y})` : undefined} />
  );
  return (
    <>
      {geo.segs.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stem ? 'var(--leaf)' : 'var(--bark)'} strokeWidth={s.w} strokeLinecap="round" />
      ))}
      {under.map(blob)}
      {over.map(blob)}
      {labels && geo.labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} className={`plant-label ${l.strong ? 'strong' : ''}`}>{l.text}</text>
      ))}
    </>
  );
}

function Zone({ cat, maps, onPick }) {
  const info = CATEGORIES[cat];
  const done = maps.filter((m) => m.completedAt).length;
  const shown = maps.slice(0, 10);
  const perRow = shown.length > 5 ? Math.ceil(shown.length / 2) : shown.length;

  return (
    <section className="zone">
      <header>
        <h2>{info.zone}</h2>
        <span>{maps.length ? `${info.plantName} ${done} · 자라는 중 ${maps.length - done}` : '비어 있음'}</span>
      </header>
      <svg viewBox="0 34 360 166" role="group" aria-label={`${info.zone} 구역`}>
        <path d="M0 200V168C60 150 120 146 180 150C240 154 300 150 360 160V200Z" fill="var(--ground)" />
        <path d="M0 200V182C80 170 150 172 220 178C280 183 320 178 360 176V200Z" fill="var(--ground-2)" />
        {!shown.length && (
          <text x="180" y="120" textAnchor="middle" className="zone-empty">‘{info.label}’ 프로젝트를 시작하면 여기에 {info.plantName}가 자라요</text>
        )}
        {shown.map((m, i) => {
          const back = shown.length > 5 && i >= perRow;
          const col = back ? i - perRow : i;
          const cols = back ? shown.length - perRow : perRow;
          const x = cols === 1 ? 180 : 40 + (col * 280) / (cols - 1) + (back ? 14 : 0);
          const y = back ? 160 : 176;
          const geo = plantGeo(m);
          const g = growth(m);
          const k = Math.min((back ? 96 : 122) * g / geo.bounds.h, 84 / geo.bounds.w, 1.25);
          return (
            <g
              key={m.id}
              className="plant"
              role="button"
              tabIndex={0}
              aria-label={`${titleOf(m)} ${m.completedAt ? '완료' : '자라는 중'}, 확대해서 보기`}
              onClick={() => onPick(m.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(m.id))}
            >
              <rect x={x - 34} y={y - 126} width="68" height="142" fill="transparent" />
              <g transform={`translate(${x} ${y}) scale(${k})`} opacity={back ? 0.9 : 1}><PlantShapes geo={geo} /></g>
              <text x={x} y={y + 13} textAnchor="middle" className="plant-name">{titleOf(m).slice(0, 7)}{titleOf(m).length > 7 ? '…' : ''}</text>
            </g>
          );
        })}
      </svg>
      {maps.length > shown.length && <p className="zone-more">외 {maps.length - shown.length}개 더 자라고 있어요</p>}
    </section>
  );
}

export function Park({ maps, onPick }) {
  const byCat = useMemo(() => {
    const out = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, []]));
    [...maps].sort((a, b) => a.createdAt - b.createdAt).forEach((m) => out[categoryOf(m)].push(m));
    return out;
  }, [maps]);
  const done = maps.filter((m) => m.completedAt).length;
  const li = LEVELS.reduce((acc, l, i) => (done >= l.at ? i : acc), 0);
  const next = LEVELS[li + 1];

  return (
    <div className="park">
      <div className="park-status">
        <div>
          <span className="park-level">공원 단계 {li + 1}</span>
          <strong>{LEVELS[li].name}</strong>
        </div>
        <p>
          완료한 프로젝트 {done}개 · 자라는 중 {maps.length - done}개
          {next ? ` · ‘${next.name}’까지 ${next.at - done}개` : ' · 가장 높은 단계예요'}
        </p>
        {next && <span className="bar"><i style={{ width: `${((done - LEVELS[li].at) / (next.at - LEVELS[li].at)) * 100}%` }} /></span>}
      </div>
      <div className="zones">
        {CATEGORY_KEYS.map((k) => <Zone key={k} cat={k} maps={byCat[k]} onPick={onPick} />)}
      </div>
      <p className="foot">프로젝트의 할 일을 끝낼수록 식물이 자라고, 프로젝트를 완료하면 다 자란 모습으로 공원에 남습니다. 식물을 누르면 확대해서 마인드맵을 볼 수 있어요.</p>
    </div>
  );
}

export function PlantView({ map, onOpen, onToggleDone, onClose }) {
  const [zoom, setZoom] = useState(1);
  const geo = useMemo(() => plantGeo(map, true), [map]);
  const info = CATEGORIES[categoryOf(map)];
  const s = stats(map.root);
  const b = geo.bounds;
  const pad = 46;
  const vb = `${b.minX - pad} ${b.minY - 14} ${b.w + pad * 2} ${b.h + 26}`;

  return (
    <div className="dialog-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="plant-view" role="dialog" aria-modal="true" aria-label={`${titleOf(map)} 확대 보기`}>
        <header>
          <div>
            <h2>{titleOf(map)}</h2>
            <p>{info.zone} · {info.plantName} · {map.completedAt ? '완료' : '자라는 중'} · 가지 {s.nodes - 1}개{s.total ? ` · 할 일 ${s.done}/${s.total}` : ''}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </header>
        <div className="plant-stage">
          <svg viewBox={vb} style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 100}%` }} aria-hidden="true">
            <ellipse cx="0" cy="2" rx={Math.max(30, b.w * 0.3)} ry="5" fill="var(--ground)" />
            <PlantShapes geo={geo} labels />
          </svg>
        </div>
        <p className="fine">{info.plant === 'flower' ? '꽃잎 하나가 가지 하나입니다. 흐린 꽃잎은 아직 할 일이 남은 가지예요.' : info.plant === 'bush' ? '덩이 하나가 가지 하나이고, 열매는 끝낸 할 일입니다.' : '가지가 마인드맵의 가지이고, 잎은 끝낸 일입니다. 완료하면 잎이 모두 돋아요.'}</p>
        <footer>
          <div className="plant-zoom">
            <button className="icon-btn" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="축소"><ZoomOut size={18} /></button>
            <button className="icon-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="확대"><ZoomIn size={18} /></button>
          </div>
          <button className="ghost-btn" onClick={onToggleDone}>{map.completedAt ? '완료 취소' : '프로젝트 완료'}</button>
          <button className="solid-btn" onClick={onOpen}>마인드맵 열기 <ArrowRight size={15} /></button>
        </footer>
      </div>
    </div>
  );
}

export function TemplatePicker({ title, note, onPick, onClose }) {
  return (
    <div className="dialog-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p>{note}</p>
        <div className="templates">
          {CATEGORY_KEYS.map((k) => (
            <button key={k} onClick={() => { onPick(k); onClose(); }}>
              <strong>{CATEGORIES[k].label}</strong>
              <small>{CATEGORIES[k].desc}</small>
            </button>
          ))}
        </div>
        <div className="dialog-actions"><button className="ghost-btn" onClick={onClose}>취소</button></div>
      </div>
    </div>
  );
}
