/*
  Decides which face in the picture is the patient, so a nurse or visitor
  standing next to the bed is ignored.

  1. Follow: once we have the patient, keep taking the face closest to where
     the patient was in the previous frame. A head can only move a little
     between frames; another person is normally at least a face-width away.
  2. Re-find: if the patient disappears for a moment (turned away, someone
     walked in front), wait. After a short while, look for a face near the
     spot where the patient's face was during calibration (the "anchor").
     Faces elsewhere are never taken as the patient.
  3. Before calibration there is no anchor, so we take the biggest, most
     central face - or the one the caregiver clicked on.

  All positions are in video coordinates, 0..1, not mirrored.
*/

const FOLLOW_LIMIT = 0.75; // face widths the patient's face may move between frames
const REACQUIRE_LIMIT = 1.2; // face widths from the anchor to accept a face as the patient
const LOST_RESET_MS = 1500; // after this long without the patient, re-find from the anchor

export function faceBox(landmarks) {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

const distance = (ref, box) => Math.hypot(ref.cx - box.cx, ref.cy - box.cy) / Math.max(ref.w, 0.05);

function nearest(ref, boxes) {
  let best = -1;
  let bestD = Infinity;
  boxes.forEach((b, i) => {
    const d = distance(ref, b);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return { index: best, d: bestD };
}

export class PatientLock {
  constructor() {
    this.anchor = null;
    this.target = null;
    this.lastMatchAt = -Infinity;
  }

  /** Where the patient's face is expected (from calibration or a caregiver's click). */
  setAnchor(box) {
    this.anchor = box ? { ...box } : null;
    this.target = null;
    this.lastMatchAt = -Infinity;
  }

  /** @returns index of the patient's face in `boxes`, or -1 if the patient is not visible. */
  choose(boxes, t) {
    if (!boxes.length) return -1;

    // 1. Keep following the same face.
    if (this.target && t - this.lastMatchAt < LOST_RESET_MS) {
      const { index, d } = nearest(this.target, boxes);
      return d <= FOLLOW_LIMIT ? this.#take(boxes[index], index, t) : -1;
    }

    // 2. Lost for a while: only accept a face where the patient is expected to be.
    if (this.anchor) {
      const { index, d } = nearest(this.anchor, boxes);
      return d <= REACQUIRE_LIMIT ? this.#take(boxes[index], index, t) : -1;
    }

    // 3. No anchor yet. If we were following someone, look near where they were last seen.
    if (this.target) {
      const { index, d } = nearest(this.target, boxes);
      if (d <= REACQUIRE_LIMIT) return this.#take(boxes[index], index, t);
    }

    // 4. Nothing known: the biggest face, preferring the centre of the picture.
    let best = 0;
    let bestScore = -Infinity;
    boxes.forEach((b, i) => {
      const offCentre = Math.hypot(b.cx - 0.5, b.cy - 0.5);
      const score = b.w / (1 + 2 * offCentre);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    return this.#take(boxes[best], best, t);
  }

  #take(box, index, t) {
    this.target = { ...box };
    this.lastMatchAt = t;
    return index;
  }
}
