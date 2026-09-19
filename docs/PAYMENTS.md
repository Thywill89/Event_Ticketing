# Payments (Paystack)

Checkout soft-reserves inventory, creates a `PENDING` payment, then collects money via **Paystack**. Tickets are issued only after **backend verification** (webhook or verify API) — never from browser-only success (plan §8.2).

Currency defaults to **GHS** (major units in the DB). Paystack amounts are sent in the **smallest subunit** (pesewas for GHS; kobo for NGN): `amount × 100`.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /payments/config` | `{ provider, stubAllowed, publicKey }` for the web UI |
| `POST /events/:eventId/orders` | Soft-reserve + `PENDING` payment (`provider: paystack` when keys set, else `stub`) |
| `POST /orders/:orderId/payments/initialize` | Paystack `transaction/initialize` → `authorizationUrl` / `accessCode` / `reference` |
| `POST /orders/:orderId/payments/verify` | Optional client callback: verify reference with Paystack → fulfill |
| `POST /payments/webhook` | Paystack webhooks (`x-paystack-signature` HMAC SHA512) |
| `POST /orders/:orderId/payments/stub-complete` | Local stub only (gated — see below) |

## Environment variables (`apps/api/.env`)

```env
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_PUBLIC_KEY=pk_test_...
# Optional — defaults to PAYSTACK_SECRET_KEY (Paystack signs webhooks with the secret key)
# PAYSTACK_WEBHOOK_SECRET=

# Absolute web origin for Paystack callback_url (no trailing slash)
PUBLIC_WEB_URL=http://localhost:3000

# Force stub payments even when Paystack keys are set (local only)
# ALLOW_STUB_PAYMENTS=true
```

Do **not** put the secret key in the Next.js app. The public key is returned from `GET /payments/config` when needed (e.g. Popup). Redirect checkout only needs the API `authorizationUrl`.

Root `.env.example` / `apps/api/.env.example` list the same placeholders.

## Paystack dashboard setup

1. Create / open a [Paystack](https://dashboard.paystack.com/) account (use **Test mode** first).
2. **Settings → API Keys & Webhooks** (or Developers):
   - Copy **Secret Key** → `PAYSTACK_SECRET_KEY`
   - Copy **Public Key** → `PAYSTACK_PUBLIC_KEY`
3. **Webhook URL** (must be publicly reachable HTTPS in staging/prod):

   ```text
   https://<your-api-host>/payments/webhook
   ```

   Local tip: use a tunnel (ngrok, Cloudflare Tunnel, etc.) pointed at `http://localhost:4000`, then set the webhook to `https://<tunnel>/payments/webhook`.

4. Callback URL is set **per transaction** by the API (`PUBLIC_WEB_URL/orders/<orderId>?accessToken=…&payment=paystack`). Paystack appends `reference` / `trxref` on redirect; the order page calls `POST …/payments/verify`.
5. Ensure your Paystack business supports the event currency (**GHS** by default in this project).

## Flow

1. Customer places order → inventory reserved, payment `PENDING`.
2. Web calls `POST /orders/:id/payments/initialize` → redirect to `authorizationUrl`.
3. Customer pays on Paystack.
4. **Preferred:** Paystack sends `charge.success` to `/payments/webhook` (signature verified). API re-verifies via Paystack Verify API when possible, then idempotently:
   - `Payment.status = SUCCEEDED`, `providerRef` = reference
   - reserved → sold inventory
   - issue tickets
   - enqueue order-confirmation email
5. **Also:** browser return URL triggers `POST …/payments/verify` (same fulfillment path; safe if webhook already ran).

## Stub payments (local without keys)

Stub remains for local testing when:

- `ALLOW_STUB_PAYMENTS=true`, **or**
- `NODE_ENV` is **not** `production` **and** `PAYSTACK_SECRET_KEY` is unset

In production with Paystack configured, stub is **off**. Do not set `ALLOW_STUB_PAYMENTS` in production.

## Reservation expiry cron

```http
POST /orders/expire-reservations
X-Cron-Secret: <CRON_SECRET>
```

Schedule every 5 minutes. If `CRON_SECRET` is unset, the endpoint is open (local only).
