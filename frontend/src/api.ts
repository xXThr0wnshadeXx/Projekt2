// Typed wrappers for the endpoints in DESIGN.md section 9.
// The base URL comes from the environment so the deployed front end can point
// at the deployed back end without a code change.

const BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
);

/** The single error shape the back end returns (DESIGN.md section 9). */
export interface ApiError {
  code: 'UNPARSEABLE' | 'TIMEOUT' | 'MODEL_ERROR' | 'BAD_INPUT';
  message: string;
}

export class ApiFailure extends Error {
  code: ApiError['code'] | 'NETWORK';
  constructor(code: ApiError['code'] | 'NETWORK', message: string) {
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

// The remaining endpoints are implemented with their own issues:
//   /api/capture          issue #7
//   /api/transcribe       issue #15
//   /api/spoken-to-latex  issue #17
//   /api/command          issue #24
//   /api/diff             issue #20
//   /api/summary          issue #11
export { BASE as apiBase };
