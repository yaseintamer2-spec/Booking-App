# Booking-App

KICKOFF is an Expo mobile/web app with a separate Express API. The API stores match and booking data in PostgreSQL; this project uses Supabase PostgreSQL for hosted data and Clerk for sign-in.

## Deploy on Render

This repository includes `render.yaml` for a Render Static Site (Expo web app) and a Render Web Service (API). Connect the GitHub repository in Render and create a Blueprint from the repository root. Render will ask for the secret environment values declared with `sync: false`.

Set these values for the API service:

- `DATABASE_URL`: the Supabase PostgreSQL connection URI. Use the Supabase Session Pooler URI if the direct connection cannot be reached from the host.
- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: matching keys from the same Clerk instance.

Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` for the static app to the same Clerk publishable key. The Blueprint obtains the public API URL from the API service and embeds it in the web build.

For a production release, the API should run on an always-on plan. Free web services can sleep after 15 minutes without requests, which can delay the first request after sleep. Keep database and Clerk secrets in the hosting dashboard, never in Git or the static app bundle.

Optional features require additional configuration:

- Pitch photo uploads need the `OBJECT_STORAGE_*` API variables for an S3-compatible bucket such as Cloudflare R2.
- Remote push notifications need the Expo/EAS project ID and Android/iOS push credentials.

## Run locally

The API server uses PostgreSQL for matches and bookings and Clerk for sign-in. It can connect to Supabase PostgreSQL through its server-only `DATABASE_URL`.

### Prerequisites

- Node.js 24 and Corepack
- PostgreSQL
- A Clerk development application

### Setup

1. Install dependencies from the repository root:

   ```powershell
   corepack pnpm install
   ```

2. Create a PostgreSQL database named `kickoff` with pgAdmin or `psql`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`. The verified `yaseintamer2@gmail.com` account is the permanent owner; it can grant and revoke other admins from **Profile → Admin console** after sign-in.
4. Copy `artifacts/mobile/.env.example` to `artifacts/mobile/.env`. Use the same Clerk publishable key and keep `EXPO_PUBLIC_API_URL=http://localhost:5000`.
5. Apply the database schema:

   ```powershell
   corepack pnpm --filter @workspace/db run push
   ```

6. In one terminal, start the API:

   ```powershell
   corepack pnpm --filter @workspace/api-server run dev
   ```

7. In another terminal, start the web app:

   ```powershell
   corepack pnpm --filter @workspace/mobile run web
   ```

8. Open `http://localhost:8081`. The API health check is at `http://localhost:5000/api/healthz`.

Create a development application in the Clerk Dashboard and use its test keys locally. The Clerk application handles account identity; PostgreSQL holds match and booking data. Keep `.env` files private and never commit real keys.

For production, the mobile app calls the custom `/api/...` routes on the hosted API server; the Supabase project URL is not a substitute for the API server URL. Keep the database connection string and Clerk secret key on the API server only.

To open the app on a phone on the same network, set `EXPO_PUBLIC_API_URL` in the mobile `.env` to `http://<your-computer-LAN-IP>:5000`.

## Inspect local data

Connect pgAdmin, DBeaver, or a PostgreSQL extension in VS Code to `localhost:5432` and the `kickoff` database, using the same username and password from `DATABASE_URL`.

## Match alerts and staff check-in

Apply database migrations `0001` through `0022` in order before deploying the API. Migration `0021` marks every existing match and pitch request as including a referee; new requests are always submitted with a referee included. Migration `0022` adds the private pitch-rental cost to owner submissions; older submissions keep a null rental cost. Pitch owners submit an exact Riyadh date/time for a fixed two-hour match, a Google Maps link, their rental cost, a contact phone, and up to three photos. The player ticket price is entered by an admin when approving the request. Rental costs stay in the private owner/admin submission data and are never published to players. Requests remain private until an admin approves them; approval publishes them into the existing Discover and registration experience. The verified `yaseintamer2@gmail.com` account is the single permanent owner. Approved referees can apply to open matches from **Profile → Live match controls**; admins review applications there, contact candidates themselves, and send an invitation. Admins can also assign a referee directly from the match editor. A referee must confirm availability, then an admin must finalize the assignment in **Referee assignments** before live controls unlock. The referee receives in-app and push reminders about 24 hours and one hour before confirmed matches. Only a finalized, currently approved referee or an admin can use a match's live controls or check-in scanner. Existing referee assignments are preserved as accepted by migration `0013`. The `MATCH_STAFF_EMAILS` setting remains supported as an optional legacy allowlist. Confirmed registrations store their selected pitch spot (0–13) and booking owner; selecting a spot in the UI does not reserve it, and paid matches remain unavailable until a payment provider is configured. Free bookings can include existing KICKOFF accounts by verified email, with a separate ticket and check-in QR for each attendee; the booker and attendee can reopen a ticket in **My Matches**. A notification bell shows match announcements, invitations, and booking updates. Players choose a preferred striker, defender, midfielder, or winger position after sign-in. It appears as a small badge on their profile photo and does not affect match registration or team balancing. Profile-photo changes sync to active match lineups when the player returns to the match screen. Admins can set the venue, neighborhood, street address, Riyadh date/time, and up to three gallery photos when creating or editing a match. Pitch photos upload to an S3-compatible image bucket; the database stores only HTTPS image addresses. The API supports Cloudflare R2 configuration with `OBJECT_STORAGE_*` variables shown in `.env.example`. After configuring the bucket, use **Profile → Admin console → Move existing photos** once to migrate older Base64 photos out of the database. Match cards swipe between photos and auto-advance every five seconds. The check-in QR is available before the match and expires at `startsAt + durationMinutes`; scanners also check the current match end time so an admin schedule change cannot extend an old QR beyond the new end.

For push alerts, set `EXPO_PUBLIC_EAS_PROJECT_ID` for the mobile build and configure iOS APNs and Android FCM credentials in the Expo/EAS project. Build and install a development or production app (Expo Go does not support remote push notifications on Android). Players opt in from **My Matches → Enable match alerts**. The API stores Expo push tokens and sends waitlist-offer alerts through the Expo Push Service; in-app alerts remain available if push delivery is unavailable. `EXPO_ACCESS_TOKEN` can be set on the API to authenticate Expo Push Service requests.

### Pitch photo storage

Create a Cloudflare R2 bucket for pitch photos, create an S3 API token with read/write access to that bucket, and attach a public custom domain to the bucket. Add the endpoint, bucket, access key, secret key, region (`auto` for R2), and public domain to the API environment using the `OBJECT_STORAGE_*` names in `.env.example`, then restart the API. Keep these credentials only on the API server. The mobile app sends selected photos to the authenticated API, which stores the file in R2 and returns the public HTTPS address; match and pitch-request database rows keep only those addresses. Browser-to-bucket CORS settings are not needed because uploads pass through the API. Once configured, the owner can use **Profile → Admin console → Move existing photos** to move legacy Base64 photos out of the database. The migration can be retried safely if it stops partway through.

On first launch, the app requires foreground location permission and a location fix before it routes players to sign-in. Push notifications remain optional. The current location coordinates are kept on the device; this version does not send them to the API.
