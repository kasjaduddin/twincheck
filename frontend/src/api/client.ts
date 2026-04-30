import type {
  AuthSession,
  Claim,
  ClaimsListResponse,
  Equipment,
  Report,
  DamageFinding,
  GsJob,
  AdjusterSummary,
} from "../types";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/v1";

// ─── Session storage ─────────────────────────────────────────────────────────

const SESSION_KEY = "twincheck_session";

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function getToken(): string | null {
  return getSession()?.token ?? null;
}

// ─── Core fetch wrapper ──────────────────────────────────────────────────────

interface RequestOptions {
  method?: string;
  body?: unknown;
  requiresAuth?: boolean;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, requiresAuth = true } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (requiresAuth) {
    const token = getToken();
    if (!token) throw new ApiError(401, "No auth token");
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401 on any authenticated request → clear session and redirect to login
  if (res.status === 401 && requiresAuth) {
    clearSession();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }

  const json = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`);
  }

  // Support both { "data": {...} } wrapper (API contract) and direct {...} response
  // Backend Phase 0 returns unwrapped responses — this handles both formats
  return (json.data ?? json) as T;
}

// ─── Auth endpoints ──────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string): Promise<AuthSession> =>
    request<AuthSession>("/auth/login", {
      method: "POST",
      body: { email, password },
      requiresAuth: false,
    }),

  logout: (): Promise<void> =>
    request<void>("/auth/logout", { method: "POST" }),
};

// ─── Claims endpoints ────────────────────────────────────────────────────────

export const claimsApi = {
  list: (params?: {
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<ClaimsListResponse> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<ClaimsListResponse>(`/claims${query}`);
  },

  get: (claimId: string): Promise<Claim> =>
    request<Claim>(`/claims/${claimId}`),

  assign: (claimId: string, adjusterId: string): Promise<Claim> =>
    request<Claim>(`/claims/${claimId}/assign`, {
      method: "PATCH",
      body: { adjuster_id: adjusterId },
    }),

  reassign: (claimId: string, adjusterId: string): Promise<Claim> =>
    request<Claim>(`/claims/${claimId}/reassign`, {
      method: "PATCH",
      body: { adjuster_id: adjusterId },
    }),

  updateStatus: (claimId: string, status: string): Promise<Claim> =>
    request<Claim>(`/claims/${claimId}/status`, {
      method: "PATCH",
      body: { status },
    }),
};

// ─── Equipment endpoints ─────────────────────────────────────────────────────

export const equipmentApi = {
  get: (claimId: string): Promise<Equipment> =>
    request<Equipment>(`/claims/${claimId}/equipment`),
};

// ─── Reports endpoints ───────────────────────────────────────────────────────

export const reportsApi = {
  get: (claimId: string): Promise<Report> =>
    request<Report>(`/claims/${claimId}/report`),
};

// ─── Damage findings endpoints ───────────────────────────────────────────────

export const damageApi = {
  list: (
    claimId: string,
    severity?: string,
  ): Promise<{ findings: DamageFinding[] }> => {
    const qs = severity ? `?severity=${severity}` : "";
    return request<{ findings: DamageFinding[] }>(
      `/claims/${claimId}/damage-findings${qs}`,
    );
  },
};

// ─── GS job endpoints ────────────────────────────────────────────────────────

export const gsApi = {
  getJob: (claimId: string): Promise<GsJob> =>
    request<GsJob>(`/claims/${claimId}/gs-job`),
};

// ─── Users endpoints ─────────────────────────────────────────────────────────

export const usersApi = {
  adjusters: (): Promise<{ adjusters: AdjusterSummary[] }> =>
    request<{ adjusters: AdjusterSummary[] }>("/users/adjusters"),
};

export { ApiError };