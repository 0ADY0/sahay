// Text-to-speech using the browser's built-in voices (works offline on most systems).
let voice = null;

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  // Prefer an Indian English voice, then any English voice.
  voice =
    voices.find((v) => v.lang === 'en-IN') ||
    voices.find((v) => v.lang?.startsWith('en-GB')) ||
    voices.find((v) => v.lang?.startsWith('en')) ||
    null;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

/**
 * Speak text aloud. By default anything still being spoken is cut off;
 * with { queue: true } it waits its turn instead.
 */
export function speak(text, { queue = false } = {}) {
  const synth = window.speechSynthesis;
  if (!synth || !text) return;
  if (!queue) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = 0.95;
  synth.speak(u);
}
