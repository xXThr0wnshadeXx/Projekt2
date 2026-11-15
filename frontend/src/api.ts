// Typed wrappers for the endpoints in DESIGN.md section 9.
// The base URL comes from the environment so the deployed front end can point
// at the deployed back end without a code change.

import { resolveApiBase, UNCONNECTED_MESSAGE } from './apiBase';

/** Null on a production build made without VITE_API_BASE (issue #135). */
const BASE = resolveApiBase(import.meta.env);

/** The single error shape the back end returns (DESIGN.md section 9).
 *
 * DESIGN.md section 9 lists four codes. The back end also returns
 * MODE_DISABLED (exam mode), RATE_LIMITED, NOT_FOUND and INTERNAL, so they are
 * included here. Keep this in step with `ErrorCode` in `backend/app/errors.py`.
 */
export type ApiErrorCode =
  | 'UNPARSEABLE'
  | 'TIMEOUT'
  | 'MODEL_ERROR'
  | 'BAD_INPUT'
  | 'MODE_DISABLED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export class ApiFailure extends Error {
  code: ApiErrorCode | 'NETWORK';
  constructor(code: ApiErrorCode | 'NETWORK', message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiFailure';
  }
}

// These are recovery limits, not latency targets. Leave room for the server's
// 10-second capture / 4-second speech budgets and a slow connection, but never
// leave a student waiting indefinitely. Do not retry model calls automatically.
const REQUEST_MS = 6_000;
const CAPTURE_MS = 12_000;
// Transcription uploads up to 30 s of audio before its 4 s model budget even
// starts, and a study-mode step check is up to 2 s of CAS plus a 4 s model
// explanation. 6 s would cut both off just as the server was about to answer.
const SLOW_MS = 10_000;

/** Keep the deadline active until the response body has been read as well. */
async function withinDeadline<T>(
  path: string,
  init: RequestInit | undefined,
  consume: (response: Response) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  // No address to try: say so rather than send the request somewhere wrong.
  if (BASE === null) throw new ApiFailure('NETWORK', UNCONNECTED_MESSAGE);

  const controller = new AbortController();
  const caller = init?.signal;
  const cancel = () => controller.abort(caller?.reason);
  let timedOut = false;
  if (caller?.aborted) cancel();
  else caller?.addEventListener('abort', cancel, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal });
    return await consume(res);
  } catch (error: unknown) {
    if (timedOut) {
      throw new ApiFailure('TIMEOUT', 'The server took too long to respond. Try again.');
    }
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('NETWORK', 'Could not reach the server. Check your connection.');
  } finally {
    window.clearTimeout(timer);
    caller?.removeEventListener('abort', cancel);
  }
}

async function responseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (error: unknown) {
    // A connection can stall after headers arrive. Do not swallow that abort
    // and turn a timed-out body into a successful null response.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_MS): Promise<T> {
  return withinDeadline(path, init, async (res) => {
    const body = await responseJson(res);
    if (!res.ok) {
      const err = (body as { error?: ApiError } | null)?.error;
      throw new ApiFailure(err?.code ?? 'MODEL_ERROR', err?.message ?? 'Something went wrong.');
    }
    return body as T;
  }, timeoutMs);
}

export interface HealthResponse {
  ok: boolean;
  /** Whether the server can read images and speech (#127). Older servers
   *  leave it out, which is taken as yes. */
  models?: boolean;
}

export function health(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health', undefined, 5_000);
}

/** Why the back end could not be reached, when it could not be. */
export type Unreachable =
  /** Nothing answered: wrong address, server down, or no connection. */
  | 'offline'
  /** The server answered, but will not accept requests from this site. */
  | 'blocked';

/**
 * Tell a server that is down apart from one that is up but refusing this
 * origin. The browser reports both to JavaScript as the same opaque network
 * failure, so without this the app says "not reachable" when the real problem
 * is one line of configuration — which is a miserable thing to debug on demo
 * morning.
 *
 * A `no-cors` request is not blocked by the CORS policy: it returns an opaque
 * response if something is listening and rejects if nothing is.
 */
export async function diagnoseUnreachable(): Promise<Unreachable> {
  try {
    await withinDeadline('/api/health', { mode: 'no-cors', cache: 'no-store' }, async () => undefined, 5_000);
    return 'blocked';
  } catch {
    return 'offline';
  }
}

/** Capture response — DESIGN.md 9. `id` and `valid` are filled in server-side.
 *
 *  The back end checks the file signature, not the declared type, and allows
 *  JPEG, PNG and WebP. A PDF is not sent here directly: the Capture screen
 *  asks which page, renders it through /api/pdf/page, and captures the
 *  resulting image like any other photo (issue #26).
 */
export const CAPTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface CaptureLine {
  id: string;
  latex: string;
  confidence: number;
  intent_notes: string;
  valid: boolean;
}

export interface CaptureDiagram {
  id: string;
  description: string;
}

export interface CaptureResponse {
  instructions: string;
  lines: CaptureLine[];
  diagrams: CaptureDiagram[];
  warnings: string[];
}

/** Send an image for transcription. `context` is optional free text. */
export function capture(image: Blob, context = '', signal?: AbortSignal): Promise<CaptureResponse> {
  const form = new FormData();
  // A filename is required or some servers reject the part outright.
  form.append('image', image, 'capture.jpg');
  if (context) form.append('context', context);
  // No Content-Type header: the browser must set the multipart boundary.
  return request<CaptureResponse>('/api/capture', { method: 'POST', body: form, signal }, CAPTURE_MS);
}

/** How many pages a PDF has, so the student can be asked which one. */
export function pdfPageCount(pdf: Blob): Promise<{ pages: number }> {
  const form = new FormData();
  form.append('pdf', pdf, 'worksheet.pdf');
  // The whole PDF is uploaded here too, so it gets the capture deadline.
  return request<{ pages: number }>('/api/pdf/pages', { method: 'POST', body: form }, CAPTURE_MS);
}

/** One page of a PDF, rendered to a PNG that `capture` can read.
 *
 *  This returns an image rather than JSON, so it cannot go through `request`.
 *  The error shape is still the DESIGN.md 9 one, so failures are read the same
 *  way and reach the student as a sentence.
 */
export async function pdfPage(pdf: Blob, page: number): Promise<Blob> {
  const form = new FormData();
  form.append('pdf', pdf, 'worksheet.pdf');
  form.append('page', String(page));

  return withinDeadline('/api/pdf/page', { method: 'POST', body: form }, async (res) => {
    if (!res.ok) {
      const body = await responseJson(res);
      const err = (body as { error?: ApiError } | null)?.error;
      throw new ApiFailure(err?.code ?? 'MODEL_ERROR', err?.message ?? 'Could not read that page.');
    }
    return res.blob();
  }, CAPTURE_MS);
}

export interface TranscribeResponse {
  text: string;
}

/** Send a recording for speech-to-text. `contentType` must be the bare type. */
export function transcribe(audio: Blob, contentType: string): Promise<TranscribeResponse> {
  const form = new FormData();
  // The extension has to agree with the content type or the server's demuxer
  // is chosen wrongly and the file is rejected as invalid.
  const extension = contentType === 'audio/mp4' ? 'mp4' : 'webm';
  form.append('audio', new File([audio], `recording.${extension}`, { type: contentType }));
  return request<TranscribeResponse>('/api/transcribe', { method: 'POST', body: form }, SLOW_MS);
}

export interface SpokenAlternative {
  latex: string;
  readback: string;
  /** False when SymPy could not read this option. It is still offered — the
   *  student knows what they said, and DESIGN.md 27 marks such a line unsure
   *  rather than hiding it — but it is flagged as unchecked. */
  valid: boolean;
}

/** Spoken math turned into LaTeX — DESIGN.md 9.
 *
 *  When `ambiguous` is true, `latex` and `readback` are null and the student is
 *  asked which grouping they meant. That asking, rather than guessing, is the
 *  behaviour the product is pitched on (DESIGN.md 3).
 */
export interface SpokenResponse {
  latex: string | null;
  ambiguous: boolean;
  clarifying_question: string | null;
  alternatives: SpokenAlternative[];
  readback: string | null;
  valid: boolean;
}

export function spokenToLatex(
  text: string,
  contextLines: string[] = [],
): Promise<SpokenResponse> {
  return request<SpokenResponse>('/api/spoken-to-latex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Prior lines supply variable names only; the server treats them as data.
    body: JSON.stringify({ text, context_lines: contextLines }),
  });
}

/** Whether SymPy can read a line that was typed and read in the browser.
 *
 *  One boolean, no model, so it works on a server with no model key. Null when
 *  the server cannot be asked at all, which is a different thing from "no".
 */
export async function validateLatex(latex: string): Promise<boolean | null> {
  try {
    const result = await request<{ valid: boolean }>('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex }),
    }, 3_000);
    return Boolean(result.valid);
  } catch {
    return null;
  }
}

/** Step check — DESIGN.md 9, 11, 14.
 *
 *  SymPy decides; the model only names the operation, and only in study mode
 *  after SymPy has verified the step. A step that isn't verified is always
 *  "I couldn't confirm this step." — never "wrong". Exam mode is refused by
 *  the server (403), and the UI never calls it there.
 */
export interface DiffResponse {
  verified: boolean;
  method: string;
  message: string;
}

export function diff(
  fromLatex: string,
  toLatex: string,
  mode: 'study' | 'homework' | 'exam',
  signal?: AbortSignal,
): Promise<DiffResponse> {
  return request<DiffResponse>('/api/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_latex: fromLatex, to_latex: toLatex, mode }),
    signal,
  }, SLOW_MS);
}

/** Voice/typed command — DESIGN.md 9, issue #24. `target_line` is "W" plus a
 *  1-based line number. Unknown commands come back as intent "unknown". */
export type CommandIntent =
  | 'navigate' | 'read' | 'edit' | 'delete' | 'undo' | 'new_line'
  | 'check' | 'what_changed' | 'export' | 'help' | 'unknown';

export interface CommandResponse {
  intent: CommandIntent;
  target_line: string | null;
  instruction: string | null;
  /** A fixed sentence from the server when a request was refused. */
  message?: string;
}

export function command(
  text: string,
  currentLine: string | null,
  lineCount: number,
): Promise<CommandResponse> {
  return request<CommandResponse>('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, current_line: currentLine, line_count: lineCount }),
  });
}

// The remaining endpoint is implemented with its own issue:
//   /api/summary          issue #11
export { BASE as apiBase };
/** False on a deployed build that was never given a back-end address. */
export const apiConnected = BASE !== null;
