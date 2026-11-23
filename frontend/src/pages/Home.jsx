import { Link } from 'react-router-dom';
import { Bed, ChevronRight, Hospital, Stethoscope } from 'lucide-react';

const ENTRIES = [
  {
    to: '/patient',
    icon: Bed,
    title: 'Bedside screen',
    text: 'For the patient. Choose a message with the eyes; it is spoken aloud and sent to the nurse.',
    ready: true,
  },
  {
    to: '/nurse',
    icon: Stethoscope,
    title: 'Nurse station',
    text: 'For the ward. See every bed and every request as it comes in.',
    ready: false,
  },
  {
    to: '/resources',
    icon: Hospital,
    title: 'Hospitals & blood banks',
    text: 'Find nearby hospitals, blood banks and blood groups.',
    ready: false,
  },
];

export default function Home() {
  return (
    <main className="home">
      <header className="home-head">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Sahay</span>
      </header>

      <section className="home-intro">
        <h1>Communication for patients who cannot speak.</h1>
        <p>
          A normal webcam follows the patient&rsquo;s eyes. They choose what they need, and the
          nurse is told straight away.
        </p>
      </section>

      <nav className="home-entries" aria-label="Open a screen">
        {ENTRIES.map(({ to, icon: Icon, title, text, ready }) =>
          ready ? (
            <Link key={to} to={to} className="entry">
              <Icon size={28} strokeWidth={1.75} className="entry-icon" />
              <span className="entry-body">
                <span className="entry-title">{title}</span>
                <span className="entry-text">{text}</span>
              </span>
              <ChevronRight size={22} className="entry-chevron" />
            </Link>
          ) : (
            <div key={to} className="entry entry-disabled" aria-disabled="true">
              <Icon size={28} strokeWidth={1.75} className="entry-icon" />
              <span className="entry-body">
                <span className="entry-title">
                  {title} <span className="pill">Coming next</span>
                </span>
                <span className="entry-text">{text}</span>
              </span>
            </div>
          ),
        )}
      </nav>

      <p className="home-foot">Prototype &middot; video never leaves this computer</p>
    </main>
  );
}
