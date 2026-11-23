import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CircleAlert, Eye, RotateCcw, Users } from 'lucide-react';
import { onFrame, startTracker, useTrackerStatus } from '../../input/faceTracker';
import { AXES, maskFor, toVector } from '../../input/gazeEngine';
import { CALIBRATION_VERSION } from '../../lib/calibrationStore';
import { CALIB_POINTS } from '../../config/settings';
import { useCameraInput } from '../../input/useCameraInput';
import { speak } from '../../lib/speech';
import { tone } from '../../lib/sound';
import CameraPreview from './CameraPreview';

/*
  Three stages:
    check   - caregiver positions the camera until the face is found
    steps   - patient looks at a dot in five places, then closes their eyes
    result  - what was learned + a live test before using the board
*/

const STEPS = [
  { id: 'center', text: 'Look at the dot', say: 'Look at the dot in the middle of the screen.', x: CALIB_POINTS.center[0], y: CALIB_POINTS.center[1], settle: 2200 },
  { id: 'left', text: 'Look to the left', say: 'Now look to the left.', x: CALIB_POINTS.left[0], y: CALIB_POINTS.left[1], settle: 1400 },
  { id: 'right', text: 'Look to the right', say: 'Now look to the right.', x: CALIB_POINTS.right[0], y: CALIB_POINTS.right[1], settle: 1400 },
  { id: 'up', text: 'Look up', say: 'Now look up.', x: CALIB_POINTS.up[0], y: CALIB_POINTS.up[1], settle: 1400 },
  { id: 'down', text: 'Look down', say: 'Now look down.', x: CALIB_POINTS.down[0], y: CALIB_POINTS.down[1], settle: 1400 },
  { id: 'closed', text: 'Close your eyes', sub: 'Open them when you hear the tone', say: 'Close your eyes, and open them when you hear the tone.', x: 50, y: 52, settle: 2600 },
];
// Eyes-only patients are reminded to keep the head still, so only the eyes are learned.
function stepsFor(track) {
  if (track !== 'eyes') return STEPS;
  return STEPS.map((s) => {
    if (s.id === 'center') return { ...s, sub: 'Keep your head still', say: 'Look at the dot in the middle of the screen. Keep your head still.' };
    if (['left', 'right', 'up', 'down'].includes(s.id)) return { ...s, sub: 'Move only your eyes', say: `${s.say} Move only your eyes.` };
    return s;
  });
}

const TRACK_OPTIONS = [
  { id: 'eyes', label: 'Eyes only', hint: 'For patients who cannot move their head. Head movement is ignored.' },
  { id: 'eyes-head', label: 'Eyes and head', hint: 'For patients who find turning the head easier than moving the eyes.' },
];

const COLLECT_MS = 1400;
const MIN_MOVEMENT = 0.08;
const MIN_BLINK_RANGE = 0.3;

const mean = (arr) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
const meanVector = (samples) => AXES.map((_, i) => mean(samples.map((f) => toVector(f)[i])));
const distance = (a, b, mask) => Math.hypot(...a.map((v, i) => (v - b[i]) * mask[i]));

function computeCalibration(samples, boxes, track) {
  const mask = maskFor(track);
  const center = meanVector(samples.center);
  const dirs = {};
  const strength = {};
  for (const d of ['left', 'right', 'up', 'down']) {
    dirs[d] = meanVector(samples[d]);
    strength[d] = distance(dirs[d], center, mask);
  }
  const closedValues = samples.closed.map((f) => f.blink).sort((a, b) => b - a);
  const blinkClosed = mean(closedValues.slice(0, Math.max(1, Math.floor(closedValues.length / 2))));
  const blinkOpen = mean(samples.center.map((f) => f.blink));
  const blinkDown = mean(samples.down.map((f) => f.blink));

  return {
    version: CALIBRATION_VERSION,
    track,
    center,
    dirs,
    blinkOpen,
    blinkClosed,
    blinkDown,
    // Where the patient's face was in the picture, so others can be ignored later.
    face: boxes.length
      ? {
          cx: mean(boxes.map((b) => b.cx)),
          cy: mean(boxes.map((b) => b.cy)),
          w: mean(boxes.map((b) => b.w)),
          h: mean(boxes.map((b) => b.h)),
        }
      : null,
    quality: {
      left: strength.left >= MIN_MOVEMENT,
      right: strength.right >= MIN_MOVEMENT,
      up: strength.up >= MIN_MOVEMENT,
      down: strength.down >= MIN_MOVEMENT,
      closed: blinkClosed - blinkOpen >= MIN_BLINK_RANGE,
    },
    createdAt: Date.now(),
  };
}

export default function Calibration({ voice, holdMs, track, onTrackChange, onDone, onSkip, onUseKeyboard, onCancel }) {
  const [stage, setStage] = useState('check');
  const [result, setResult] = useState(null);

  if (stage === 'steps') {
    return (
      <CalibrationSteps
        voice={voice}
        track={track}
        onCancel={() => setStage('check')}
        onFinished={(calibration) => {
          setResult(calibration);
          setStage('result');
        }}
      />
    );
  }
  if (stage === 'result' && result) {
    return (
      <CalibrationResult
        calibration={result}
        holdMs={holdMs}
        onRetry={() => setStage('steps')}
        onDone={() => onDone(result)}
      />
    );
  }
  return (
    <CameraCheck
      track={track}
      onTrackChange={onTrackChange}
      onBegin={() => setStage('steps')}
      onSkip={onSkip}
      onUseKeyboard={onUseKeyboard}
      onCancel={onCancel}
    />
  );
}

/* ---------------- Stage 1: camera check ---------------- */

function CameraCheck({ track, onTrackChange, onBegin, onSkip, onUseKeyboard, onCancel }) {
  const { state, error } = useTrackerStatus();
  const { face, people } = useCameraInput({ enabled: state === 'running', onEvent: () => {} });
  const ready = state === 'running' && face === 'found';

  return (
    <main className="calib-check">
      <button className="btn btn-ghost setup-back" onClick={onCancel}>
        <ArrowLeft size={18} /> Back
      </button>
      <h1>Camera check</h1>
      <p className="setup-lead">Position the camera so the patient&rsquo;s face is in the middle of the picture.</p>

      <div className="calib-check-body">
        <div className="calib-check-cam">
          <CameraPreview className="cam-large" face={state === 'running' ? face : 'found'} selectable />
          <p className={`cam-status ${ready ? 'is-ok' : ''}`}>
            <span className={`dot ${ready ? 'dot-ok' : state === 'error' ? 'dot-danger' : 'dot-warn'}`} />
            {state === 'starting' && 'Starting the camera…'}
            {state === 'running' &&
              (face === 'found'
                ? people > 1
                  ? `Following the patient · ${people - 1} other ${people === 2 ? 'person' : 'people'} ignored`
                  : 'Face found'
                : 'No face in view')}
            {state === 'error' && 'Camera not available'}
            {state === 'off' && 'Camera off'}
          </p>
        </div>

        <div className="calib-check-side">
          {state === 'error' ? (
            <div className="notice notice-danger">
              <CircleAlert size={20} />
              <div>
                <p>{error}</p>
                <div className="notice-actions">
                  <button className="btn" onClick={startTracker}>
                    Try again
                  </button>
                  <button className="btn btn-ghost" onClick={onUseKeyboard}>
                    Use keyboard instead
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
            {state === 'running' && people > 1 && (
              <div className="notice notice-info">
                <Users size={20} />
                <p>
                  <strong>{people} people in view.</strong> Only the face with the blue outline is
                  followed. If that is not the patient, click the patient&rsquo;s face in the picture.
                </p>
              </div>
            )}
            <ul className="tips">
              <li>Camera at eye level, about an arm&rsquo;s length away.</li>
              <li>Light on the face, not behind the patient.</li>
              <li>Both eyes clearly visible. Glasses are fine if there is no glare.</li>
              <li>Works lying flat or propped up &mdash; calibrate in the position the patient will use.</li>
              <li>Others may stay in the room. During calibration it is best if only the patient is in view.</li>
            </ul>
            </>
          )}

          <fieldset className="field field-flush">
            <legend className="field-label">What can the patient move?</legend>
            <div className="segmented">
              {TRACK_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={track === o.id ? 'is-selected' : ''}
                  aria-pressed={track === o.id}
                  onClick={() => onTrackChange(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="field-hint">{TRACK_OPTIONS.find((o) => o.id === track)?.hint}</p>
          </fieldset>

          <div className="calib-check-actions">
            <button className="btn btn-primary btn-lg" disabled={!ready} onClick={onBegin}>
              Begin calibration
            </button>
            <button className="btn btn-ghost" disabled={state !== 'running'} onClick={onSkip}>
              Skip &mdash; scan mode only
            </button>
          </div>
          <p className="calib-note">
            Calibration takes about 20 seconds. The patient follows a dot
            {track === 'eyes' ? ' with their eyes only' : ' with their eyes or head'}, then closes
            their eyes once.
          </p>
        </div>
      </div>
    </main>
  );
}

/* ---------------- Stage 2: the dot ---------------- */

function CalibrationSteps({ voice, track, onFinished, onCancel }) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [noFace, setNoFace] = useState(false);
  const samples = useRef({});
  const boxes = useRef([]);
  const steps = useMemo(() => stepsFor(track), [track]);
  const step = steps[index];

  useEffect(() => {
    if (voice) speak(step.say);
    setProgress(0);

    const start = performance.now();
    let collecting = false;
    let collected = 0;
    let lastT = 0;
    const got = [];

    const off = onFrame(({ features, patientBox, t }) => {
      if (!collecting) {
        if (t - start < step.settle) return;
        collecting = true;
        lastT = t;
        return;
      }
      if (!features) {
        setNoFace(true);
        lastT = t; // pause the clock while the face is not visible
        return;
      }
      setNoFace(false);
      collected += t - lastT;
      lastT = t;
      got.push(features);
      if (step.id === 'center' && patientBox) boxes.current.push(patientBox);
      setProgress(Math.min(1, collected / COLLECT_MS));

      if (collected >= COLLECT_MS) {
        off();
        samples.current[step.id] = got;
        tone(step.id === 'closed' ? 880 : 620, step.id === 'closed' ? 320 : 120, step.id === 'closed' ? 0.2 : 0.08);
        if (index + 1 < steps.length) setIndex(index + 1);
        else onFinished(computeCalibration(samples.current, boxes.current, track));
      }
    });
    return off;
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const R = 30;
  const C = 2 * Math.PI * R;

  return (
    <main className="calib-stage">
      <header className="calib-stage-head">
        <button className="btn btn-ghost" onClick={onCancel}>
          <ArrowLeft size={18} /> Stop
        </button>
        <span className="calib-count">
          Step {index + 1} of {steps.length}
        </span>
      </header>

      <div className="calib-prompt">
        <p className="calib-prompt-text">{step.text}</p>
        {step.sub && <p className="calib-prompt-sub">{step.sub}</p>}
        {noFace && <p className="calib-prompt-warn">Can&rsquo;t see the face &mdash; waiting…</p>}
      </div>

      <div className="calib-target" style={{ left: `${step.x}%`, top: `${step.y}%` }}>
        {step.id === 'closed' ? (
          <Eye size={36} className="calib-eye" />
        ) : (
          <span className="calib-dot" />
        )}
        <svg className="calib-ring" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r={R} className="calib-ring-track" />
          <circle
            cx="36"
            cy="36"
            r={R}
            className="calib-ring-fill"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
          />
        </svg>
      </div>

      <CameraPreview className="cam-corner" showOverlay={false} />
    </main>
  );
}

/* ---------------- Stage 3: result + live test ---------------- */

const CHECKS = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'closed', label: 'Eyes closed' },
];

function CalibrationResult({ calibration, holdMs, onRetry, onDone }) {
  const [hold, setHold] = useState(0);
  const [chosen, setChosen] = useState(0);
  const flashTimer = useRef(0);

  const { face, looking } = useCameraInput({
    enabled: true,
    calibration,
    holdMs,
    onEvent: (e) => {
      if (e.type === 'hold') setHold(e.progress);
      if (e.type === 'select') {
        tone(760, 160, 0.12);
        setChosen(Date.now());
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setChosen(0), 900);
      }
    },
  });

  const weak = useMemo(() => CHECKS.filter((c) => !calibration.quality[c.id]), [calibration]);
  const allGood = weak.length === 0;
  const blinkWeak = !calibration.quality.closed;

  return (
    <main className="calib-check">
      <h1>{allGood ? 'Calibration done' : 'Calibration done, with warnings'}</h1>
      <p className="setup-lead">
        {allGood
          ? 'Every direction was clear. Try it out below before starting.'
          : 'Some movements were small, so they may be hard to detect. Try again, or continue and use scan mode.'}
      </p>

      <div className="calib-check-body">
        <div>
          <ul className="checks">
            {CHECKS.map((c) => {
              const ok = calibration.quality[c.id];
              return (
                <li key={c.id} className={ok ? 'is-ok' : 'is-weak'}>
                  {ok ? <Check size={18} /> : <CircleAlert size={18} />}
                  <span>{c.label}</span>
                  <span className="checks-state">{ok ? 'Clear' : 'Weak'}</span>
                </li>
              );
            })}
          </ul>
          {blinkWeak && (
            <p className="calib-note">
              Closing the eyes was hard to tell apart from open eyes. Check the lighting and try again.
            </p>
          )}
        </div>

        <div className="calib-test">
          <p className="calib-test-title">Try it</p>
          <p className="calib-note">Look around. Then close your eyes until the circle fills, and open them to choose.</p>
          <div className="dpad" aria-label={`Looking ${looking}`}>
            <span className={`dpad-cell dpad-up ${looking === 'up' ? 'is-on' : ''}`}>
              <ArrowUp size={22} />
            </span>
            <span className={`dpad-cell dpad-left ${looking === 'left' ? 'is-on' : ''}`}>
              <ArrowLeft size={22} />
            </span>
            <span className={`dpad-cell dpad-center ${looking === 'center' ? 'is-on' : ''} ${chosen ? 'is-chosen' : ''}`}>
              {chosen ? <Check size={22} /> : <span className="dpad-hold" style={{ transform: `scale(${hold})` }} />}
            </span>
            <span className={`dpad-cell dpad-right ${looking === 'right' ? 'is-on' : ''}`}>
              <ArrowRight size={22} />
            </span>
            <span className={`dpad-cell dpad-down ${looking === 'down' ? 'is-on' : ''}`}>
              <ArrowDown size={22} />
            </span>
          </div>
          <p className="calib-test-state">
            {face === 'lost' ? 'No face in view' : chosen ? 'Chosen' : hold >= 1 ? 'Now open your eyes' : hold > 0 ? 'Eyes closed…' : `Looking ${looking === 'center' ? 'at the centre' : looking}`}
          </p>
        </div>
      </div>

      <div className="calib-check-actions">
        <button className="btn btn-primary btn-lg" onClick={onDone}>
          Start using the board
        </button>
        <button className="btn" onClick={onRetry}>
          <RotateCcw size={16} /> Calibrate again
        </button>
      </div>
    </main>
  );
}
