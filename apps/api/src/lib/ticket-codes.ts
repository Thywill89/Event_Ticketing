import { randomBytes, randomInt } from "node:crypto";

const TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-readable backup lookup (plan §9.5), e.g. EVT-8F4K7P */
export function generateTicketNumber(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += TICKET_ALPHABET[randomInt(TICKET_ALPHABET.length)]!;
  }
  return `EVT-${code}`;
}

/** Secure QR verification token — separate from ticketNumber (plan §9.6). */
export function generateQrToken(): string {
  return randomBytes(32).toString("hex");
}

/** Opaque guest order access token (confirmation URL / stub payment). */
export function generateOrderAccessToken(): string {
  return randomBytes(24).toString("base64url");
}
