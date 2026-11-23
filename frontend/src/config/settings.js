// Per-bedside settings, adjustable by a caregiver from the settings panel.
export const SCAN_SPEEDS = [
  { id: 'slow', label: 'Slow', ms: 2600 },
  { id: 'normal', label: 'Normal', ms: 1900 },
  { id: 'fast', label: 'Fast', ms: 1300 },
];

export const BLINK_HOLDS = [
  { id: 'short', label: '0.5 s', ms: 500 },
  { id: 'normal', label: '0.8 s', ms: 800 },
  { id: 'long', label: '1.2 s', ms: 1200 },
];

/*
  Eye-close timing. Choosing = close the eyes until the bar fills, then open.
    shorter than holdMs              -> an ordinary blink (counted for the emergency gesture)
    holdMs .. holdMs + CHOOSE_WINDOW -> choose (happens when the eyes open)
    longer                           -> not a choice; the patient may be resting
    REST_CLOSE_MS or more            -> the screen goes into rest mode
*/
export const CHOOSE_WINDOW_MS = 2000;
export const REST_CLOSE_MS = 8000;

// Emergency from anywhere: this many quick blinks within the window.
export const EMERGENCY_BLINKS = 4;
export const EMERGENCY_WINDOW_MS = 3000;

// Waking from rest: this many choices (close, then open) within the window.
export const WAKE_CHOICES = 2;
export const WAKE_WINDOW_MS = 8000;

// How long the "Sending…" step lasts. Choosing again during it cancels.
export const CONFIRM_MS = 2500;

// Follow-up questions (e.g. pain level) finish on their own after this long without an answer.
export const FOLLOWUP_TIMEOUT_MS = 25000;

// Where the calibration dot appears, in % of the screen (x, y). The cursor mode
// maps the patient's gaze back onto the screen using these same points.
export const CALIB_POINTS = {
  center: [50, 52],
  left: [5, 52],
  right: [95, 52],
  up: [50, 14],
  down: [50, 92],
};

// Cursor mode: the pointer must rest on an option this long before it counts as "on" it.
export const HOVER_SETTLE_MS = 250;

// Patient's own messages, added by a caregiver.
export const MAX_CUSTOM_MESSAGES = 4;

export const DEFAULT_SETTINGS = {
  mode: 'scan', // 'scan' | 'gaze' | 'cursor'
  scanSpeed: 'normal',
  blinkHold: 'normal',
  voice: true,
  showCamera: true,
  blinkEmergency: true,
  track: 'eyes', // 'eyes' (eyes only) | 'eyes-head'; chosen in the camera check before calibrating
};
