import { useEffect, useRef, useState } from 'react';
import { onFrame } from './faceTracker';
import { GazeEngine } from './gazeEngine';
import { inputBus } from './inputBus';

/*
  Connects the face tracker to the input bus (or to a custom handler, used by
  the calibration test screen). Returns live tracking info for the UI.
*/
export function useCameraInput({ enabled, calibration, holdMs, onEvent = inputBus.emit }) {
  const engine = useRef(null);
  engine.current ??= new GazeEngine();

  const handler = useRef(onEvent);
  handler.current = onEvent;

  const [info, setInfo] = useState({ face: 'found', looking: 'center', people: 0 });
  const last = useRef(info);

  useEffect(() => {
    engine.current.configure({ calibration, holdMs });
  }, [calibration, holdMs]);

  useEffect(() => {
    if (!enabled) return undefined;
    const eng = engine.current;
    eng.reset();

    const off = onFrame((frame) => {
      const out = eng.process(frame.features, frame.t);
      out.events.forEach((e) => handler.current(e));
      const people = frame.faces?.length ?? 0;
      // Only re-render when something visible changes.
      if (out.face !== last.current.face || out.looking !== last.current.looking || people !== last.current.people) {
        last.current = { face: out.face, looking: out.looking, people };
        setInfo(last.current);
      }
    });

    return () => {
      off();
      handler.current({ type: 'hold', progress: 0 });
    };
  }, [enabled]);

  return info;
}
