/**
 * Auth env: short-lived access JWTs + rotatable httpOnly refresh cookies.
 *
 * Preferred vars:
 *   JWT_ACCESS_SECRET, JWT_REFRESH_PEPPER, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL
 * Legacy fallbacks:
 *   JWT_SECRET, JWT_EXPIRES_IN
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function optionalBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

/** Parse "15m" | "7d" | "3600s" | "12h" into milliseconds. */
export function parseTtlToMs(ttl: string, label: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/i.exec(ttl.trim());
  if (!m?.[1] || !m[2]) {
    throw new Error(`Invalid ${label}: "${ttl}" (use e.g. 15m, 7d)`);
  }
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1000
        : unit === "m"
          ? 60_000
          : unit === "h"
            ? 3_600_000
            : 86_400_000;
  return n * mult;
}

function resolveAccessSecret(): string {
  const access = process.env.JWT_ACCESS_SECRET?.trim();
  if (access) return access;
  return required("JWT_SECRET");
}

function resolveRefreshPepper(): string {
  const pepper = process.env.JWT_REFRESH_PEPPER?.trim();
  if (pepper) return pepper;
  // Dev fallback: derive from access secret so older .env still boots.
  // Production should set JWT_REFRESH_PEPPER explicitly.
  return `refresh:${resolveAccessSecret()}`;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  /** Web origin(s) allowed for credentialed CORS (comma-separated). */
  webOrigins: () => {
    const raw =
      process.env.WEB_ORIGIN?.trim() ||
      process.env.PUBLIC_WEB_URL?.trim() ||
      "http://localhost:3000";
    return raw
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
  },
  jwtAccessSecret: () => resolveAccessSecret(),
  jwtRefreshPepper: () => resolveRefreshPepper(),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL?.trim() || "15m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL?.trim() || "7d",
  cookieSecure: optionalBool(
    "COOKIE_SECURE",
    process.env.NODE_ENV === "production",
  ),
  bcryptCost: Number(process.env.BCRYPT_COST ?? 12),
  /** Soft-reserve window before unpaid inventory is released (plan §7.4). */
  orderReservationMinutes: optionalPositiveInt("ORDER_RESERVATION_MINUTES", 15),
  /**
   * When true, new organizers are created as APPROVED (local/dev convenience).
   * Production should leave false and use admin approval (plan §11.2).
   */
  organizerAutoApprove: optionalBool("ORGANIZER_AUTO_APPROVE", false),
  /**
   * Shared secret for cron-style ops (expire reservations).
   * When set, POST /orders/expire-reservations requires header X-Cron-Secret.
   */
  cronSecret: process.env.CRON_SECRET?.trim() || "",
  /** console (default) | smtp (stub until provider wired) */
  emailTransport: (process.env.EMAIL_TRANSPORT?.trim().toLowerCase() ||
    "console") as "console" | "smtp",
  emailFrom: process.env.EMAIL_FROM?.trim() || "",
  emailSmtpHost: process.env.EMAIL_SMTP_HOST?.trim() || "",
  emailSmtpPort: optionalPositiveInt("EMAIL_SMTP_PORT", 587),
  emailSmtpUser: process.env.EMAIL_SMTP_USER?.trim() || "",
  emailSmtpPass: process.env.EMAIL_SMTP_PASS?.trim() || "",
  /**
   * Public web origin used in notification links (no trailing slash).
   * Falls back to relative paths when unset.
   */
  publicWebUrl: process.env.PUBLIC_WEB_URL?.trim().replace(/\/$/, "") || "",
  /** Paystack secret key (sk_test_… / sk_live_…). Required for live payments. */
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY?.trim() || "",
  /** Paystack public key (pk_test_… / pk_live_…) — safe to expose to the browser. */
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY?.trim() || "",
  /**
   * Optional dedicated webhook HMAC secret. Paystack signs with the secret key;
   * leave unset to use PAYSTACK_SECRET_KEY (recommended per Paystack docs).
   */
  paystackWebhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET?.trim() || "",
  /**
   * Force-enable stub payment endpoint even when Paystack is configured.
   * Never enable in production unless deliberately testing.
   */
  allowStubPayments: optionalBool("ALLOW_STUB_PAYMENTS", false),
};

/** True when Paystack secret key is present. */
export function isPaystackConfigured(): boolean {
  return Boolean(env.paystackSecretKey);
}

/**
 * Stub payment is allowed when:
 * - ALLOW_STUB_PAYMENTS=true, or
 * - non-production AND Paystack is not configured (local testing without keys).
 */
export function isStubPaymentsAllowed(): boolean {
  if (env.allowStubPayments) return true;
  if (process.env.NODE_ENV === "production") return false;
  return !isPaystackConfigured();
}
