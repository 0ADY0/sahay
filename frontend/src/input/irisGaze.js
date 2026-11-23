/*
  Eyes-only gaze: where each pupil (iris centre) sits between the corners of
  its own eye.

  Because it is measured relative to the eye corners, moving or turning the
  head a little hardly changes it - only moving the eyes does. It is also
  measured along the line between the corners, so it still works when the
  head is tilted on a pillow.

    irisX   pupil towards one corner (-) or the other (+)   ~ -0.4 .. 0.4
    irisY   pupil above (-) or below (+) the corner line    ~ -0.3 .. 0.3
  (Signs do not matter: calibration learns which way is "left" or "up".)

  MediaPipe Face Landmarker indices (with iris refinement, 478 points):
    eye corners 33 & 133, and 362 & 263; iris centres 468 and 473.
*/

const EYE_CORNERS = [
  [33, 133],
  [362, 263],
];
const IRIS_CENTRES = [468, 473];

// Scale the small raw ratios to roughly the same range as the other features.
const GAIN_X = 3;
const GAIN_Y = 6;

const dist2 = (p, q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;

export function irisFeatures(landmarks, width = 1, height = 1) {
  if (!landmarks || landmarks.length < 478) return null;
  // Work in pixels so x and y use the same units.
  const P = (i) => ({ x: landmarks[i].x * width, y: landmarks[i].y * height });
  const irises = IRIS_CENTRES.map(P);

  let sumX = 0;
  let sumY = 0;
  let n = 0;
  for (const [ia, ib] of EYE_CORNERS) {
    const a = P(ia);
    const b = P(ib);
    const [l, r] = a.x <= b.x ? [a, b] : [b, a]; // left-to-right in the picture
    const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    const ex = r.x - l.x;
    const ey = r.y - l.y;
    const w2 = ex * ex + ey * ey;
    if (w2 < 4) continue; // eye too small to measure

    // The iris that belongs to this eye is the one closest to its centre.
    const iris = dist2(irises[0], mid) <= dist2(irises[1], mid) ? irises[0] : irises[1];
    const dx = iris.x - mid.x;
    const dy = iris.y - mid.y;
    sumX += (dx * ex + dy * ey) / w2; // along the eye, in eye-widths
    sumY += (dx * -ey + dy * ex) / w2; // across the eye, in eye-widths
    n += 1;
  }
  if (!n) return null;
  return { irisX: (sumX / n) * GAIN_X, irisY: (sumY / n) * GAIN_Y };
}
