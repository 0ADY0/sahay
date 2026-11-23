import { useSyncExternalStore } from 'react';

/*
  Shared ward state for the prototype.

  For now this lives in localStorage, so a bedside tab and a nurse-station tab
  in the same browser stay in sync (the browser fires a `storage` event in the
  other tab on every write). When the FastAPI backend exists, only the functions
  in `wardActions` need to change: they become API calls, and the backend
  pushes updates over a WebSocket instead of the `storage` event.
*/

const KEY = 'sahay.ward.v1';
const EMPTY = { requests: [], beds: {} };

let cache = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function commit(next) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: state still works within this tab */
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    cache = load();
    listeners.forEach((l) => l());
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWard() {
  return useSyncExternalStore(subscribe, () => cache);
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function updateRequest(id, patch) {
  commit({
    ...cache,
    requests: cache.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  });
}

export const wardActions = {
  /** Patient sends a message. Returns the created record. */
  send(bedId, message) {
    const record = {
      id: uid(),
      bed: bedId,
      messageId: message.id,
      label: message.label,
      kind: message.kind,
      priority: message.priority,
      // Replies (yes/no) are informational and need no acknowledgement.
      status: message.kind === 'reply' ? 'info' : 'open',
      createdAt: Date.now(),
    };
    commit({ ...cache, requests: [record, ...cache.requests].slice(0, 300) });
    return record;
  },
  /** Extra answers for a request, e.g. { severity: 'Severe', location: 'Surgical site' }. */
  addDetails(id, details) {
    const current = cache.requests.find((r) => r.id === id);
    updateRequest(id, { details: { ...current?.details, ...details } });
  },
  acknowledge(id) {
    updateRequest(id, { status: 'ack', ackAt: Date.now() });
  },
  resolve(id) {
    updateRequest(id, { status: 'resolved', resolvedAt: Date.now() });
  },
  /** Bedside screen reports that it is alive and whether it can see the patient. */
  heartbeat(bedId, info) {
    commit({
      ...cache,
      beds: { ...cache.beds, [bedId]: { ...cache.beds[bedId], ...info, lastSeen: Date.now() } },
    });
  },
  clearAll() {
    commit(EMPTY);
  },
};

/** The most recent request from a bed that still needs (or just got) attention. */
export function latestActiveRequest(state, bedId) {
  return state.requests.find((r) => r.bed === bedId && (r.status === 'open' || r.status === 'ack'));
}
