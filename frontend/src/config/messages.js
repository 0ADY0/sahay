import {
  ThumbsUp,
  ThumbsDown,
  BellRing,
  Siren,
  GlassWater,
  Utensils,
  Bandage,
  HandHelping,
  MessageSquareText,
} from 'lucide-react';

/*
  The options on the patient's board, in grid order (4 columns).

  kind:
    'request' -> creates a task on the nurse station that must be acknowledged
    'reply'   -> said aloud and shown to the nurse, no task (yes / no, personal messages)
  priority:
    'urgent' | 'high' | 'normal'  (controls colour + alert sound at the nurse station)
  followUps:
    optional questions asked right after the request is sent. The nurse is
    told immediately; the answers are added to the request as they come in.
*/

const PAIN_FOLLOW_UPS = [
  {
    id: 'severity',
    question: 'How bad is the pain?',
    options: [
      { id: 'mild', label: 'Mild', sub: '1 – 3', level: 1 },
      { id: 'moderate', label: 'Moderate', sub: '4 – 6', level: 2 },
      { id: 'severe', label: 'Severe', sub: '7 – 8', level: 3 },
      { id: 'worst', label: 'Very severe', sub: '9 – 10', level: 4 },
    ],
  },
  {
    id: 'location',
    question: 'Where does it hurt?',
    options: [
      { id: 'head', label: 'Head' },
      { id: 'chest', label: 'Chest' },
      { id: 'stomach', label: 'Stomach' },
      { id: 'wound', label: 'Surgical wound' },
      { id: 'back', label: 'Back' },
      { id: 'arms', label: 'Arms' },
      { id: 'legs', label: 'Legs' },
      { id: 'other', label: 'Somewhere else' },
    ],
  },
];

export const MESSAGES = [
  { id: 'yes', label: 'Yes', spoken: 'Yes', icon: ThumbsUp, kind: 'reply', priority: 'normal' },
  { id: 'no', label: 'No', spoken: 'No', icon: ThumbsDown, kind: 'reply', priority: 'normal' },
  { id: 'nurse', label: 'Call the nurse', spoken: 'Please call the nurse', icon: BellRing, kind: 'request', priority: 'normal' },
  { id: 'emergency', label: 'Emergency', spoken: 'Emergency. I need help now', icon: Siren, kind: 'request', priority: 'urgent' },
  { id: 'water', label: 'I need water', spoken: 'I need water', icon: GlassWater, kind: 'request', priority: 'normal' },
  { id: 'food', label: 'I need food', spoken: 'I need food', icon: Utensils, kind: 'request', priority: 'normal' },
  {
    id: 'pain',
    label: 'I am in pain',
    spoken: 'I am in pain',
    icon: Bandage,
    kind: 'request',
    priority: 'high',
    followUps: PAIN_FOLLOW_UPS,
    // How the answers are read out and shown, e.g. "Severe pain, surgical wound"
    summarize: (a) => [a.severity && `${a.severity} pain`, a.location].filter(Boolean).join(', '),
  },
  { id: 'assist', label: 'I need assistance', spoken: 'I need assistance', icon: HandHelping, kind: 'request', priority: 'normal' },
];

export const GRID_COLUMNS = 4;

export const EMERGENCY = MESSAGES.find((m) => m.id === 'emergency');

export const messageById = (id) => MESSAGES.find((m) => m.id === id);

/** A caregiver-added message, stored as plain data, turned into a board option. */
export function customToMessage(c) {
  return {
    id: c.id,
    label: c.label,
    spoken: c.label,
    icon: MessageSquareText,
    kind: c.notify ? 'request' : 'reply',
    priority: 'normal',
    custom: true,
  };
}
