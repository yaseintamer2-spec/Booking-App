# KICKOFF setup notes

## Sign-in

- Players can create an account with email and password, then verify the email once. Password sign-in does not request an email code.
- Google sign-in is available after Google is enabled for this app in the Clerk Dashboard.
- Keep email as the account identifier and do not require a phone number for sign-up.
- Phone numbers and phone-based OTP are not part of the sign-in flow.
- Clerk is responsible for account identity and unique email addresses.

## Give someone administrator access

1. Have the person create their account and verify their email first.
2. Add `ADMIN_EMAILS` to the repository-root `.env` file. Use the exact verified email; separate multiple emails with commas.
3. Restart the API server and have the person sign in again.

The API checks this allowlist on every administrator request. A user cannot grant themselves administrator access from the app. Keep the allowlist on the server and never put it in the mobile app.

Clerk development and production applications use separate user stores. Create accounts in the appropriate Clerk application and configure the matching `ADMIN_EMAILS` value in the API environment.

See the repository-root README for local PostgreSQL, Clerk, API, and browser-preview setup.

## Match data

Match listings are stored in the project's PostgreSQL database. Development preview data is labeled as demo data and uses unverified example venues and addresses. Replace it with confirmed venue information before sharing real matches.

New matches default to 7v7, 14 spots, a 120-minute booking, SAR 30 per player, and a crossed-out SAR 35 comparison price. Administrators can change these values when creating or editing a match.

## Payments

The app does not currently take payments, collect card details, or create paid bookings. The checkout screen is prepared for a later integration, and the API contains a provider boundary for checkout creation, webhook verification, and refunds. Connect a Saudi-compatible provider and configure its server-side credentials before enabling any payment action.
