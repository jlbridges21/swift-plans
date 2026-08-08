/**
 * Map Supabase Auth errors to plain-language messages.
 * Never surface raw codes like invalid_grant to the user.
 */

export function mapAuthError(error: {
  message: string;
  code?: string;
  status?: number;
}): string {
  const message = error.message.toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid_grant")
  ) {
    return "That email or password is incorrect.";
  }

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "Please confirm your email before signing in. Check your inbox for the link.";
  }

  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("user already registered")
  ) {
    // Do not reveal whether the email is registered.
    return "If an account can be created with that email, you’ll get a confirmation message shortly.";
  }

  if (
    code === "weak_password" ||
    message.includes("password should be") ||
    message.includes("password is known")
  ) {
    return "Choose a stronger password (at least 8 characters).";
  }

  if (
    code === "over_request_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (
    message.includes("expired") ||
    message.includes("otp") ||
    code === "otp_expired"
  ) {
    return "This reset link has expired or is no longer valid.";
  }

  if (message.includes("same password")) {
    return "Your new password must be different from your current password.";
  }

  return "Something went wrong. Please try again.";
}

/** Generic success copy for email-based flows that must not leak account existence. */
export const GENERIC_EMAIL_SENT =
  "If an account exists for that email, you’ll receive a message shortly.";
