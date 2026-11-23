# Sahay

**Eye-controlled communication for patients who cannot speak.**

A patient who has just had surgery may be awake but unable to talk or press a call button. Sahay uses an ordinary laptop webcam to follow their eyes. They choose a message — *I need water*, *I am in pain*, *Emergency* — and it is spoken aloud and sent to the nurse.

No special eye-tracking hardware. Video never leaves the computer: face tracking runs in the browser with [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).

> Student prototype (EPICS). Not a certified medical device.

## Try it

Live: **https://0ady0.github.io/sahay/** — open in Chrome or Edge and allow the camera.

1. **Bedside screen** → pick a bed → **Camera**.
2. **Camera check**: choose *Eyes only* or *Eyes and head*, then **Begin calibration** (about 20 s).
3. Use the board.

No webcam? Choose **Keyboard** in setup: arrow keys move, hold and release **Space** to choose.

## How the patient uses it

| To… | Do this |
|---|---|
| Move the highlight | **Scan mode:** wait — options light up one by one. **Gaze mode:** look left / right / up / down. **Cursor mode:** a circle follows the eyes; the option under it lights up. |
| Choose | Close the eyes until the bar fills, then **open** them. |
| Cancel a message being sent | Choose again during the 2.5 s "Sending…" step. |
| Call for help from anywhere | **Blink quickly 4 times** (opens *Emergency*, still cancellable). |
| Rest | Keep the eyes closed for 8 s. To wake: close-and-open twice. |

Choosing happens when the eyes **open**, so a patient who falls asleep never sends anything by accident.

## Features

- **Eyes-only tracking** — pupil position between the eye corners, so it works for patients who cannot move their head, and is not thrown off by a tilted head on a pillow. *Eyes and head* is available for patients who find turning the head easier.
- **Per-patient calibration** with a live test pad.
- **Ignores other people** in view (nurse, visitor): it locks onto the patient's face; the caregiver can click to pick the right face.
- **Pain follow-up** — after *I am in pain*: how bad (mild → very severe) and where (head, chest, surgical wound…). The nurse is told immediately; answers are added as they come.
- **Patient's own messages** — up to 4 custom tiles per bed (e.g. a family member's name), either sent to the nurse or only spoken aloud.
- **Spoken output** (browser text-to-speech, Indian English voice where available).
- **Caregiver settings**: scan speed, eye-close time, emergency gesture on/off, voice, recalibrate.

## Run locally

Requires [Node.js](https://nodejs.org) 20+.

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

Testing without a webcam (dev server only), in the browser console:

```js
sahayDev.fakeCamera();
sahayDev.hold({ irisX: -0.36, eyeX: -0.3 }, 800); // "look left" for 0.8 s
sahayDev.hold({ blink: 0.9 }, 1000);             // eyes closed for 1 s
```

## Deploy

Every push to `main` builds and publishes to GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Project layout

```
frontend/
  src/
    config/        messages on the board, ward & beds, timings
    input/         webcam + MediaPipe (faceTracker), pupil gaze (irisGaze),
                   gaze/blink logic (gazeEngine), patient-face lock (patientLock),
                   keyboard stand-in, and the input bus they all publish to
    pages/patient/ setup, calibration, the board, settings
    lib/           ward store (shared requests), speech, sounds
    styles/
```

The nurse station currently reads requests from the same browser (`localStorage`). It will move to the FastAPI backend; only `src/lib/wardStore.js` needs to change.

## Roadmap

- Nurse station dashboard (live requests, acknowledge, alerts)
- FastAPI + PostgreSQL backend, Firebase notifications
- Nurse asks a question → patient answers Yes / No
- Usage metrics for evaluation
- Hospitals & blood banks finder (India)
- Hindi and other Indian languages
