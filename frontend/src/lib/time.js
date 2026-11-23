import { useEffect, useState } from 'react';

/** Re-renders every `ms` so elapsed times stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function formatElapsed(fromTs, now = Date.now()) {
  const s = Math.max(0, Math.round((now - fromTs) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
