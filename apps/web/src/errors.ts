export class UserFacingError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "UserFacingError";
    this.code = code;
  }
}

type ErrorPayload = {
  code?: string;
  error?: string;
  error_code?: string;
  msg?: string;
  message?: string;
};

const authErrorMessages: Record<string, string> = {
  invalid_credentials: "Invalid email or password.",
  invalid_auth_token: "Your session expired. Sign in again.",
  email_not_confirmed: "Confirm your email address before signing in.",
  email_confirmation_enabled: "Disable Supabase Confirm email for workspace registration.",
  signup_disabled: "Sign up is disabled for this project.",
  otp_expired: "The verification session expired. Sign in again.",
  over_email_send_rate_limit: "Please wait before requesting another email.",
  mfa_required: "MFA verification is required before opening this area.",
  mfa_verification_failed: "Invalid authenticator code.",
  workspace_delete_grace_expired:
    "The deletion grace period has expired. This workspace can no longer be restored.",
  tenant_deletion_migration_required: "Apply Supabase migration 0003 before using tenant deletion.",
  workspace_member_status_migration_required:
    "Apply Supabase migration 0005 before registering workspace users.",
  tenant_identity_migration_required:
    "Apply Supabase migration 0006 before using workspace identity features.",
  tracking_schema_migration_required:
    "Apply the latest Supabase tracking migrations before using tracking records.",
  weak_password: "Choose a stronger password.",
  same_password: "The new password must be different from the current password.",
  auth_upstream_unreachable:
    "The API cannot reach Supabase Auth. Restart the API after checking its environment.",
  workspace_registration_required: "Register for this workspace before signing in.",
  workspace_member_disabled: "This workspace account is disabled.",
  workspace_self_status_forbidden: "You cannot change your own workspace status.",
  workspace_self_delete_forbidden: "You cannot remove your own workspace membership."
};

function parseErrorPayload(text: string): ErrorPayload | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as ErrorPayload;
  } catch {
    return null;
  }
}

export async function errorFromResponse(
  response: Response,
  fallback: string
): Promise<UserFacingError> {
  const text = await response.text();
  const payload = parseErrorPayload(text);
  const code = payload?.error_code ?? payload?.code;

  if (code && authErrorMessages[code]) {
    return new UserFacingError(authErrorMessages[code], code);
  }

  const message = payload?.message ?? payload?.msg ?? payload?.error ?? text;
  if (message.toLowerCase().includes("session_id claim in jwt does not exist")) {
    return new UserFacingError("Your session expired. Sign out, then sign in again.");
  }

  if (
    message.toLowerCase().includes("token is expired") ||
    message.toLowerCase().includes("token has expired") ||
    message.toLowerCase().includes("invalid jwt")
  ) {
    return new UserFacingError("Your session expired. Sign in again.", "invalid_auth_token");
  }

  if (message.toLowerCase().includes("invalid totp") || message.toLowerCase().includes("mfa")) {
    return new UserFacingError(message || "MFA verification failed.");
  }

  return new UserFacingError(message || fallback, code);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

export function errorFromAuthError(error: { code?: string; message?: string }): UserFacingError {
  const knownMessage = error.code ? authErrorMessages[error.code] : undefined;
  if (knownMessage) {
    return new UserFacingError(knownMessage, error.code);
  }

  if (error.message?.toLowerCase().includes("invalid login credentials")) {
    return new UserFacingError("Invalid email or password.");
  }

  return new UserFacingError(error.message || "Authentication failed.", error.code);
}
