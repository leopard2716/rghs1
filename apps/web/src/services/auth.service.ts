import { errorFromResponse, UserFacingError } from "../errors";

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthScope = "admin" | `workspace:${string}`;

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
  scope: AuthScope;
  flow?: "password" | "recovery";
};

type SupabaseAuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: {
    id: string;
    email?: string;
  } | null;
};

type SupabaseSignupResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user: {
    id: string;
    email?: string;
  } | null;
};

export type MfaFactor = {
  id: string;
  status: "verified" | "unverified" | string;
  factorType: "totp" | "phone" | "webauthn" | string;
  friendlyName?: string;
  createdAt?: string;
  updatedAt?: string;
  lastChallengedAt?: string | null;
};

export type MfaState = {
  status: "setup_required" | "challenge_required" | "verified";
  currentLevel: "aal1" | "aal2";
  nextLevel: "aal1" | "aal2";
  factors: MfaFactor[];
  verifiedTotpFactors: MfaFactor[];
};

export type TotpEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri?: string;
};

type SupabaseUserResponse = {
  id: string;
  email?: string;
  factors?: Array<{
    id: string;
    status: string;
    factor_type: string;
    friendly_name?: string;
    created_at?: string;
    updated_at?: string;
    last_challenged_at?: string | null;
  }>;
};

type SupabaseTotpEnrollmentResponse = {
  id: string;
  type?: string;
  totp?: {
    qr_code?: string;
    secret?: string;
    uri?: string;
  };
};

type SupabaseMfaChallengeResponse = {
  id: string;
  expires_at?: number;
};

const sessionStorageKey = "rghs1.auth.session";
let sessionRestorePromise: Promise<AuthSession | null> | null = null;
const sessionRefreshPromises = new Map<AuthScope, Promise<AuthSession | null>>();
const sessionListeners = new Set<(session: AuthSession | null) => void>();

function supabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new UserFacingError("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.");
  }

  return { url, anonKey };
}

function authHeaders(anonKey: string): HeadersInit {
  return {
    apikey: anonKey,
    "content-type": "application/json"
  };
}

function authedAuthHeaders(anonKey: string, session: AuthSession): HeadersInit {
  return {
    ...authHeaders(anonKey),
    authorization: `Bearer ${session.accessToken}`
  };
}

function storeSession(session: AuthSession): AuthSession {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
  for (const listener of sessionListeners) {
    listener(session);
  }
  return session;
}

export function subscribeToAuthSession(
  listener: (session: AuthSession | null) => void
): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function sessionFromAuthResponse(
  body: SupabaseAuthResponse,
  fallbackUser?: AuthUser,
  flow: AuthSession["flow"] = "password",
  scope?: AuthScope
): AuthSession {
  const user = body.user ?? fallbackUser;
  if (!user?.id) {
    throw new UserFacingError("Supabase Auth did not return a user session.");
  }
  if (!scope) {
    throw new UserFacingError("The authentication portal scope is missing.");
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_at ? body.expires_at * 1000 : Date.now() + body.expires_in * 1000,
    user: {
      id: user.id,
      email: user.email
    },
    scope,
    flow
  };
}

function jwtPayload(accessToken: string): Record<string, unknown> | null {
  const [, payload] = accessToken.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function authenticatorAssuranceLevel(accessToken: string): "aal1" | "aal2" {
  return jwtPayload(accessToken)?.aal === "aal2" ? "aal2" : "aal1";
}

function toMfaFactor(factor: NonNullable<SupabaseUserResponse["factors"]>[number]): MfaFactor {
  return {
    id: factor.id,
    status: factor.status,
    factorType: factor.factor_type,
    friendlyName: factor.friendly_name,
    createdAt: factor.created_at,
    updatedAt: factor.updated_at,
    lastChallengedAt: factor.last_challenged_at
  };
}

function isVerifiedTotpFactor(factor: MfaFactor): boolean {
  return factor.factorType === "totp" && factor.status === "verified";
}

export function getStoredSession(): AuthSession | null {
  return readStoredSession();
}

function readStoredSession(): AuthSession | null {
  const raw = window.localStorage.getItem(sessionStorageKey);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as AuthSession;
    if (
      !session.accessToken ||
      !session.refreshToken ||
      !session.user?.id ||
      !session.expiresAt ||
      !isAuthScope(session.scope)
    ) {
      clearStoredSession();
      return null;
    }

    return session;
  } catch {
    clearStoredSession();
    return null;
  }
}

export function clearStoredSession(): void {
  window.localStorage.removeItem(sessionStorageKey);
  for (const listener of sessionListeners) {
    listener(null);
  }
}

export function restoreAuthSession(): Promise<AuthSession | null> {
  if (sessionRestorePromise) {
    return sessionRestorePromise;
  }

  sessionRestorePromise = restoreStoredAuthSession().finally(() => {
    sessionRestorePromise = null;
  });
  return sessionRestorePromise;
}

export function ensureFreshAuthSession(
  session: AuthSession,
  forceRefresh = false
): Promise<AuthSession | null> {
  const stored = readStoredSession();
  const current =
    stored?.scope === session.scope &&
    stored.user.id === session.user.id &&
    stored.expiresAt >= session.expiresAt
      ? stored
      : session;

  if (!forceRefresh && current.expiresAt > Date.now() + 60_000) {
    return Promise.resolve(current);
  }

  const activeRefresh = sessionRefreshPromises.get(current.scope);
  if (activeRefresh) {
    return activeRefresh;
  }

  const refreshPromise = refreshAuthSession(current).finally(() => {
    sessionRefreshPromises.delete(current.scope);
  });
  sessionRefreshPromises.set(current.scope, refreshPromise);
  return refreshPromise;
}

async function restoreStoredAuthSession(): Promise<AuthSession | null> {
  const stored = readStoredSession();
  if (!stored) {
    return null;
  }

  if (stored.expiresAt <= Date.now() + 30_000) {
    return refreshAuthSession(stored);
  }

  const validation = await validateAuthSession(stored);
  if (validation === "valid") {
    return stored;
  }

  return refreshAuthSession(stored);
}

async function validateAuthSession(session: AuthSession): Promise<"valid" | "expired"> {
  const { url, anonKey } = supabaseConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/user`, {
      headers: authedAuthHeaders(anonKey, session)
    });
  } catch {
    throw new UserFacingError(
      "Supabase Auth is unavailable. The saved session could not be checked."
    );
  }

  if (response.ok) {
    return "valid";
  }

  if (response.status === 401 || response.status === 403) {
    return "expired";
  }

  throw await errorFromResponse(response, `Session check failed with ${response.status}.`);
}

async function refreshAuthSession(session: AuthSession): Promise<AuthSession | null> {
  const { url, anonKey } = supabaseConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: authHeaders(anonKey),
      body: JSON.stringify({
        refresh_token: session.refreshToken
      })
    });
  } catch {
    throw new UserFacingError(
      "Supabase Auth is unavailable. The saved session could not be refreshed."
    );
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      clearStoredSession();
      return null;
    }

    throw await errorFromResponse(response, `Session refresh failed with ${response.status}.`);
  }

  const body = (await response.json()) as SupabaseAuthResponse;
  return storeSession(sessionFromAuthResponse(body, session.user, session.flow, session.scope));
}

export async function signInWithPassword(
  email: string,
  password: string,
  scope: AuthScope
): Promise<AuthSession> {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(anonKey),
    body: JSON.stringify({
      email,
      password
    })
  });

  if (!response.ok) {
    throw await errorFromResponse(
      response,
      `Credential verification failed with ${response.status}.`
    );
  }

  const body = (await response.json()) as SupabaseAuthResponse;
  return storeSession(sessionFromAuthResponse(body, undefined, "password", scope));
}

export async function signUpWithPassword(
  email: string,
  password: string,
  redirectTo: string,
  displayName: string,
  scope: AuthScope
): Promise<AuthSession> {
  const { url, anonKey } = supabaseConfig();
  const endpoint = new URL(`${url}/auth/v1/signup`);
  endpoint.searchParams.set("redirect_to", redirectTo);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(anonKey),
    body: JSON.stringify({
      email,
      password,
      data: {
        display_name: displayName
      }
    })
  });

  if (!response.ok) {
    throw await errorFromResponse(response, `Account registration failed with ${response.status}.`);
  }

  const body = (await response.json()) as SupabaseSignupResponse;
  if (!body.user?.id || !body.access_token || !body.refresh_token || !body.expires_in) {
    throw new UserFacingError(
      "Supabase email confirmation is enabled. Disable Confirm email for the RGHS1 approval workflow.",
      "email_confirmation_enabled"
    );
  }

  return storeSession(
    sessionFromAuthResponse(
      {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_in: body.expires_in,
        expires_at: body.expires_at,
        user: body.user
      },
      undefined,
      "password",
      scope
    )
  );
}

export async function requestPasswordRecovery(email: string, redirectTo: string): Promise<void> {
  const { url, anonKey } = supabaseConfig();
  const endpoint = new URL(`${url}/auth/v1/recover`);
  endpoint.searchParams.set("redirect_to", redirectTo);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(anonKey),
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw await errorFromResponse(
      response,
      `Password recovery request failed with ${response.status}.`
    );
  }
}

export function consumeAuthSessionFromUrl(): AuthSession | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const errorDescription = params.get("error_description");
  if (errorDescription) {
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`
    );
    throw new UserFacingError(errorDescription);
  }

  const authType = params.get("type");
  if (authType !== "recovery" && authType !== "signup") {
    return null;
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const claims = accessToken ? jwtPayload(accessToken) : null;
  const userId = typeof claims?.sub === "string" ? claims.sub : "";
  if (!accessToken || !refreshToken || !userId) {
    throw new UserFacingError("The password recovery link is invalid or incomplete.");
  }

  const expiresAtValue = Number(params.get("expires_at"));
  const expiresInValue = Number(params.get("expires_in"));
  const scope = authScopeForLocation(window.location.pathname, window.location.search);
  if (!scope) {
    throw new UserFacingError("The authentication link does not identify an RGHS1 portal.");
  }

  const session = storeSession({
    accessToken,
    refreshToken,
    expiresAt:
      Number.isFinite(expiresAtValue) && expiresAtValue > 0
        ? expiresAtValue * 1000
        : Date.now() +
          (Number.isFinite(expiresInValue) && expiresInValue > 0 ? expiresInValue : 3600) * 1000,
    user: {
      id: userId,
      email: typeof claims?.email === "string" ? claims.email : undefined
    },
    scope,
    flow: authType === "recovery" ? "recovery" : "password"
  });

  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`
  );
  return session;
}

export function sessionHasAal2(session: AuthSession): boolean {
  return authenticatorAssuranceLevel(session.accessToken) === "aal2";
}

export async function fetchMfaState(session: AuthSession): Promise<MfaState> {
  const { url, anonKey } = supabaseConfig();
  const current = await requireFreshAuthSession(session);
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: authedAuthHeaders(anonKey, current)
  });

  if (!response.ok) {
    throw await errorFromResponse(response, `MFA state check failed with ${response.status}.`);
  }

  const body = (await response.json()) as SupabaseUserResponse;
  const factors = (body.factors ?? []).map(toMfaFactor);
  const verifiedTotpFactors = factors.filter(isVerifiedTotpFactor);
  const currentLevel = authenticatorAssuranceLevel(current.accessToken);
  const nextLevel = verifiedTotpFactors.length > 0 ? "aal2" : "aal1";

  return {
    status:
      verifiedTotpFactors.length === 0
        ? "setup_required"
        : currentLevel === "aal2"
          ? "verified"
          : "challenge_required",
    currentLevel,
    nextLevel,
    factors,
    verifiedTotpFactors
  };
}

export async function enrollTotpFactor(
  session: AuthSession,
  issuer: string
): Promise<TotpEnrollment> {
  const { url, anonKey } = supabaseConfig();
  const current = await requireFreshAuthSession(session);
  await removeUnverifiedTotpFactors(url, anonKey, current);

  const response = await fetch(`${url}/auth/v1/factors`, {
    method: "POST",
    headers: authedAuthHeaders(anonKey, current),
    body: JSON.stringify({
      factor_type: "totp",
      friendly_name: current.user.email ?? "RGHS1 authenticator",
      issuer
    })
  });

  if (!response.ok) {
    throw await errorFromResponse(response, `MFA enrollment failed with ${response.status}.`);
  }

  const body = (await response.json()) as SupabaseTotpEnrollmentResponse;
  if (!body.id || !body.totp?.qr_code || !body.totp.secret) {
    throw new UserFacingError("Supabase Auth did not return a TOTP QR code.");
  }

  return {
    factorId: body.id,
    qrCode: body.totp.qr_code,
    secret: body.totp.secret,
    uri: body.totp.uri
  };
}

async function removeUnverifiedTotpFactors(
  url: string,
  anonKey: string,
  session: AuthSession
): Promise<void> {
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: authedAuthHeaders(anonKey, session)
  });

  if (!userResponse.ok) {
    throw await errorFromResponse(
      userResponse,
      `Existing MFA factor check failed with ${userResponse.status}.`
    );
  }

  const user = (await userResponse.json()) as SupabaseUserResponse;
  const staleFactors = (user.factors ?? []).filter(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified"
  );

  for (const factor of staleFactors) {
    const response = await fetch(`${url}/auth/v1/factors/${factor.id}`, {
      method: "DELETE",
      headers: authedAuthHeaders(anonKey, session)
    });

    if (!response.ok) {
      throw await errorFromResponse(
        response,
        `Stale MFA factor cleanup failed with ${response.status}.`
      );
    }
  }
}

export async function challengeTotpFactor(
  session: AuthSession,
  factorId: string
): Promise<SupabaseMfaChallengeResponse> {
  const { url, anonKey } = supabaseConfig();
  const current = await requireFreshAuthSession(session);
  const response = await fetch(`${url}/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    headers: authedAuthHeaders(anonKey, current),
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw await errorFromResponse(response, `MFA challenge failed with ${response.status}.`);
  }

  return (await response.json()) as SupabaseMfaChallengeResponse;
}

export async function verifyTotpFactor(
  session: AuthSession,
  factorId: string,
  challengeId: string,
  code: string
): Promise<AuthSession> {
  const { url, anonKey } = supabaseConfig();
  const current = await requireFreshAuthSession(session);
  const response = await fetch(`${url}/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    headers: authedAuthHeaders(anonKey, current),
    body: JSON.stringify({
      challenge_id: challengeId,
      code
    })
  });

  if (!response.ok) {
    throw await errorFromResponse(response, `MFA verification failed with ${response.status}.`);
  }

  const body = (await response.json()) as SupabaseAuthResponse;
  return storeSession(sessionFromAuthResponse(body, current.user, current.flow, current.scope));
}

export async function verifyTotpCode(
  session: AuthSession,
  factorId: string,
  code: string
): Promise<AuthSession> {
  const challenge = await challengeTotpFactor(session, factorId);
  return verifyTotpFactor(session, factorId, challenge.id, code);
}

export async function updateAuthenticatedPassword(
  session: AuthSession,
  password: string
): Promise<void> {
  const { url, anonKey } = supabaseConfig();
  const current = await requireFreshAuthSession(session);
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${current.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ password })
  });

  if (!response.ok) {
    throw await errorFromResponse(response, `Password update failed with ${response.status}.`);
  }
}

export async function signOut(session: AuthSession): Promise<void> {
  const { url, anonKey } = supabaseConfig();

  try {
    const current = await ensureFreshAuthSession(session);
    if (!current) {
      return;
    }
    const response = await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${current.accessToken}`
      }
    });

    if (!response.ok) {
      throw await errorFromResponse(response, `Sign out failed with ${response.status}.`);
    }
  } finally {
    clearStoredSession();
  }
}

async function requireFreshAuthSession(session: AuthSession): Promise<AuthSession> {
  const current = await ensureFreshAuthSession(session);
  if (!current) {
    throw new UserFacingError("Your session expired. Sign in again.", "invalid_auth_token");
  }

  return current;
}

export function workspaceAuthScope(slug: string): AuthScope {
  return `workspace:${slug.toLowerCase()}`;
}

export function sessionMatchesAuthScope(
  session: AuthSession | null | undefined,
  scope: AuthScope
): session is AuthSession {
  return session?.scope === scope;
}

export function authScopeForLocation(pathname: string, search = ""): AuthScope | null {
  if (pathname === "/recover") {
    const returnTo = new URLSearchParams(search).get("returnTo");
    if (
      !returnTo ||
      !returnTo.startsWith("/") ||
      returnTo.startsWith("//") ||
      returnTo.startsWith("/recover")
    ) {
      return null;
    }

    const returnUrl = new URL(returnTo, "https://rghs1.local");
    return authScopeForLocation(returnUrl.pathname, returnUrl.search);
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "admin";
  }

  const [firstSegment] = pathname.split("/").filter(Boolean);
  if (!firstSegment) {
    return null;
  }

  try {
    const slug = decodeURIComponent(firstSegment).toLowerCase();
    return slug === "admin" || slug === "recover" ? null : workspaceAuthScope(slug);
  } catch {
    return null;
  }
}

function isAuthScope(value: unknown): value is AuthScope {
  return (
    value === "admin" ||
    (typeof value === "string" && /^workspace:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
  );
}
