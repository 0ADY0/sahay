/*
  Turns per-frame face features into the board's input events.

  Direction
    Calibration records what "centre", "left", "right", "up" and "down" look
    like for this patient. Two tracking styles (chosen before calibration):
      'eyes'       eyes only - pupil position + eye direction; head movement ignored
      'eyes-head'  eyes and head - for patients who find turning the head easier
    Each frame we measure how far the patient has moved from centre towards
    each recorded direction (0 = at centre, 1 = as far as during calibration).
    Above ENTER_AT for a short moment -> one 'move' event. The patient must
    come back towards centre (below EXIT_AT) before the next move, unless they
    keep holding, which repeats the move slowly.

  Eyes (see config/settings.js for the timings)
    Close until the bar fills (holdMs), then open      -> 'select'
    Shorter closures                                   -> 'blink' (quick blinks = emergency gesture)
    Much longer closures                               -> nothing on opening; the patient is resting
    Closed for REST_CLOSE_MS                           -> 'rest'
    Choosing happens on OPENING, so a patient who falls asleep never
    chooses anything by accident. The first BLINK_GRACE_MS of a closure is not
    shown, so ordinary blinking causes no flicker on screen.

  Pointing (cursor mode)
    The same calibration also gives a continuous position: how far towards
    left/right and up/down the patient is looking, mapped back onto the
    screen through the points where the calibration dot was shown.
    -> { type: 'point', x, y } in % of the screen, every frame the eyes are open.
    The point is frozen while the eyes are closed, so closing them to choose
    does not drag the cursor off the option.

  'hold' events describe the closure for the UI:
    { type: 'hold', progress: 0..1, state: 'open' | 'filling' | 'ready' | 'over' }
*/

import { CALIB_POINTS, CHOOSE_WINDOW_MS, REST_CLOSE_MS } from '../config/settings';

export const AXES = ['irisX', 'irisY', 'eyeX', 'eyeY', 'yaw', 'pitch'];
const MASKS = {
  eyes: [1, 1, 1, 1, 0, 0],
  'eyes-head': [1, 1, 1, 1, 1, 1],
};
/** Which features count for a tracking style. */
export const maskFor = (track) => MASKS[track] ?? MASKS['eyes-head'];
const DIRS = ['left', 'right', 'up', 'down'];

const ENTER_AT = 0.55;
const EXIT_AT = 0.3;
const DWELL_MS = 180; // must hold a direction this long before it counts
const REPEAT_MS = 1400; // holding a direction repeats the move this often
const SETTLE_AFTER_BLINK_MS = 300; // gaze readings are unreliable right after the eyes open
const BLINK_GRACE_MS = 150;
const FACE_LOST_MS = 1000;
const SMOOTHING = 0.3; // pupil positions jitter a little; smooth them slightly
const MIN_BLINK_MS = 30;
const POINT_SMOOTHING = 0.25; // extra smoothing for the cursor, which is more sensitive to jitter

const lerpSide = (t, centre, neg, pos) => centre + (t >= 0 ? t * (pos - centre) : -t * (neg - centre));
const clampPct = (v) => Math.max(0, Math.min(100, v));

/** Gaze -> screen position in %, using where the calibration dot was shown. */
export function gazePoint(scores) {
  const tx = (scores.right - scores.left) / 2; // -1 = calibrated left, +1 = calibrated right
  const ty = (scores.down - scores.up) / 2; // -1 = calibrated up, +1 = calibrated down
  const P = CALIB_POINTS;
  return {
    x: clampPct(lerpSide(tx, P.center[0], P.left[0], P.right[0])),
    y: clampPct(lerpSide(ty, P.center[1], P.up[1], P.down[1])),
  };
}

export const toVector = (f) => AXES.map((k) => f[k]);

const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, m) => a.map((v, i) => v * m[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

/** Threshold on the "eyes closed" score, from calibration if we have it. */
export function blinkThreshold(calibration) {
  if (!calibration) return 0.5;
  const { blinkOpen, blinkClosed, blinkDown } = calibration;
  // Looking down lowers the eyelids, so stay well above that level.
  let thr = Math.max(blinkOpen + 0.6 * (blinkClosed - blinkOpen), (blinkDown + blinkClosed) / 2);
  thr = Math.min(thr, blinkClosed - 0.05);
  return Math.max(0.25, Math.min(0.85, thr));
}

/** How strongly the current position points to each direction (1 = calibrated extent). */
export function directionScores(vec, calibration) {
  const mask = maskFor(calibration.track);
  const d = mul(sub(vec, calibration.center), mask);
  const out = {};
  for (const dir of DIRS) {
    const v = mul(sub(calibration.dirs[dir], calibration.center), mask);
    const len2 = dot(v, v);
    out[dir] = len2 > 1e-6 ? dot(d, v) / len2 : 0;
  }
  return out;
}

export class GazeEngine {
  constructor() {
    this.calibration = null;
    this.holdMs = 800;
    this.reset();
  }

  configure({ calibration, holdMs }) {
    this.calibration = calibration ?? null;
    if (holdMs) this.holdMs = holdMs;
  }

  reset() {
    this.smooth = null;
    this.closed = false;
    this.closedSince = 0;
    this.lastOpenAt = 0;
    this.dir = 'center';
    this.candidate = null;
    this.candidateSince = 0;
    this.lastMoveAt = 0;
    this.lastSeen = 0;
    this.lastProgress = 0;
    this.lastState = 'open';
    this.restFired = false;
    this.point = null;
  }

  /**
   * @returns {{ events: object[], face: 'found'|'lost', looking: string, closedProgress: number }}
   */
  process(features, now) {
    const events = [];

    if (!features) {
      if (this.closed) this.#open(now, events, { silent: true });
      this.smooth = null;
      this.dir = 'center';
      this.candidate = null;
      return {
        events,
        face: now - this.lastSeen > FACE_LOST_MS ? 'lost' : 'found',
        looking: 'center',
        closedProgress: 0,
      };
    }
    this.lastSeen = now;

    // ---- Eyes closed / open (with a little hysteresis) ----
    const thr = blinkThreshold(this.calibration);
    if (!this.closed && features.blink > thr) {
      this.closed = true;
      this.closedSince = now;
      this.restFired = false;
    } else if (this.closed && features.blink < thr - 0.08) {
      this.#open(now, events);
    }

    let progress = 0;
    if (this.closed) {
      const dur = now - this.closedSince;
      const span = Math.max(1, this.holdMs - BLINK_GRACE_MS);
      progress = Math.max(0, Math.min(1, (dur - BLINK_GRACE_MS) / span));
      const state = dur > this.holdMs + CHOOSE_WINDOW_MS ? 'over' : progress >= 1 ? 'ready' : 'filling';
      if (state !== this.lastState || Math.abs(progress - this.lastProgress) > 0.01) {
        if (progress > 0 || state !== 'filling') events.push({ type: 'hold', progress, state });
        this.lastProgress = progress;
        this.lastState = state;
      }
      if (dur >= REST_CLOSE_MS && !this.restFired) {
        this.restFired = true;
        events.push({ type: 'rest' });
      }
    }

    // ---- Direction ----
    const vec = toVector(features);
    this.smooth = this.smooth ? this.smooth.map((v, i) => v + SMOOTHING * (vec[i] - v)) : vec;

    let looking = 'center';
    const canLook =
      this.calibration?.dirs && !this.closed && now - this.lastOpenAt > SETTLE_AFTER_BLINK_MS;

    if (canLook) {
      const scores = directionScores(this.smooth, this.calibration);

      const target = gazePoint(scores);
      this.point = this.point
        ? {
            x: this.point.x + POINT_SMOOTHING * (target.x - this.point.x),
            y: this.point.y + POINT_SMOOTHING * (target.y - this.point.y),
          }
        : target;
      events.push({ type: 'point', x: this.point.x, y: this.point.y });
      let best = 'center';
      let bestScore = 0;
      for (const dir of DIRS) {
        if (scores[dir] > bestScore) {
          best = dir;
          bestScore = scores[dir];
        }
      }

      if (this.dir === 'center') {
        if (bestScore > ENTER_AT) {
          if (this.candidate !== best) {
            this.candidate = best;
            this.candidateSince = now;
          } else if (now - this.candidateSince >= DWELL_MS) {
            this.dir = best;
            this.lastMoveAt = now;
            events.push({ type: 'move', dir: best });
          }
        } else {
          this.candidate = null;
        }
      } else if (scores[this.dir] < EXIT_AT) {
        this.dir = 'center';
        this.candidate = null;
      } else if (now - this.lastMoveAt > REPEAT_MS) {
        this.lastMoveAt = now;
        events.push({ type: 'move', dir: this.dir });
      }
      looking = this.dir !== 'center' ? this.dir : bestScore > ENTER_AT ? best : 'center';
    } else if (!this.closed) {
      this.dir = 'center';
      this.candidate = null;
    }

    return { events, face: 'found', looking, closedProgress: progress };
  }

  #open(now, events, { silent = false } = {}) {
    const dur = now - this.closedSince;
    this.closed = false;
    this.lastOpenAt = now;
    if (!silent) {
      if (dur >= this.holdMs && dur <= this.holdMs + CHOOSE_WINDOW_MS) events.push({ type: 'select' });
      else if (dur < this.holdMs && dur >= MIN_BLINK_MS) events.push({ type: 'blink' });
    }
    if (this.lastState !== 'open' || this.lastProgress !== 0) events.push({ type: 'hold', progress: 0, state: 'open' });
    this.lastProgress = 0;
    this.lastState = 'open';
  }
}
