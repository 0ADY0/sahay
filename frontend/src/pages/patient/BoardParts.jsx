import { Check, Moon, X } from 'lucide-react';
import { CONFIRM_MS, WAKE_CHOICES } from '../../config/settings';
import { formatElapsed } from '../../lib/time';

/* ---------- One option on the board ---------- */

export function Tile({ item, active, hold, onClick }) {
  const Icon = item.icon;
  const showHold = active && (hold.state === 'filling' || hold.state === 'ready');
  const ready = active && hold.state === 'ready';

  return (
    <button
      className={[
        'tile',
        active && 'is-active',
        ready && 'is-ready',
        item.priority === 'urgent' && 'tile-urgent',
        item.custom && 'tile-custom',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
    >
      {Icon && <Icon className="tile-icon" size={44} strokeWidth={1.6} />}
      {item.level && <LevelMeter level={item.level} />}
      <span className="tile-label">{item.label}</span>
      {item.sub && <span className="tile-sub">{item.sub}</span>}
      {ready && <span className="tile-ready">Open your eyes to choose</span>}
      {showHold && (
        <span className="tile-hold" aria-hidden="true">
          <span style={{ transform: `scaleX(${hold.progress})` }} />
        </span>
      )}
    </button>
  );
}

function LevelMeter({ level }) {
  return (
    <span className={`level level-${level}`} aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={n <= level ? 'is-on' : ''} style={{ height: `${10 + n * 7}px` }} />
      ))}
    </span>
  );
}

/* ---------- Sending / sent / cancelled ---------- */

export function PhaseOverlay({ phase, hold }) {
  const m = phase.message;
  const urgent = m?.priority === 'urgent';

  if (phase.name === 'cancelled') {
    return (
      <div className="overlay" role="status">
        <div className="overlay-card">
          <span className="overlay-badge">
            <X size={32} />
          </span>
          <p className="overlay-title">Cancelled</p>
          <p className="overlay-sub">Nothing was sent.</p>
        </div>
      </div>
    );
  }

  if (phase.name === 'sent') {
    const isReply = m.kind === 'reply';
    let sub = isReply ? 'Said aloud and shown to the nurse.' : 'The nurse has been told.';
    if (phase.summary) sub = `The nurse has been told: ${phase.summary}.`;
    return (
      <div className="overlay" role="status">
        <div className="overlay-card">
          <span className="overlay-badge overlay-badge-ok">
            <Check size={32} />
          </span>
          <p className="overlay-title">{isReply ? `“${m.label}”` : 'Sent'}</p>
          <p className="overlay-sub">{sub}</p>
        </div>
      </div>
    );
  }

  // confirm
  const Icon = m.icon;
  const cancelling = hold.state === 'filling' || hold.state === 'ready';
  return (
    <div className={`overlay ${urgent ? 'overlay-urgent' : ''}`} role="alertdialog" aria-live="assertive">
      <div className="overlay-card">
        <Icon size={56} strokeWidth={1.6} className="overlay-icon" />
        <p className="overlay-title">{m.label}</p>
        <p className="overlay-sub">
          {phase.viaGesture ? 'Quick blinks detected. ' : ''}
          {m.kind === 'reply' ? 'Saying this…' : 'Sending to the nurse…'}
        </p>
        <span className="drain" key={phase.startedAt} style={{ animationDuration: `${CONFIRM_MS}ms` }} />
        <p className="overlay-cancel">
          {hold.state === 'ready' ? 'Open your eyes to cancel' : 'To cancel, close your eyes until the bar fills, then open them'}
          <span className="cancel-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${cancelling ? hold.progress : 0})` }} />
          </span>
        </p>
      </div>
    </div>
  );
}

/* ---------- Rest mode ---------- */

export function RestOverlay({ wakeCount, blinkEmergency, onWake }) {
  const left = WAKE_CHOICES - wakeCount;
  return (
    <div className="rest" role="status">
      <div className="rest-body">
        <Moon size={40} strokeWidth={1.5} className="rest-icon" />
        <p className="rest-title">Resting</p>
        <p className="rest-sub">
          {wakeCount > 0
            ? 'Once more to wake the screen.'
            : `To use the screen again, close your eyes for a moment and open them${left === 2 ? ' — twice' : left > 2 ? ` — ${left} times` : ''}.`}
        </p>
        {wakeCount > 0 && (
          <span className="rest-steps" aria-hidden="true">
            {Array.from({ length: WAKE_CHOICES }, (_, i) => (
              <span key={i} className={i < wakeCount ? 'is-on' : ''} />
            ))}
          </span>
        )}
        {blinkEmergency && <p className="rest-note">For an emergency, blink quickly 4 times.</p>}
      </div>
      <button className="btn rest-wake" onClick={onWake}>
        Wake screen
      </button>
    </div>
  );
}

/* ---------- Status bar ---------- */

export function RequestStatus({ active, now }) {
  if (!active) {
    return (
      <span className="req-status">
        <span className="dot" /> No open requests
      </span>
    );
  }
  const details = active.details ? Object.values(active.details).join(', ') : '';
  if (active.status === 'ack') {
    return (
      <span className="req-status">
        <span className="dot dot-ok" />
        <strong>The nurse has seen your request</strong>
        <span className="req-meta">
          {active.label}
          {details && ` · ${details}`}
        </span>
      </span>
    );
  }
  return (
    <span className="req-status">
      <span className="dot dot-warn" />
      <strong>{active.label}</strong>
      <span className="req-meta">
        {details && `${details} · `}waiting for the nurse &middot; {formatElapsed(active.createdAt, now)}
      </span>
    </span>
  );
}
