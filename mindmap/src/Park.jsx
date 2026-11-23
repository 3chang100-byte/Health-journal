import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, ArrowRight } from 'lucide-react';
import { CATEGORIES, CATEGORY_KEYS, categoryOf, stats, titleOf } from './store.js';
import { growth, plantGeo, progressOf } from './plant.js';

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
  const blob = (b, i) => b.leaf ? (
    // 잎: 가지 끝(밑동)에서 뾰족하게 뻗는 모양 + 잎맥
    <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.rot})`}>
      <path d={`M0 0Q${b.rx * 0.45} ${-b.ry * 1.25} ${b.rx} 0Q${b.rx * 0.45} ${b.ry * 1.25} 0 0Z`} fill={b.fill} />
      <line x1="0" y1="0" x2={b.rx * 0.82} y2="0" stroke="var(--leaf-vein)" strokeWidth={Math.max(0.35, b.rx * 0.04)} strokeLinecap="round" />
    </g>
  ) : (
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

// 정원을 가꾸는 사람: 정원을 오가며 물을 주거나, 갈퀴질하거나, 수레를 민다
const TINTS = ['#3b7dd8', '#d9534f', '#8e59c9', '#2f9e8f'];
const JOBS = ['water', 'rake', 'water', 'barrow'];

function Gardener({ index, y, scale, span }) {
  const job = JOBS[index % JOBS.length];
  const style = { '--a': '30px', '--b': `${span - 30}px`, '--dur': `${Math.max(16, span / 22) + index * 5}s`, '--delay': `${-index * 9}s` };
  return (
    <g transform={`translate(0 ${y})`} aria-hidden="true">
      <g className="g-walk" style={style}>
        <g className="g-face" style={style}>
          <g transform={`scale(${scale})`}>
          <line className="g-leg a" x1="-1.6" y1="-9" x2="-1.6" y2="0" />
          <line className="g-leg b" x1="1.6" y1="-9" x2="1.6" y2="0" />
          <g className="g-body">
            <rect x="-4" y="-19.5" width="8" height="11.5" rx="3" fill={TINTS[index % TINTS.length]} />
            <circle cx="0" cy="-23" r="3.6" fill="var(--g-skin)" />
            <ellipse cx="0" cy="-25.2" rx="6.6" ry="1.5" fill="var(--g-hat)" />
            <path d="M-3.6 -25.4Q0 -31 3.6 -25.4Z" fill="var(--g-hat)" />
            {job === 'water' && (
              <g>
                <line x1="2.5" y1="-16.5" x2="8" y2="-13" className="g-arm" />
                <g className="g-can">
                  <rect x="7" y="-15.5" width="6.5" height="5.5" rx="1" fill="var(--g-tool)" />
                  <line x1="13" y1="-13" x2="18" y2="-16" stroke="var(--g-tool)" strokeWidth="1.4" strokeLinecap="round" />
                </g>
                {[0, 1, 2].map((d) => <circle key={d} className="g-drop" cx={18.5 + d * 0.8} cy="-15" r="0.9" style={{ animationDelay: `${d * 0.3}s` }} />)}
              </g>
            )}
            {job === 'rake' && (
              <g className="g-rake">
                <line x1="2.5" y1="-16.5" x2="7" y2="-12" className="g-arm" />
                <line x1="4" y1="-17" x2="15" y2="-1" stroke="var(--bark)" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="12.5" y1="0" x2="17.5" y2="-2.4" stroke="var(--g-tool)" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            )}
            {job === 'barrow' && (
              <g>
                <line x1="2.5" y1="-16" x2="8" y2="-9.5" className="g-arm" />
                <line x1="7" y1="-9.5" x2="19" y2="-6" stroke="var(--bark)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M10 -11.5H21L19 -5.5H12Z" fill="var(--g-tool)" />
                <path d="M11.5 -11.5Q15.5 -16 19.5 -11.5Z" fill="var(--leaf)" />
                <circle className="g-wheel" cx="20" cy="-2.6" r="2.6" fill="none" stroke="var(--g-pants)" strokeWidth="1.3" strokeDasharray="2 1.2" />
              </g>
            )}
          </g>
          </g>
        </g>
      </g>
    </g>
  );
}

const ROW_H = 134; // 한 줄의 높이
const SKY = 64; // 맨 위 하늘 높이

/** 정원 전체가 하나의 넓은 땅: 화면 너비만큼 줄을 채우며 어떤 씨앗이든 한곳에 심는다 */
function Garden({ maps, onPick }) {
  const boxRef = useRef(null);
  const [w, setW] = useState(360);
  useLayoutEffect(() => {
    const el = boxRef.current;
    const measure = () => setW(Math.max(280, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = w < 520;
  const cols = Math.max(2, Math.floor((w - 20) / (narrow ? 96 : 124)));
  const rows = Math.max(Math.ceil(maps.length / cols), 2);
  const H = SKY + rows * ROW_H + 26;
  const slot = (w - 20) / cols;
  const hands = Math.min(narrow ? 2 : 4, rows + 1);

  // 뒤(위)에서 앞(아래)으로 그려야 겹침이 자연스럽다
  const items = [];
  maps.forEach((m, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const depth = rows > 1 ? 0.84 + 0.16 * (r / (rows - 1)) : 1;
    const x = Math.min(w - 50, Math.max(50, 10 + (c + 0.5) * slot + (r % 2 ? 0.2 : -0.2) * slot * (cols > 2 ? 1 : 0)));
    const y = SKY + (r + 1) * ROW_H - 30;
    const geo = plantGeo(m);
    const g = growth(m);
    const pct = Math.round(progressOf(m) * 100);
    const k = Math.min((104 * g * depth) / geo.bounds.h, ((slot - 16) * (0.45 + 0.55 * g)) / geo.bounds.w, 1.5);
    const name = titleOf(m);
    items.push({
      y,
      el: (
        <g
          key={m.id}
          className="plant"
          role="button"
          tabIndex={0}
          aria-label={`${name}, ${CATEGORIES[categoryOf(m)].plantName}, ${m.completedAt ? '완료' : `진행 ${pct}%`}, 마인드맵 열기`}
          onClick={() => onPick(m.id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(m.id))}
        >
          <rect x={x - slot / 2 + 4} y={y - 104} width={slot - 8} height="128" rx="8" fill="transparent" />
          <g transform={`translate(${x} ${y}) scale(${k})`}><PlantShapes geo={geo} /></g>
          <text x={x} y={y + 13} textAnchor="middle" className="plant-name">{name.slice(0, 7)}{name.length > 7 ? '…' : ''}</text>
          <text x={x} y={y + 23} textAnchor="middle" className="plant-pct">{m.completedAt ? '완료' : `${pct}%`}</text>
        </g>
      ),
    });
  });
  for (let i = 0; i < hands; i++) {
    const y = SKY + 46 + (hands > 1 ? (i * (H - SKY - 70)) / (hands - 1) : 40);
    items.push({ y: y - 1, el: <Gardener key={`g${i}`} index={i} y={y} scale={1.35 + 0.25 * (y / H)} span={w} /> });
  }
  items.sort((a, b) => a.y - b.y);

  const hill = (top, amp) => `M0 ${H}V${top}C${w * 0.18} ${top - amp} ${w * 0.34} ${top - amp * 1.3} ${w * 0.5} ${top - amp * 0.4}C${w * 0.68} ${top + amp * 0.5} ${w * 0.84} ${top - amp} ${w} ${top - amp * 0.2}V${H}Z`;
  return (
    <div className="garden" ref={boxRef}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="group" aria-label="정원">
        <path d={hill(SKY, 14)} fill="var(--ground)" />
        <path d={hill(SKY + (H - SKY) * 0.55, 10)} fill="var(--ground-2)" />
        {!maps.length && <text x={w / 2} y={SKY + 60} textAnchor="middle" className="zone-empty">‘새로 심기’로 첫 씨앗을 심어 보세요</text>}
        {items.map((it) => it.el)}
      </svg>
    </div>
  );
}

export function Park({ maps, onPick }) {
  const sorted = useMemo(() => [...maps].sort((a, b) => a.createdAt - b.createdAt), [maps]);
  const done = maps.filter((m) => m.completedAt).length;
  const li = LEVELS.reduce((acc, l, i) => (done >= l.at ? i : acc), 0);
  const next = LEVELS[li + 1];
  const kinds = CATEGORY_KEYS.map((k) => [CATEGORIES[k].plantName, maps.filter((m) => categoryOf(m) === k).length]).filter(([, n]) => n);

  return (
    <div className="park">
      <div className="park-status">
        <div>
          <span className="park-level">정원 단계 {li + 1}</span>
          <strong>{LEVELS[li].name}</strong>
        </div>
        <p>
          {kinds.length ? kinds.map(([name, n]) => `${name} ${n}`).join(' · ') : '아직 심은 것이 없어요'} · 다 자란 것 {done}개
          {next ? ` · ‘${next.name}’까지 ${next.at - done}개` : ' · 가장 높은 단계예요'}
        </p>
        {next && <span className="bar"><i style={{ width: `${((done - LEVELS[li].at) / (next.at - LEVELS[li].at)) * 100}%` }} /></span>}
      </div>
      <Garden maps={sorted} onPick={onPick} />
      <p className="foot">마인드맵을 시작하면 바로 정원에 심기고, 할 일을 끝낼수록 자랍니다. 나무·열매 나무·꽃·덤불을 한 정원에 섞어 심을 수 있어요. 식물을 누르면 그 마인드맵이 열립니다.</p>
    </div>
  );
}

export function PlantView({ map, onOpen, openLabel = '마인드맵 열기', onToggleDone, onClose }) {
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
            <p>{info.plantName} · {map.completedAt ? '완료' : '자라는 중'} · 가지 {s.nodes - 1}개{s.total ? ` · 할 일 ${s.done}/${s.total}` : ''}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </header>
        <div className="plant-stage">
          <svg viewBox={vb} style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 100}%` }} aria-hidden="true">
            <ellipse cx="0" cy="2" rx={Math.max(30, b.w * 0.3)} ry="5" fill="var(--ground)" />
            <PlantShapes geo={geo} labels />
          </svg>
        </div>
        <p className="fine">{info.plant === 'flower' ? '꽃잎 하나가 가지 하나입니다. 흐린 꽃잎은 아직 할 일이 남은 가지예요.' : info.plant === 'bush' ? '덩이 하나가 가지 하나이고, 열매는 끝낸 할 일입니다.' : '가지가 마인드맵의 가지이고, 잎 하나가 맨 끝 항목 하나입니다. 짙은 잎은 끝낸 일이고, 완료하면 곁잎까지 돋아요.'}</p>
        <footer>
          <div className="plant-zoom">
            <button className="icon-btn" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="축소"><ZoomOut size={18} /></button>
            <button className="icon-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="확대"><ZoomIn size={18} /></button>
          </div>
          <button className="ghost-btn" onClick={onToggleDone}>{map.completedAt ? '완료 취소' : '프로젝트 완료'}</button>
          <button className="solid-btn" onClick={onOpen}>{openLabel} <ArrowRight size={15} /></button>
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
