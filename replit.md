# KICKOFF

KICKOFF is a mobile-first Riyadh football community for discovering organized 7v7 matches, with verified email/Google sign-in and administrator-managed match listings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mobile` — Expo player app, sign-in, match discovery, checkout preparation, and admin match screens
- `artifacts/api-server` — Express API, Clerk middleware, match endpoints, and server-side admin checks
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/index.ts` — PostgreSQL match schema
- `lib/api-client-react/src/generated` and `lib/api-zod/src/generated` — generated from the OpenAPI contract

## Architecture decisions

- Clerk owns account identity and enforces one account per email; email/password signup verifies the email, and phone login is not used.
- Administrator access is checked by the API against the verified-email `ADMIN_EMAILS` allowlist; client-side visibility is not authorization.
- Match prices are stored in halalas; the default player price is 3,000 halalas with a 3,500-halalas comparison price.
- The payment-provider boundary is defined, but no gateway is connected and the app must not claim a payment succeeded.

## Product

Players can discover Riyadh 7v7 matches and view availability, venue, timing, services, and discounted pricing. Allowlisted administrators can create, edit, publish, cancel, and remove match listings.

## User preferences

- Do not add phone-number authentication or phone OTP.
- Keep the checkout flow ready for a future payment provider, but do not collect card details or simulate charges until a real provider is configured.
- Prioritize a distinctive, high-quality mobile UI.

## Gotchas

- After changing the OpenAPI contract, regenerate client and Zod types with `pnpm --filter @workspace/api-spec run codegen`.
- Set `ADMIN_EMAILS` on the server, not in mobile code; only already-verified Clerk emails can use admin endpoints.
- Development and production Clerk accounts are separate. Configure and verify admins in each environment.
- Development sample matches are explicitly marked as demos; replace them with verified venue information before launch.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
