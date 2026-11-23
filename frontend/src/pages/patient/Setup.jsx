import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Keyboard } from 'lucide-react';
import { BEDS, WARD } from '../../config/ward';

const INPUTS = [
  {
    id: 'camera',
    icon: Camera,
    title: 'Camera',
    text: 'The patient moves their eyes or head and closes their eyes to choose.',
    ready: true,
  },
  {
    id: 'keyboard',
    icon: Keyboard,
    title: 'Keyboard',
    text: 'For testing and demos. Arrow keys move, holding Space acts as closing the eyes.',
    ready: true,
  },
];

export default function Setup({ onStart }) {
  const [bedId, setBedId] = useState(null);
  const [input, setInput] = useState('camera');

  return (
    <main className="setup">
      <Link to="/" className="btn btn-ghost setup-back">
        <ArrowLeft size={18} /> Back
      </Link>

      <h1>Bedside setup</h1>
      <p className="setup-lead">
        {WARD.name} &middot; {WARD.subtitle}. A caregiver does this once per patient.
      </p>

      <section className="setup-step">
        <h2>
          <span className="step-num">1</span> Which bed is this screen for?
        </h2>
        <div className="bed-grid" role="radiogroup" aria-label="Bed">
          {BEDS.map((b) => (
            <button
              key={b.id}
              role="radio"
              aria-checked={bedId === b.id}
              className={`bed-option ${bedId === b.id ? 'is-selected' : ''}`}
              onClick={() => setBedId(b.id)}
            >
              <span className="bed-option-num">Bed {b.id}</span>
              <span className="bed-option-name">{b.patient}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="setup-step">
        <h2>
          <span className="step-num">2</span> How will the patient control the screen?
        </h2>
        <div className="input-options" role="radiogroup" aria-label="Input method">
          {INPUTS.map(({ id, icon: Icon, title, text, ready }) => (
            <button
              key={id}
              role="radio"
              aria-checked={input === id}
              disabled={!ready}
              className={`input-option ${input === id ? 'is-selected' : ''}`}
              onClick={() => setInput(id)}
            >
              <Icon size={24} strokeWidth={1.75} />
              <span>
                <span className="input-option-title">
                  {title} {!ready && <span className="pill">Coming next</span>}
                </span>
                <span className="input-option-text">{text}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="setup-actions">
        <button className="btn btn-primary btn-lg" disabled={!bedId} onClick={() => onStart(bedId, input)}>
          Start bedside screen
        </button>
        {!bedId && <span className="setup-hint">Choose a bed first</span>}
      </div>
    </main>
  );
}
