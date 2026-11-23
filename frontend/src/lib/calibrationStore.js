// Calibration is saved per bed, so a reload does not make the patient redo it.
const key = (bedId) => `sahay.calibration.bed${bedId}`;
export const CALIBRATION_VERSION = 2;

export function loadCalibration(bedId) {
  try {
    const raw = localStorage.getItem(key(bedId));
    const c = raw ? JSON.parse(raw) : null;
    // Calibrations from before eyes-only tracking (version 1) must be redone.
    return c?.version === CALIBRATION_VERSION ? c : null;
  } catch {
    return null;
  }
}

export function saveCalibration(bedId, calibration) {
  try {
    localStorage.setItem(key(bedId), JSON.stringify(calibration));
  } catch {
    /* ignore */
  }
}

export function clearCalibration(bedId) {
  try {
    localStorage.removeItem(key(bedId));
  } catch {
    /* ignore */
  }
}
