# OTP Service

Production-ready multi-channel OTP (One Time Password) service for email and SMS delivery with operational ergonomics, mock tooling, and consistent error semantics.

## Contents

1. [Quick Start](#quick-start)
2. [Delivery Modes](#delivery-modes)
3. [Environment Variables](#environment-variables)
4. [Public API](#public-api)
5. [Admin API](#admin-api)
6. [Error Responses](#error-responses)
7. [Rate Limits](#rate-limits)
8. [Local DX Notes](#local-dx-notes)
9. [Optional Appendix](#optional-appendix)

## Quick Start

Clone the repo and bootstrap a full stack (app + Redis + Postgres + mock delivery) in minutes.

```bash
cp .env.example .env
npm install
npm run dev            # docker-compose up --build app+redis+postgres
npm run seed           # populate Redis/Postgres with masked demo OTPs
```

The API is then available at `http://localhost:3000` and Redis/Postgres are exposed on their default ports for inspection.

Shut everything down with:

```bash
npm run dev:down
```

## Delivery Modes

| Mode                | Env                      | Description                                                                                                  |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `mock` (default)    | `DELIVERY_MODE=mock`     | Providers are not called. OTPs are logged via `logMockDelivery` with masked identifiers for quick debugging. |
| `real`              | `DELIVERY_MODE=real`     | Imports the configured SendGrid/SES/Twilio/SNS clients and performs actual delivery.                         |

**Safety tips**

- Keep `mock` for local/dev unless you have verified provider credentials.  
- Mock logs include masked OTPs (`***123`) so developers can validate flows without reading raw codes.  
- Toggle channels individually via `EMAIL_ENABLED` / `SMS_ENABLED` in `.env`.

## Environment Variables

See `.env.example` for the full list. Key variables are summarized below.

### Required

| Variable           | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `OTP_SECRET`       | HMAC key for hashing OTPs & identifiers         |
| `JWT_SECRET`       | Signing secret for verification tokens          |
| `ADMIN_API_KEY`    | Shared secret for admin lookup endpoint         |

### Core Options

| Variable                 | Default      | Notes                                                       |
| ------------------------ | ------------ | ----------------------------------------------------------- |
| `DELIVERY_MODE`          | `mock`       | Switch to `real` to call providers                          |
| `EMAIL_ENABLED`          | `true`       | Disable to block email channel                              |
| `SMS_ENABLED`            | `true`       | Disable to block SMS channel                                |
| `OTP_TTL_SECONDS`        | `300`        | TTL for OTPs in Redis                                       |
| `OTP_MAX_ATTEMPTS`       | `3`          | Lock identifier after N failed verifications                |
| `GLOBAL_RATE_LIMIT_MAX`  | `1000`       | Requests/minute across API                                  |
| `EMAIL_RATE_LIMIT_MAX`   | `5`          | OTP generation per identifier/hour (email)                  |
| `SMS_RATE_LIMIT_MAX`     | `3`          | OTP generation per identifier/hour (sms)                    |
| `IP_RATE_LIMIT_MAX`      | `100`        | Requests/hour per IP                                        |
| `ADMIN_IP_ALLOWLIST`     | _(empty)_    | Comma-separated list of IPs allowed to use admin endpoints  |

### Provider Credentials (when `DELIVERY_MODE=real`)

- Email: `EMAIL_PROVIDER=sendgrid|ses`, plus corresponding API keys or AWS credentials.  
- SMS: `SMS_PROVIDER=twilio|sns`, plus authentication tokens.  

## Public API

Base URL: `http://localhost:3000/api/otp`

### Generate OTP — `POST /generate`

Request body:

```json
{
  "identifier": "alice@example.com",
  "channel": "email",
  "purpose": "login",
  "fallback_identifier": "+923001112223"   // optional fallback
}
```

Response (success):

```json
{
  "request_id": "4f4f24f0-d6aa-4c6f-9027-0135ef08f28b",
  "status": "sent",
  "channel": "email",
  "fallback_used": false,
  "expires_in": 300
}
```

### Verify OTP — `POST /verify`

```json
{
  "identifier": "alice@example.com",
  "channel": "email",
  "purpose": "login",
  "otp": "123456"
}
```

Response (success):

```json
{
  "verified": true,
  "token": "<JWT token>"
}
```

### Health Check — `GET /health`

Returns uptime and timestamp for load balancers and probes.

```bash
curl http://localhost:3000/api/health
```

## Admin API

Base URL: `http://localhost:3000/internal/otp`

### Authentication

- `x-api-key` header must match `ADMIN_API_KEY`.  
- Optional IP allow-list (`ADMIN_IP_ALLOWLIST`) enforces origin hygiene.  
- Admin routes carry their own Redis-backed rate limiter.

### Lookup OTP Request — `GET /lookup?request_id=<uuid>`

Headers:

```
x-api-key: local-admin-key
```

Response (success):

```json
{
  "request_id": "4f4f24f0-d6aa-4c6f-9027-0135ef08f28b",
  "identifier": "a***@example.com",
  "channel": "email",
  "status": "sent",
  "attempts": 0,
  "max_attempts": 3,
  "delivery_attempts": 1,
  "purpose": "login",
  "provider": {
    "message_id": "mock-email-1700000000000",
    "name": "mock"
  },
  "created_at": "2024-01-01T12:00:00.000Z",
  "updated_at": "2024-01-01T12:00:05.000Z",
  "verified_at": null
}
```

All personally identifiable fields are masked (`maskIdentifier`) and OTPs are never returned.

## Error Responses

All unsuccessful responses follow the contract below:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  },
  "request_id": "a9f5c6c4-9fb0-4f96-b513-4d51d8d1e9fd",
  "details": [
    {
      "message": "Validation error detail",
      "path": "identifier",
      "type": "string.email"
    }
  ]
}
```

- `error.code` is immutable and safe for client branching.  
- `request_id` matches the `x-request-id` response header for tracing.  
- `details` is optional and only present for validation failures.

| Error Code                  | HTTP Status | Description                                      |
| --------------------------- | ----------- | ------------------------------------------------ |
| `INVALID_REQUEST`           | 400         | Malformed payload or unsupported channel         |
| `VALIDATION_ERROR`          | 400         | Joi schema validation failed                     |
| `OTP_EXPIRED`               | 400         | OTP no longer present or never issued            |
| `OTP_ATTEMPTS_EXCEEDED`     | 423         | OTP locked after too many failed attempts        |
| `RATE_LIMITED`              | 429         | Global/channel/admin limiter triggered           |
| `DELIVERY_FAILED`           | 502         | Delivery provider failure without fallback       |
| `CHANNEL_DISABLED`          | 503         | Requested channel currently disabled             |
| `UNAUTHORIZED`              | 401         | Missing or invalid admin credentials             |
| `FORBIDDEN`                 | 403         | Request blocked by IP allowlist                  |
| `NOT_FOUND`                 | 404         | Resource or OTP request not found                |
| `INTERNAL_ERROR`            | 500         | Unhandled exception                               |

Client guidance:

- Show `error.message` to end users when safe, otherwise map codes to localized copy.  
- Retry on `RATE_LIMITED` after backoff; do not retry on other non-4xx errors unless instructed.

## Rate Limits

Rate limiting is enforced via Redis-backed stores.

| Limiter                 | Scope              | Default (configurable) |
| ----------------------- | ------------------ | ---------------------- |
| Global API              | All routes         | 1000 req/min           |
| Email identifier        | `/generate` email  | 5 req/hour             |
| SMS identifier          | `/generate` sms    | 3 req/hour             |
| Request IP              | `/generate` all    | 100 req/hour           |
| Admin lookup            | `/internal/otp/*`  | 20 req/min (via env)   |

Limit breaches yield `RATE_LIMITED` errors with a human-friendly message.

## Local DX Notes

- **Hot reload**: the `app` container mounts the repo and runs `nodemon`, so changes reload automatically.  
- **Node modules**: a docker volume keeps container installs separate from host `node_modules`.  
- **Reset data**: `npm run dev:down && docker volume rm otp_service_postgres` drops state; alternatively flush Redis manually via `redis-cli FLUSHALL`.  
- **Seed refresh**: rerun `npm run seed` after resets; seed output masks identifiers and OTPs for safe sharing.  
- **Troubleshooting**: check container logs with `docker-compose logs -f app|redis|postgres` or use the structured logs with `request_id` correlation.

## Optional Appendix

- A future sequence diagram can capture: Generate request → Redis persist → delivery → Postgres log → Verify.  
- Suggested next steps (Phase 2): add smoke tests (generate/verify/admin lookup) and wire them into CI alongside ESLint.
