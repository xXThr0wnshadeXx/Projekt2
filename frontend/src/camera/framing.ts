// Is the worksheet in the picture? Issue #198, answered by OpenAI in #242.
//
// A blind student cannot see the camera preview, so Glance has to tell them
// how to move the phone. The vision model, called through the back end's
// /api/frame, looks at one small downscaled camera frame and says what is wrong
// with the framing, or that it is good. It is asked only about framing, never to
// read the maths. That frame is sent to OpenAI like the final photo is, and is
// not stored. There is no on-device image analysis here: this file only holds
// the shared vocabulary.

export type Guidance =
  | 'too-dark'
  | 'no-page'
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'move-down'
  | 'closer'
  | 'further'
  | 'good';

export const GUIDANCE_VALUES: readonly Guidance[] = [
  'too-dark', 'no-page', 'move-left', 'move-right', 'move-up', 'move-down', 'closer', 'further', 'good',
];

export interface FrameReport {
  guidance: Guidance;
  /** The model's short note on the framing, if it gave one. Not spoken. */
  reason?: string | null;
}

/** What to say for each kind of guidance. Short: they repeat while moving. */
export const SAY: Record<Guidance, string> = {
  'too-dark': 'It is too dark. Move toward a light.',
  'no-page': 'I cannot see a page yet. Point the camera down at the paper.',
  'move-left': 'Move the phone left.',
  'move-right': 'Move the phone right.',
  'move-up': 'Move the phone up, toward the top of the page.',
  'move-down': 'Move the phone down, toward the bottom of the page.',
  closer: 'Bring the phone closer.',
  further: 'Lift the phone higher. The page is cut off.',
  good: 'Hold still.',
};

/** Which way to move for the guide tone, -1 (left) to 1 (right). */
export const PAN: Partial<Record<Guidance, number>> = {
  'move-left': -1,
  'move-right': 1,
  'move-up': 0,
  'move-down': 0,
  closer: 0,
  further: 0,
  good: 0,
};

/** How close to well framed each answer is, 0 to 1, for the tick's speed. */
export const CENTRED: Partial<Record<Guidance, number>> = {
  'move-left': 0.5,
  'move-right': 0.5,
  'move-up': 0.5,
  'move-down': 0.5,
  closer: 0.6,
  further: 0.3,
  good: 1,
};

/** Check a model answer against the known guidance values. */
export function asGuidance(value: unknown): Guidance | null {
  return GUIDANCE_VALUES.find((g) => g === value) ?? null;
}
