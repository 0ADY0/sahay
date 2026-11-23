import { useSyncExternalStore } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { PatientLock, faceBox } from './patientLock';
import { irisFeatures } from './irisGaze';

/*
  Webcam + MediaPipe Face Landmarker, running entirely in the browser.
  Video frames never leave this computer.

  One tracker is shared by the whole page. Components subscribe to:
    onFrame(fn)       -> fn({ features, landmarks, t }) for every processed frame
    useTrackerStatus  -> { state: 'off' | 'starting' | 'running' | 'error', error }

  Several faces may be in view (a nurse, a visitor). patientLock.js decides
  which one is the patient; `features` always describe the patient only.

  `features` (null when the patient's face is not visible):
    blink  0..1   how closed the eyes are (average of both eyes)
    irisX         pupil position between the eye corners (eyes only, see irisGaze.js)
    irisY         pupil above / below the line between the corners
    eyeX   -1..1  eyes looking left (-) / right (+)    (sign is not important:
    eyeY   -1..1  eyes looking down (-) / up (+)        calibration learns it)
    yaw    rad    head turned left / right
    pitch  rad    head tilted up / down
*/

// BASE_URL is '/' locally and '/<repo>/' on GitHub Pages.
const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const LOCAL_MODEL = `${import.meta.env.BASE_URL}mediapipe/face_landmarker.task`;
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarker = null;
let stream = null;
let video = null;
let raf = 0;
let lastVideoTime = -1;

let status = { state: 'off', error: null };
const statusListeners = new Set();
const frameListeners = new Set();

function setStatus(state, error = null) {
  status = { state, error };
  statusListeners.forEach((l) => l());
}

export function useTrackerStatus() {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
  );
}

export function onFrame(fn) {
  frameListeners.add(fn);
  return () => frameListeners.delete(fn);
}

export function getStream() {
  return stream;
}

/* ---------- Model loading ---------- */

async function pickModelPath() {
  // Use a local copy if someone has put one in public/mediapipe/, otherwise download it.
  try {
    const res = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    const type = res.headers.get('content-type') || '';
    if (res.ok && !type.includes('text/html')) return LOCAL_MODEL;
  } catch {
    /* fall through */
  }
  return REMOTE_MODEL;
}

async function loadLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const modelAssetPath = await pickModelPath();
  const create = (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO',
      numFaces: 4, // see everyone, then follow only the patient (patientLock.js)
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  try {
    return await create('GPU');
  } catch {
    return create('CPU');
  }
}

/* ---------- Start / stop ---------- */

function friendlyError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was refused. Allow the camera in the browser address bar, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found. Plug in a webcam and try again.';
    case 'NotReadableError':
      return 'The camera is in use by another app (for example a video call). Close it and try again.';
    default:
      return 'Face tracking could not start. Check the internet connection (the tracking model is downloaded once) and try again.';
  }
}

export async function startTracker() {
  if (status.state === 'running' || status.state === 'starting') return;
  setStatus('starting');
  try {
    // Open the camera and load the model at the same time.
    const modelReady = landmarker ? Promise.resolve(landmarker) : loadLandmarker();
    modelReady.catch(() => {}); // handled below; avoids an unhandled rejection if the camera fails first

    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    landmarker = await modelReady;

    lastVideoTime = -1;
    setStatus('running');
    raf = requestAnimationFrame(loop);
  } catch (err) {
    console.error('[faceTracker]', err);
    releaseCamera();
    setStatus('error', friendlyError(err));
  }
}

function releaseCamera() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) video.srcObject = null;
  video = null;
}

export function stopTracker() {
  releaseCamera();
  setStatus('off');
}

/* ---------- Per-frame processing ---------- */

function loop() {
  raf = requestAnimationFrame(loop);
  if (!video || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const t = performance.now();
  let result;
  try {
    result = landmarker.detectForVideo(video, t);
  } catch (err) {
    console.error('[faceTracker] detect failed', err);
    return;
  }

  const all = result.faceLandmarks ?? [];
  const faces = all.map(faceBox);
  const patient = lock.choose(faces, t);
  lastFaces = faces;

  const frame = {
    t,
    features: patient >= 0 ? toFeatures(result, patient, video.videoWidth, video.videoHeight) : null,
    landmarks: patient >= 0 ? all[patient] : null,
    faces, // every face in view
    patient, // index of the patient's face in `faces`, -1 if not visible
    patientBox: patient >= 0 ? faces[patient] : null,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  };
  frameListeners.forEach((fn) => fn(frame));
}

/* ---------- Which face is the patient ---------- */

const lock = new PatientLock();
let lastFaces = [];

/** Set where the patient's face should be (from calibration). null = forget. */
export function setPatientAnchor(box) {
  lock.setAnchor(box);
}

/**
 * Caregiver clicked on the picture: follow the face at that point.
 * x, y are 0..1 in video coordinates (not mirrored). Returns true if a face was there.
 */
export function choosePatientAt(x, y) {
  const hit = lastFaces.find(
    (b) => Math.abs(x - b.cx) <= b.w / 2 + 0.03 && Math.abs(y - b.cy) <= b.h / 2 + 0.03,
  );
  if (!hit) return false;
  lock.setAnchor(hit);
  return true;
}

/*
  Development only: drive the app with fake face data, no webcam needed.
  In the browser console:
    sahayDev.fakeCamera()                          // pretend the camera is running
    sahayDev.frame({ irisX: -0.3, eyeX: -0.4, blink: 0.05 }) // one frame (others default 0)
    sahayDev.hold({ eyeX: 0.4 }, 1500)             // send frames for 1.5 s
    sahayDev.frame(null)                           // no face visible
  (Which face is the patient is tested separately: see patientLock.js.)
*/
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const DEFAULT_BOX = { cx: 0.5, cy: 0.45, w: 0.3, h: 0.4 };
  const emit = (f, box = DEFAULT_BOX) => {
    const features = f ? { irisX: 0, irisY: 0, eyeX: 0, eyeY: 0, yaw: 0, pitch: 0, blink: 0.05, ...f } : null;
    const faces = features ? [box] : [];
    const frame = { t: performance.now(), features, landmarks: null, faces, patient: features ? 0 : -1, patientBox: features ? box : null, videoWidth: 640, videoHeight: 480 };
    frameListeners.forEach((fn) => fn(frame));
  };
  window.sahayDev = {
    fakeCamera: () => setStatus('running'),
    frame: emit,
    hold: (f, ms = 1000) =>
      new Promise((resolve) => {
        const end = performance.now() + ms;
        const t = setInterval(() => {
          emit(f);
          if (performance.now() >= end) {
            clearInterval(t);
            resolve();
          }
        }, 33);
      }),
  };
}

function toFeatures(result, i, width, height) {
  const categories = result.faceBlendshapes?.[i]?.categories;
  if (!categories) return null;

  const s = {};
  for (const c of categories) s[c.categoryName] = c.score;

  const lookA = (s.eyeLookInLeft + s.eyeLookOutRight) / 2;
  const lookB = (s.eyeLookOutLeft + s.eyeLookInRight) / 2;
  const lookUp = (s.eyeLookUpLeft + s.eyeLookUpRight) / 2;
  const lookDown = (s.eyeLookDownLeft + s.eyeLookDownRight) / 2;

  // Head rotation from the 4x4 face transform (column-major). We only need
  // rough yaw / pitch; the sign convention is learned during calibration.
  let yaw = 0;
  let pitch = 0;
  const m = result.facialTransformationMatrixes?.[i]?.data;
  if (m) {
    yaw = Math.atan2(m[8], m[10]);
    pitch = Math.asin(Math.max(-1, Math.min(1, m[9])));
  }

  const iris = irisFeatures(result.faceLandmarks?.[i], width, height) ?? { irisX: 0, irisY: 0 };

  return {
    blink: (s.eyeBlinkLeft + s.eyeBlinkRight) / 2,
    irisX: iris.irisX,
    irisY: iris.irisY,
    eyeX: lookA - lookB,
    eyeY: lookUp - lookDown,
    yaw,
    pitch,
  };
}
