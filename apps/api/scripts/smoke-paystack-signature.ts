/**
 * Smoke-check Paystack webhook HMAC without live keys.
 * Run: npx tsx scripts/smoke-paystack-signature.ts
 */
import { createHmac } from "node:crypto";
import { verifyPaystackSignature, toPaystackAmount } from "../src/lib/paystack";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const secret = "sk_test_smoke_secret";
const payload = Buffer.from(
  JSON.stringify({
    event: "charge.success",
    data: { reference: "ord_test_ref", amount: 5000, currency: "GHS" },
  }),
  "utf8",
);

const goodSig = createHmac("sha512", secret).update(payload).digest("hex");
assert(
  verifyPaystackSignature(payload, goodSig, secret) === true,
  "valid signature should pass",
);
assert(
  verifyPaystackSignature(payload, "deadbeef", secret) === false,
  "invalid signature should fail",
);
assert(
  verifyPaystackSignature(payload, undefined, secret) === false,
  "missing signature should fail",
);

assert(toPaystackAmount("50.00") === 5000, "GHS 50.00 → 5000 pesewas");
assert(toPaystackAmount(12.34) === 1234, "12.34 → 1234");
assert(toPaystackAmount("0.01") === 1, "0.01 → 1");

console.log("smoke-paystack-signature: ok");
