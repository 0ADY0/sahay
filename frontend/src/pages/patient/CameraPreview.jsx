import { useEffect, useRef } from 'react';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { choosePatientAt, getStream, onFrame, useTrackerStatus } from '../../input/faceTracker';

const EYE_LINES = [
  ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
  ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
];
const IRIS_CENTERS = [468, 473];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/*
  Mirrored live camera view. The patient's face gets a blue outline and eye
  markers; anyone else in view gets a dashed grey box (ignored).
  With `selectable`, clicking a face makes it the patient.
*/
export default function CameraPreview({ className = '', face = 'found', showOverlay = true, selectable = false }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const { state } = useTrackerStatus();

  useEffect(() => {
    const v = videoRef.current;
    const stream = getStream();
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
  }, [state]);

  useEffect(() => {
    if (!showOverlay) return undefined;
    return onFrame(({ landmarks, faces = [], patient = -1, videoWidth, videoHeight }) => {
      const c = canvasRef.current;
      if (!c) return;
      if (c.width !== videoWidth) c.width = videoWidth;
      if (c.height !== videoHeight) c.height = videoHeight;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      const unit = c.width / 320;

      // Face boxes
      faces.forEach((b, i) => {
        const pad = 0.15;
        const x = (b.cx - (b.w / 2) * (1 + pad)) * c.width;
        const y = (b.cy - (b.h / 2) * (1 + pad)) * c.height;
        const w = b.w * (1 + pad) * c.width;
        const h = b.h * (1 + pad) * c.height;
        roundRect(g, x, y, w, h, 10 * unit);
        if (i === patient) {
          g.setLineDash([]);
          g.lineWidth = 2.5 * unit;
          g.strokeStyle = '#5fb3e6';
        } else {
          g.setLineDash([5 * unit, 4 * unit]);
          g.lineWidth = 1.5 * unit;
          g.strokeStyle = 'rgba(255,255,255,0.55)';
        }
        g.stroke();
      });
      g.setLineDash([]);

      if (!landmarks) return;

      // Patient's eyes
      const px = (p) => [p.x * c.width, p.y * c.height];
      g.lineWidth = Math.max(1.5, 1.2 * unit);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      for (const { start, end } of EYE_LINES) {
        const [x1, y1] = px(landmarks[start]);
        const [x2, y2] = px(landmarks[end]);
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }
      g.stroke();

      g.fillStyle = '#5fb3e6';
      for (const i of IRIS_CENTERS) {
        if (!landmarks[i]) continue;
        const [x, y] = px(landmarks[i]);
        g.beginPath();
        g.arc(x, y, Math.max(2.5, 2 * unit), 0, Math.PI * 2);
        g.fill();
      }
    });
  }, [showOverlay]);

  const onClick = (e) => {
    if (!selectable) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = 1 - (e.clientX - r.left) / r.width; // the picture is mirrored
    const y = (e.clientY - r.top) / r.height;
    choosePatientAt(x, y);
  };

  return (
    <div
      className={`cam ${face === 'lost' ? 'cam-lost' : ''} ${selectable ? 'cam-selectable' : ''} ${className}`}
      onClick={onClick}
    >
      <video ref={videoRef} muted playsInline />
      {showOverlay && <canvas ref={canvasRef} />}
      {state !== 'running' && <span className="cam-placeholder">{state === 'starting' ? 'Starting…' : 'Camera off'}</span>}
    </div>
  );
}
