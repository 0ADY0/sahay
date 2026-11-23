import { useEffect } from 'react';
import { inputBus } from './inputBus';
import { CHOOSE_WINDOW_MS, REST_CLOSE_MS } from '../config/settings';

const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

/*
  Keyboard stand-in for the camera, so the interface can be built and demoed
  without a webcam. Space behaves exactly like closing the eyes:
    Arrow keys              -> look left / right / up / down
    Hold Space, release     -> close eyes, then open (chooses once the bar is full)
    Tap Space 4x quickly    -> quick blinks (emergency gesture)
    Hold Space 8 s          -> long rest (screen goes to rest mode)
    Enter                   -> choose immediately
    Escape                  -> cancel / skip
*/
export function useKeyboardInput({ enabled = true, holdMs = 800 } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;

    let holdStart = null;
    let raf = 0;
    let restFired = false;

    const tick = () => {
      if (holdStart == null) return;
      const dur = performance.now() - holdStart;
      const progress = Math.min(1, dur / holdMs);
      const state = dur > holdMs + CHOOSE_WINDOW_MS ? 'over' : progress >= 1 ? 'ready' : 'filling';
      inputBus.emit({ type: 'hold', progress, state });
      if (dur >= REST_CLOSE_MS && !restFired) {
        restFired = true;
        inputBus.emit({ type: 'rest' });
      }
      raf = requestAnimationFrame(tick);
    };

    const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);

    const onDown = (e) => {
      if (isTyping(e)) return;
      if (ARROWS[e.key]) {
        e.preventDefault();
        if (!e.repeat) inputBus.emit({ type: 'move', dir: ARROWS[e.key] });
      } else if (e.key === ' ') {
        e.preventDefault();
        if (e.repeat || holdStart != null) return;
        holdStart = performance.now();
        restFired = false;
        raf = requestAnimationFrame(tick);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        inputBus.emit({ type: 'select' });
      } else if (e.key === 'Escape') {
        inputBus.emit({ type: 'cancel' });
      }
    };

    const onUp = (e) => {
      if (e.key !== ' ' || holdStart == null) return;
      const dur = performance.now() - holdStart;
      holdStart = null;
      cancelAnimationFrame(raf);
      if (dur >= holdMs && dur <= holdMs + CHOOSE_WINDOW_MS) inputBus.emit({ type: 'select' });
      else if (dur < holdMs) inputBus.emit({ type: 'blink' });
      inputBus.emit({ type: 'hold', progress: 0, state: 'open' });
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      cancelAnimationFrame(raf);
    };
  }, [enabled, holdMs]);
}
