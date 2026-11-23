import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// 설명을 보여 줄 대상: data-tip 이 있거나, 이름(aria-label)이 붙은 버튼·링크
const TARGET = '[data-tip], button[aria-label], a[aria-label], [role="button"][aria-label]';
const DELAY = 350;

/**
 * 화면 전체에서 하나만 쓰는 말풍선. 마우스를 올리거나 키보드로 초점을 옮기면
 * 그 버튼이 무슨 기능인지 보여 준다. 터치에서는 누르는 순간 동작하므로 띄우지 않는다.
 */
export default function Tooltip() {
  const [tip, setTip] = useState(null); // { text, rect }
  const [pos, setPos] = useState(null);
  const boxRef = useRef(null);
  const timer = useRef(0);
  const current = useRef(null);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      current.current = null;
      setTip(null);
      setPos(null);
    };
    const show = (el, delay) => {
      if (el === current.current) return;
      hide();
      const text = el.dataset.tip || el.getAttribute('aria-label');
      if (!text) return;
      current.current = el;
      timer.current = setTimeout(() => {
        if (el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      }, delay);
    };
    const onOver = (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest?.(TARGET);
      if (el) show(el, DELAY);
      else if (current.current) hide();
    };
    const onFocus = (e) => {
      const el = e.target.closest?.(TARGET);
      if (el && e.target.matches(':focus-visible')) show(el, 0);
    };
    const onKey = (e) => e.key === 'Escape' && hide();

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', onKey);
    document.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('wheel', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // 크기를 잰 뒤 화면 밖으로 나가지 않게 자리를 잡는다: 기본은 아래, 자리가 없으면 위
  useLayoutEffect(() => {
    if (!tip || !boxRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    const { rect } = tip;
    const gap = 8;
    const below = rect.bottom + gap + box.height <= window.innerHeight - 4;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - box.width / 2, 6), window.innerWidth - box.width - 6);
    setPos({ left, top: below ? rect.bottom + gap : rect.top - gap - box.height });
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={boxRef} className="tooltip" role="tooltip" style={pos ? { left: pos.left, top: pos.top, opacity: 1 } : { left: 0, top: 0, opacity: 0 }}>
      {tip.text}
    </div>
  );
}
