import { useEffect, useRef } from 'react';
import { inputBus } from '../../input/inputBus';
import { HOVER_SETTLE_MS } from '../../config/settings';

// A point this close to an option (in px) still counts as on it - gaze is never pixel-exact.
const NEAR_PX = 60;

function distanceToRect(x, y, r) {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

/*
  Cursor mode: a soft circle that follows where the patient is looking.
  The option under it (or nearest to it) becomes highlighted once the circle
  has rested there for HOVER_SETTLE_MS, so passing over other options on the
  way does not make the highlight flicker.

  Moves straight in the DOM (no React re-render per frame).
  With `followMouse`, the mouse drives it too - handy for testing without a webcam.
*/
export default function GazeCursor({ boardRef, followMouse, onHover }) {
  const dot = useRef(null);
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  useEffect(() => {
    let current = -1;
    let candidate = -1;
    let timer = 0;

    const hitTest = (x, y) => {
      const tiles = boardRef.current?.querySelectorAll('.tile') ?? [];
      let best = -1;
      let bestD = NEAR_PX;
      tiles.forEach((el, i) => {
        const d = distanceToRect(x, y, el.getBoundingClientRect());
        if (d < bestD || (d === 0 && bestD !== 0)) {
          best = i;
          bestD = d;
        }
      });
      return best;
    };

    const place = (x, y) => {
      const el = dot.current;
      if (!el) return;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.add('is-visible');

      const i = hitTest(x, y);
      if (i < 0 || i === candidate) return;
      candidate = i;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (candidate !== current) {
          current = candidate;
          onHoverRef.current(current);
        }
      }, HOVER_SETTLE_MS);
    };

    const offBus = inputBus.on((e) => {
      if (e.type === 'point') place((e.x / 100) * window.innerWidth, (e.y / 100) * window.innerHeight);
    });
    const onMouse = (e) => place(e.clientX, e.clientY);
    if (followMouse) window.addEventListener('mousemove', onMouse);

    return () => {
      offBus();
      clearTimeout(timer);
      window.removeEventListener('mousemove', onMouse);
    };
  }, [boardRef, followMouse]);

  return <div ref={dot} className="gaze-cursor" aria-hidden="true" />;
}
