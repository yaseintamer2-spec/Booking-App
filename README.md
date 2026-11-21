# Booking-App

## Run locally

The app runs without Replit. It uses a local PostgreSQL database for matches and bookings and Clerk for sign-in.

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

To open the app on a phone on the same network, set `EXPO_PUBLIC_API_URL` in the mobile `.env` to `http://<your-computer-LAN-IP>:5000`.

## Inspect local data

Connect pgAdmin, DBeaver, or a PostgreSQL extension in VS Code to `localhost:5432` and the `kickoff` database, using the same username and password from `DATABASE_URL`.

## Match alerts and staff check-in

Apply the database migrations in order before deploying the API, including `0011_owner_managed_admins.sql`, `0012_pitch_owner_submissions.sql`, `0013_referee_assignment_acceptance.sql`, and `0014_referee_applications_and_final_confirmation.sql` and `0015_player_preferred_position.sql`. The verified `yaseintamer2@gmail.com` account is the single permanent owner. Approved referees can apply to open matches from **Profile → Live match controls**; admins review applications there, contact candidates themselves, and send an invitation. Admins can also assign a referee directly from the match editor. A referee must confirm availability, then an admin must finalize the assignment in **Referee assignments** before live controls unlock. The referee receives in-app and push reminders about 24 hours and one hour before confirmed matches. Only a finalized, currently approved referee or an admin can use a match's live controls or check-in scanner. Existing referee assignments are preserved as accepted by migration `0013`. The `MATCH_STAFF_EMAILS` setting remains supported as an optional legacy allowlist. Pitch owners can submit timed matches for their assigned pitch with a contact phone and up to three photos. The requests remain private until an admin approves them; approval publishes them into the existing Discover and registration experience. Confirmed registrations store their selected pitch spot (0–13) and booking owner; selecting a spot in the UI does not reserve it, and paid matches remain unavailable until a payment provider is configured. Free bookings can include existing KICKOFF accounts by verified email, with a separate ticket and check-in QR for each attendee; the booker and attendee can reopen a ticket in **My Matches**. A notification bell shows match announcements, invitations, and booking updates. Players choose a preferred striker, defender, midfielder, or winger position after sign-in. It appears as a small badge on their profile photo and does not affect match registration or team balancing. Profile-photo changes sync to active match lineups when the player returns to the match screen. Admins can set the venue, neighborhood, street address, Riyadh date/time, and up to three gallery photos when creating or editing a match. Photos are compressed on the device and stored in the match row as image data; a dedicated object-storage/CDN provider is not configured yet. Match cards swipe between photos and auto-advance every five seconds. The check-in QR is available before the match and expires at `startsAt + durationMinutes`; scanners also check the current match end time so an admin schedule change cannot extend an old QR beyond the new end.

For push alerts, set `EXPO_PUBLIC_EAS_PROJECT_ID` for the mobile build and configure iOS APNs and Android FCM credentials in the Expo/EAS project. Build and install a development or production app (Expo Go does not support remote push notifications on Android). Players opt in from **My Matches → Enable match alerts**. The API stores Expo push tokens and sends waitlist-offer alerts through the Expo Push Service; in-app alerts remain available if push delivery is unavailable. `EXPO_ACCESS_TOKEN` can be set on the API to authenticate Expo Push Service requests.

On first launch, the app requires foreground location permission and a location fix before it routes players to sign-in. Push notifications remain optional. The current location coordinates are kept on the device; this version does not send them to the API.
