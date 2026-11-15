// Typed wrappers for the endpoints in DESIGN.md section 9.
// The base URL comes from the environment so the deployed front end can point
// at the deployed back end without a code change.

const BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
);

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    // Announced verbatim, so it has to read as a sentence a person can act on.
    throw new ApiFailure('NETWORK', 'Could not reach the server. Check your connection.');
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (body as { error?: ApiError } | null)?.error;
    throw new ApiFailure(err?.code ?? 'MODEL_ERROR', err?.message ?? 'Something went wrong.');
  }
  return body as T;
}

export interface HealthResponse {
  ok: boolean;
}

export function health(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health');
}

/** Capture response — DESIGN.md 9. `id` and `valid` are filled in server-side.
 *
 *  The back end accepts JPEG, PNG, WebP and GIF. PDF pages are issue #26; until
 *  then the Capture screen says so rather than letting the upload fail at the
 *  server with a less helpful message.
 */
export const CAPTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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
export function capture(image: Blob, context = ''): Promise<CaptureResponse> {
  const form = new FormData();
  // A filename is required or some servers reject the part outright.
  form.append('image', image, 'capture.jpg');
  if (context) form.append('context', context);
  // No Content-Type header: the browser must set the multipart boundary.
  return request<CaptureResponse>('/api/capture', { method: 'POST', body: form });
}

// The remaining endpoints are implemented with their own issues:
//   /api/transcribe       issue #15
//   /api/spoken-to-latex  issue #17
//   /api/command          issue #24
//   /api/diff             issue #20
//   /api/summary          issue #11
export { BASE as apiBase };
