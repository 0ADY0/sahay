import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { MESSAGES, GRID_COLUMNS, EMERGENCY, customToMessage } from '../../config/messages';
import {
  BLINK_HOLDS,
  CONFIRM_MS,
  EMERGENCY_BLINKS,
  EMERGENCY_WINDOW_MS,
  FOLLOWUP_TIMEOUT_MS,
  SCAN_SPEEDS,
  WAKE_CHOICES,
  WAKE_WINDOW_MS,
} from '../../config/settings';
import { inputBus } from '../../input/inputBus';
import { useKeyboardInput } from '../../input/useKeyboardInput';
import { useCameraInput } from '../../input/useCameraInput';
import { useTrackerStatus } from '../../input/faceTracker';
import { latestActiveRequest, useWard, wardActions } from '../../lib/wardStore';
import { usePersistentState } from '../../lib/persist';
import { speak } from '../../lib/speech';
import { useNow } from '../../lib/time';
import CameraPreview from './CameraPreview';
import SettingsPanel from './SettingsPanel';
import GazeCursor from './GazeCursor';
import { PhaseOverlay, RequestStatus, RestOverlay, Tile } from './BoardParts';

function moveInGrid(i, dir, count) {
  const rows = Math.ceil(count / GRID_COLUMNS);
  let col = i % GRID_COLUMNS;
  let row = Math.floor(i / GRID_COLUMNS);
  if (dir === 'left') col = Math.max(0, col - 1);
  if (dir === 'right') col = Math.min(GRID_COLUMNS - 1, col + 1);
  if (dir === 'up') row = Math.max(0, row - 1);
  if (dir === 'down') row = Math.min(rows - 1, row + 1);
  return Math.min(count - 1, row * GRID_COLUMNS + col);
}

const INSTRUCTIONS = {
  scan: 'When your choice is highlighted, close your eyes until the bar fills, then open them.',
  gaze: 'Look left, right, up or down to move. Close your eyes until the bar fills, then open them to choose.',
  cursor: 'Look at an option — the circle follows your eyes. Close your eyes until the bar fills, then open them to choose.',
};

const MODE_LABELS = { scan: 'Scan mode', gaze: 'Gaze mode', cursor: 'Cursor mode' };

function trackingLabel(input, tracker, face, people, resting) {
  if (resting) return { text: 'Resting', tone: 'ok' };
  if (input !== 'camera') return { text: 'Keyboard input', tone: 'ok' };
  if (tracker.state === 'starting') return { text: 'Camera starting', tone: 'warn' };
  if (tracker.state === 'error' || tracker.state === 'off') return { text: 'Camera not working', tone: 'danger' };
  if (face === 'lost') return { text: people > 0 ? 'Patient not in view' : 'Can’t see face', tone: 'warn' };
  if (people > 1) return { text: 'Tracking patient · others ignored', tone: 'ok' };
  return { text: 'Tracking', tone: 'ok' };
}

/*
  The patient's board.

  phase:
    idle      -> the patient is choosing
    confirm   -> "Sending…" countdown; choosing again cancels
    followup  -> extra questions after a request (e.g. pain level and place)
    sent / cancelled -> short feedback, then back to idle
  resting (separate from phase): the screen is paused until the patient wakes it.
*/
export default function Board({ bed, input, settings, calibration, onSettingsChange, onRecalibrate, onExit }) {
  const [index, setIndex] = useState(0);
  const [hold, setHold] = useState({ progress: 0, state: 'open' });
  const [phase, setPhase] = useState({ name: 'idle' });
  const [resting, setResting] = useState(false);
  const [wakeCount, setWakeCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [custom, setCustom] = usePersistentState(`sahay.custom.bed${bed.id}`, { items: [] });

  const ward = useWard();
  const now = useNow(1000);

  const holdMs = BLINK_HOLDS.find((b) => b.id === settings.blinkHold)?.ms ?? 800;
  const scanMs = SCAN_SPEEDS.find((s) => s.id === settings.scanSpeed)?.ms ?? 1900;
  const mode = settings.mode;
  const voice = settings.voice;

  // What is on the board right now: the main messages, or the options of a follow-up question.
  const boardItems = useMemo(() => [...MESSAGES, ...custom.items.map(customToMessage)], [custom]);
  const followUp = phase.name === 'followup' ? phase.message.followUps[phase.step] : null;
  const items = followUp ? followUp.options : boardItems;
  const rows = Math.ceil(items.length / GRID_COLUMNS);
  const current = Math.min(index, items.length - 1);

  /* ---------- Inputs ---------- */

  // The keyboard always works too, so a caregiver can help or test.
  useKeyboardInput({ enabled: !settingsOpen, holdMs });

  const tracker = useTrackerStatus();
  const { face, people } = useCameraInput({
    enabled: input === 'camera' && tracker.state === 'running' && !settingsOpen,
    calibration,
    holdMs,
  });
  const faceLost = input === 'camera' && tracker.state === 'running' && face === 'lost';
  const gazeNeedsCalibration = input === 'camera' && (mode === 'gaze' || mode === 'cursor') && !calibration?.dirs;
  const status = trackingLabel(input, tracker, face, people, resting);

  /* ---------- Actions ---------- */

  const boardRef = useRef(null);
  const blinkTimes = useRef([]);
  const wakeTimes = useRef([]);

  const say = (text, opts) => voice && speak(text, opts);

  const choose = (message) => setPhase({ name: 'confirm', message, startedAt: Date.now() });

  const finishFollowUp = (p, answers, { quiet = false } = {}) => {
    const summary = p.message.summarize?.(answers) || Object.values(answers).join(', ');
    if (summary && !quiet) say(summary);
    setIndex(0);
    setPhase({ name: 'sent', message: p.message, summary });
  };

  const answer = (option) => {
    const fu = phase.message.followUps[phase.step];
    const answers = { ...phase.answers, [fu.id]: option.label };
    // The nurse sees each answer as soon as it is given.
    wardActions.addDetails(phase.requestId, { [fu.id]: option.label });
    const next = phase.message.followUps[phase.step + 1];
    if (next) {
      setIndex(0);
      setPhase({ ...phase, step: phase.step + 1, answers, startedAt: Date.now() });
      say(next.question);
    } else {
      finishFollowUp(phase, answers);
    }
  };

  const enterRest = () => {
    wakeTimes.current = [];
    setWakeCount(0);
    setResting(true);
  };

  const wake = () => {
    wakeTimes.current = [];
    setWakeCount(0);
    setResting(false);
    setIndex(0);
  };

  const emergencyGesture = () => {
    const isEmergency = phase.message?.id === 'emergency';
    if ((phase.name === 'confirm' || phase.name === 'sent') && isEmergency) return;
    if (phase.name === 'followup') finishFollowUp(phase, phase.answers, { quiet: true });
    wake();
    setPhase({ name: 'confirm', message: EMERGENCY, startedAt: Date.now(), viaGesture: true });
    say('Emergency?');
  };

  const handle = (e) => {
    const t = Date.now();
    switch (e.type) {
      case 'hold':
        setHold({ progress: e.progress, state: e.state ?? (e.progress > 0 ? 'filling' : 'open') });
        break;

      case 'blink':
        if (!settings.blinkEmergency) break;
        blinkTimes.current = [...blinkTimes.current.filter((b) => t - b < EMERGENCY_WINDOW_MS), t];
        if (blinkTimes.current.length >= EMERGENCY_BLINKS) {
          blinkTimes.current = [];
          emergencyGesture();
        }
        break;

      case 'rest':
        if (phase.name === 'idle' && !resting) enterRest();
        break;

      case 'hover':
        // Cursor mode: the option under the cursor becomes the highlighted one,
        // except while the eyes are closing (so the choice stays put).
        if (resting || mode !== 'cursor' || hold.state !== 'open') break;
        if (phase.name === 'idle' || phase.name === 'followup') setIndex(e.index);
        break;

      case 'move':
        if (resting || mode !== 'gaze') break;
        if (phase.name === 'idle' || phase.name === 'followup') {
          setIndex((i) => moveInGrid(Math.min(i, items.length - 1), e.dir, items.length));
        }
        break;

      case 'select':
        if (resting) {
          wakeTimes.current = [...wakeTimes.current.filter((w) => t - w < WAKE_WINDOW_MS), t];
          if (wakeTimes.current.length >= WAKE_CHOICES) wake();
          else setWakeCount(wakeTimes.current.length);
        } else if (phase.name === 'idle') choose(items[current]);
        else if (phase.name === 'confirm') setPhase({ name: 'cancelled' });
        else if (phase.name === 'followup') answer(items[current]);
        break;

      case 'cancel':
        if (resting) wake();
        else if (phase.name === 'confirm') setPhase({ name: 'cancelled' });
        else if (phase.name === 'followup') finishFollowUp(phase, phase.answers);
        break;

      default:
    }
  };

  // The bus listener is registered once and always calls the latest handler.
  const handler = useRef(handle);
  handler.current = handle;
  useEffect(() => inputBus.on((e) => handler.current(e)), []);

  /* ---------- Timers ---------- */

  useEffect(() => {
    if (phase.name === 'confirm') {
      const t = setTimeout(() => {
        const m = phase.message;
        const record = wardActions.send(bed.id, m);
        say(m.spoken);
        if (m.followUps?.length) {
          setIndex(0);
          setPhase({ name: 'followup', message: m, requestId: record.id, step: 0, answers: {}, startedAt: Date.now() });
          say(m.followUps[0].question, { queue: true });
        } else {
          setPhase({ name: 'sent', message: m });
        }
      }, CONFIRM_MS);
      return () => clearTimeout(t);
    }
    if (phase.name === 'followup') {
      // No answer for a while: keep what we have and go back to the board.
      const t = setTimeout(() => handler.current({ type: 'cancel' }), FOLLOWUP_TIMEOUT_MS);
      return () => clearTimeout(t);
    }
    if (phase.name === 'sent' || phase.name === 'cancelled') {
      const t = setTimeout(
        () => {
          setPhase({ name: 'idle' });
          if (mode === 'scan') setIndex(0);
        },
        phase.name === 'sent' ? 2400 : 1200,
      );
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan mode: the highlight steps through the options. Pauses while the eyes are closed.
  const holding = hold.state !== 'open';
  const scanning = phase.name === 'idle' || phase.name === 'followup';
  useEffect(() => {
    if (mode !== 'scan' || !scanning || holding || resting || settingsOpen || faceLost) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), scanMs);
    return () => clearInterval(t);
  }, [mode, scanning, holding, resting, scanMs, settingsOpen, faceLost, items.length]);

  /* ---------- Nurse station link ---------- */

  const beat = useRef(null);
  beat.current = { input, mode, tracking: resting ? 'resting' : status.tone === 'ok' ? 'ok' : status.text };
  useEffect(() => {
    const send = () => wardActions.heartbeat(bed.id, beat.current);
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
  }, [bed.id, status.text, mode, resting]);

  // Tell the patient when the nurse has seen their request.
  const active = latestActiveRequest(ward, bed.id);
  const announced = useRef(null);
  useEffect(() => {
    if (!active) return;
    const key = `${active.id}:${active.status}`;
    if (announced.current === null) {
      announced.current = key; // don't announce what was already true when the screen opened
      return;
    }
    if (active.status === 'ack' && announced.current !== key) say('The nurse has seen your request.');
    announced.current = key;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Render ---------- */

  let instruction = <p className="bedside-instruction">{INSTRUCTIONS[mode]}</p>;
  if (followUp) {
    instruction = (
      <p className="bedside-instruction is-question">
        {followUp.question}
        <span className="question-count">
          Question {phase.step + 1} of {phase.message.followUps.length}
        </span>
      </p>
    );
  } else if (faceLost) {
    instruction = <p className="bedside-instruction is-warn">I can&rsquo;t see your face. Please move into view of the camera.</p>;
  } else if (gazeNeedsCalibration) {
    instruction = (
      <p className="bedside-instruction is-warn">Gaze mode needs calibration. Open settings to calibrate, or use scan mode.</p>
    );
  }

  const highlightOn = (phase.name === 'idle' || phase.name === 'followup') && !resting;
  const showCursor =
    mode === 'cursor' && !resting && highlightOn && (input === 'keyboard' || (tracker.state === 'running' && calibration?.dirs));

  return (
    <div className="bedside">
      <header className="bedside-bar">
        <div className="bedside-id">
          <span className="brand-mark" aria-hidden="true" />
          <span className="bedside-bed">Bed {bed.id}</span>
          <span className="bedside-name">{bed.patient}</span>
        </div>
        <div className="bedside-tools">
          <span className="pill">{MODE_LABELS[mode] ?? 'Scan mode'}</span>
          <span className="pill">
            <span className={`dot dot-${status.tone}`} /> {status.text}
          </span>
          {input === 'camera' && settings.showCamera && <CameraPreview className="cam-thumb" face={face} />}
          <button className="btn btn-ghost btn-icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      {instruction}

      <main className="board-wrap">
        <div ref={boardRef} className={`board ${followUp ? 'board-followup' : ''}`} style={{ '--cols': GRID_COLUMNS, '--rows': rows }}>
          {items.map((item, i) => (
            <Tile
              key={item.id}
              item={item}
              active={highlightOn && i === current}
              hold={hold}
              onClick={() => {
                setIndex(i);
                if (phase.name === 'idle') choose(item);
                else if (phase.name === 'followup') answer(item);
              }}
            />
          ))}
        </div>

        {['confirm', 'sent', 'cancelled'].includes(phase.name) && <PhaseOverlay phase={phase} hold={hold} />}
      </main>

      <footer className="bedside-status">
        <RequestStatus active={active} now={now} />
        <span className="footer-hints">
          {settings.blinkEmergency && <span className="emergency-hint">Emergency: blink quickly 4 times</span>}
          {input === 'keyboard' && (
            <span className="key-hint">
              {mode === 'gaze' && (
                <>
                  <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> move &middot;{' '}
                </>
              )}
              {mode === 'cursor' && <>move the mouse to point &middot; </>}
              hold &amp; release <kbd>Space</kbd> to choose &middot; tap 4&times; for emergency
            </span>
          )}
        </span>
      </footer>

      {showCursor && (
        <GazeCursor
          key={`${phase.name}-${phase.step ?? 0}`}
          boardRef={boardRef}
          followMouse={input === 'keyboard'} onHover={(i) => handler.current({ type: 'hover', index: i })} />
      )}

      {resting && (
        <RestOverlay wakeCount={wakeCount} blinkEmergency={settings.blinkEmergency} onWake={wake} />
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          input={input}
          custom={custom.items}
          onCustomChange={(next) => setCustom({ items: next })}
          onRest={() => {
            setSettingsOpen(false);
            enterRest();
          }}
          onRecalibrate={() => {
            setSettingsOpen(false);
            onRecalibrate();
          }}
          onChange={onSettingsChange}
          onClose={() => setSettingsOpen(false)}
          onExit={onExit}
        />
      )}
    </div>
  );
}
