/*
  One place where every input source (camera tracker, keyboard, Python CV
  service later) publishes the same small set of events. The patient board only
  listens to this bus, so it does not care where the events come from.

  Events:
    { type: 'move',   dir: 'left' | 'right' | 'up' | 'down' }
    { type: 'hold',   progress: 0..1 }   eyes closed (or Space held); 0 = open again
    { type: 'select' }                   hold reached 100%
    { type: 'cancel' }                   explicit cancel (caregiver key)
*/
const subscribers = new Set();

export const inputBus = {
  emit(event) {
    subscribers.forEach((fn) => fn(event));
  },
  on(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};
