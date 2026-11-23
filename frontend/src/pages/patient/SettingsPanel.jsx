import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { BLINK_HOLDS, MAX_CUSTOM_MESSAGES, SCAN_SPEEDS } from '../../config/settings';

function Segmented({ label, hint, options, value, onChange }) {
  return (
    <fieldset className="field">
      {label && <legend className="field-label">{label}</legend>}
      {hint && <p className="field-hint">{hint}</p>}
      <div className="segmented">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={value === o.id ? 'is-selected' : ''}
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const ON_OFF = [
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
];

/* Patient's own messages: added by a caregiver, shown after the standard tiles. */
function CustomMessages({ items, onChange }) {
  const [text, setText] = useState('');
  const [notify, setNotify] = useState(true);
  const full = items.length >= MAX_CUSTOM_MESSAGES;
  const label = text.trim();

  const add = (e) => {
    e.preventDefault();
    if (!label || full) return;
    onChange([...items, { id: `c-${Date.now().toString(36)}`, label, notify }]);
    setText('');
  };

  return (
    <section className="field">
      <h3 className="field-label">Patient&rsquo;s own messages</h3>
      <p className="field-hint">
        Up to {MAX_CUSTOM_MESSAGES} extra tiles for this bed, for example a family member&rsquo;s name or
        &ldquo;Please open the window&rdquo;.
      </p>

      {items.length > 0 && (
        <ul className="custom-list">
          {items.map((c) => (
            <li key={c.id}>
              <span className="custom-label">{c.label}</span>
              <span className="custom-kind">{c.notify ? 'Tells the nurse' : 'Said aloud'}</span>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Remove ${c.label}`}
                onClick={() => onChange(items.filter((x) => x.id !== c.id))}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="field-hint">The board is full. Remove one to add another.</p>
      ) : (
        <form className="custom-form" onSubmit={add}>
          <input
            className="input"
            type="text"
            value={text}
            maxLength={40}
            placeholder="New message"
            aria-label="New message"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="segmented segmented-sm">
            <button type="button" className={notify ? 'is-selected' : ''} aria-pressed={notify} onClick={() => setNotify(true)}>
              Tell the nurse
            </button>
            <button type="button" className={!notify ? 'is-selected' : ''} aria-pressed={!notify} onClick={() => setNotify(false)}>
              Only say it aloud
            </button>
          </div>
          <button className="btn" type="submit" disabled={!label}>
            <Plus size={16} /> Add message
          </button>
        </form>
      )}
    </section>
  );
}

/* Caregiver settings. Used with a mouse, not by the patient. */
export default function SettingsPanel({
  settings,
  input,
  custom,
  onCustomChange,
  onChange,
  onClose,
  onExit,
  onRecalibrate,
  onRest,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>Settings</h2>
          <button className="btn btn-ghost btn-icon" aria-label="Close settings" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <p className="drawer-note">For the caregiver. Changes apply straight away.</p>

        <Segmented
          label="How the patient moves"
          hint="Scan: options light up one by one. Gaze: the patient looks to move."
          options={[
            { id: 'scan', label: 'Scan' },
            { id: 'gaze', label: 'Gaze' },
          ]}
          value={settings.mode}
          onChange={(mode) => onChange({ mode })}
        />

        <Segmented label="Scan speed" options={SCAN_SPEEDS} value={settings.scanSpeed} onChange={(scanSpeed) => onChange({ scanSpeed })} />

        <Segmented
          label="Eyes closed to choose"
          hint="How long the eyes stay closed before opening them chooses. Longer avoids choosing by accident."
          options={BLINK_HOLDS}
          value={settings.blinkHold}
          onChange={(blinkHold) => onChange({ blinkHold })}
        />

        <Segmented
          label="Emergency by quick blinks"
          hint="Blinking quickly 4 times from any screen starts an emergency call (it can still be cancelled). Turn off if the patient blinks a lot."
          options={ON_OFF}
          value={settings.blinkEmergency ? 'on' : 'off'}
          onChange={(v) => onChange({ blinkEmergency: v === 'on' })}
        />

        <Segmented
          label="Speak messages aloud"
          options={ON_OFF}
          value={settings.voice ? 'on' : 'off'}
          onChange={(v) => onChange({ voice: v === 'on' })}
        />

        {input === 'camera' && (
          <Segmented
            label="Camera preview in the top bar"
            options={[
              { id: 'on', label: 'Show' },
              { id: 'off', label: 'Hide' },
            ]}
            value={settings.showCamera ? 'on' : 'off'}
            onChange={(v) => onChange({ showCamera: v === 'on' })}
          />
        )}

        <CustomMessages items={custom} onChange={onCustomChange} />

        <section className="field">
          <h3 className="field-label">Rest</h3>
          <p className="field-hint">
            The screen also rests by itself when the patient keeps their eyes closed for 8 seconds.
          </p>
          <div className="drawer-row">
            <button className="btn" onClick={onRest}>
              Rest now
            </button>
          </div>
        </section>

        <div className="drawer-foot">
          {input === 'camera' && (
            <button className="btn" onClick={onRecalibrate}>
              Calibrate again
            </button>
          )}
          <button className="btn" onClick={onExit}>
            Change bed or input
          </button>
        </div>
      </aside>
    </div>
  );
}
