import { getSession, clearSession, authApi } from "../api/client";
import type { AuthUser } from "../types";

/**
 * Returns the current authenticated user from session storage.
 * Does NOT maintain reactive state — call after navigation/render triggers.
 */
export function useCurrentUser(): AuthUser | null {
  return getSession()?.user ?? null;
}

/**
 * Signs out the current user: calls the logout endpoint (best-effort),
 * clears local session, and redirects to /login.
 *
 * Server-side logout is a no-op per the API contract (no session state),
 * but we call it anyway for good hygiene.
 */
export async function logout(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // Ignore errors — token may already be expired
  } finally {
    clearSession();
    window.location.href = "/login";
  }
}

/**
 * Route guard helper — call at the top of protected pages.
 * Returns the current user or redirects to /login if unauthenticated.
 */
export function requireAuth(): AuthUser {
  const user = getSession()?.user;
  if (!user) {
    window.location.href = "/login";
    throw new Error("Not authenticated");
  }
  return user;
}
