import { useEffect, useState } from 'react';
import { usePersistentState } from '../../lib/persist';
import { clearCalibration, loadCalibration, saveCalibration } from '../../lib/calibrationStore';
import { setPatientAnchor, startTracker, stopTracker } from '../../input/faceTracker';
import { bedById } from '../../config/ward';
import { BLINK_HOLDS, DEFAULT_SETTINGS } from '../../config/settings';
import Setup from './Setup';
import Calibration from './Calibration';
import Board from './Board';

/*
  Bedside screen:
    Setup        caregiver picks the bed and the input method
    Calibration  (camera only) camera check + calibration + test
    Board        the patient uses the message board
*/
export default function PatientApp() {
  const [session, setSession] = usePersistentState('sahay.bedside', { bedId: null, input: 'keyboard' });
  const [settings, setSettings] = usePersistentState('sahay.bedside.settings', DEFAULT_SETTINGS);
  const bed = bedById(session.bedId);
  const usingCamera = Boolean(bed) && session.input === 'camera';

  const [calibration, setCalibration] = useState(() => (bed ? loadCalibration(bed.id) : null));
  const [calibrating, setCalibrating] = useState(() => usingCamera && !calibration);

  // The camera runs while a bed is set up for camera input.
  useEffect(() => {
    if (!usingCamera) return undefined;
    startTracker();
    return () => stopTracker();
  }, [usingCamera]);

  // Remember where the patient's face is, so a nurse or visitor in view is ignored.
  // While calibrating we start fresh (biggest central face, or the one the caregiver clicks).
  useEffect(() => {
    setPatientAnchor(calibrating ? null : (calibration?.face ?? null));
  }, [calibration, calibrating]);

  const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const holdMs = BLINK_HOLDS.find((b) => b.id === settings.blinkHold)?.ms ?? 800;

  if (!bed) {
    return (
      <Setup
        onStart={(bedId, input) => {
          const saved = loadCalibration(bedId);
          setCalibration(saved);
          setCalibrating(input === 'camera' && !saved);
          setSession({ bedId, input });
        }}
      />
    );
  }

  if (calibrating) {
    return (
      <Calibration
        voice={settings.voice}
        holdMs={holdMs}
        track={settings.track}
        onTrackChange={(track) => updateSettings({ track })}
        onDone={(c) => {
          saveCalibration(bed.id, c);
          setCalibration(c);
          setCalibrating(false);
        }}
        onSkip={() => {
          updateSettings({ mode: 'scan' });
          setCalibrating(false);
        }}
        onUseKeyboard={() => {
          setSession({ ...session, input: 'keyboard' });
          setCalibrating(false);
        }}
        onCancel={() => {
          setCalibrating(false);
          setSession({ ...session, bedId: null });
        }}
      />
    );
  }

  return (
    <Board
      key={bed.id}
      bed={bed}
      input={session.input}
      settings={settings}
      calibration={calibration}
      onSettingsChange={updateSettings}
      onRecalibrate={() => {
        clearCalibration(bed.id);
        setCalibrating(true);
      }}
      onExit={() => setSession({ ...session, bedId: null })}
    />
  );
}
