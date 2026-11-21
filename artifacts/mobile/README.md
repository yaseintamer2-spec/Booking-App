# KICKOFF setup notes

## Sign-in

- Players can create an account with email and password, then verify the email once. Password sign-in does not request an email code.
- Google sign-in is available after Google is enabled for this app in the Clerk Dashboard.
- Keep email as the account identifier and do not require a phone number for sign-up.
- Phone numbers and phone-based OTP are not part of the sign-in flow.
- Clerk is responsible for account identity and unique email addresses.

## Give someone administrator access

1. Have the person create their account and verify their email first.
2. Sign in as the permanent owner account (`yaseintamer2@gmail.com`) and open **Profile → Admin console**.
3. Enter the person's verified sign-in email, choose **Add admin**, and confirm. To remove access later, choose **Revoke** beside their email and confirm.

The API checks the owner or database grant on every administrator request. Only the permanent owner can grant or revoke administrator access; the owner account cannot be removed. Admin changes take effect without changing server environment variables or publishing another app build.

The owner must sign in through the same Clerk environment used by the app. Development and production Clerk applications have separate user stores, so an account created in one environment will not exist in the other.

## Pitch-owner match requests

The permanent owner grants pitch-owner access from **Profile → Admin console**, assigning the owner to a pitch name, area, and full address. A pitch owner sees **Pitch owner desk** in their profile and account menu and can submit a future date/time, contact phone, match settings, and up to three pitch photos. Every request remains private until an admin reviews it. Overlapping requests and matches are allowed; the server does not block or decide them. An admin explicitly approves and publishes a request or rejects it. Approval uses the existing match card and registration screen.

See the repository-root README for local PostgreSQL, Clerk, API, and browser-preview setup.

## Match data

Match listings are stored in the project's PostgreSQL database. Development preview data is labeled as demo data and uses unverified example venues and addresses. Replace it with confirmed venue information before sharing real matches.

New matches default to 7v7, 14 spots, a 120-minute booking, SAR 30 per player, and a crossed-out SAR 35 comparison price. Administrators can change these values when creating or editing a match.

## Payments

The app does not currently take payments, collect card details, or create paid bookings. The checkout screen is prepared for a later integration, and the API contains a provider boundary for checkout creation, webhook verification, and refunds. Connect a Saudi-compatible provider and configure its server-side credentials before enabling any payment action.

## Legal pages and refund readiness

Sign-up links to the Terms of Service and Privacy Notice and requires acceptance; sign-in flows also require current terms acceptance before opening the main tabs. Acceptance is versioned in `legal_acceptances`; apply migration `0016_legal_acceptances.sql` before deploying this API. Privacy, Terms, Cancellations & Refunds, and Community Standards appear under **Settings → Legal & Privacy**. These are app-specific review drafts and visibly contain placeholders for the registered operator, licence/CR, address, support/privacy contacts, processor locations, and data-retention schedule. Complete them and obtain Saudi legal review before public launch.

Paid bookings remain disabled. A **Request refund** action is shown only for a paid booking; the existing API intentionally rejects paid cancellations until the selected payment provider, transaction references, replacement-seat handling, and refund processing are connected. The draft refund policy is full refund at least 24 hours before kickoff; within 24 hours, the place is released and a 50% refund is due only after a replacement player successfully books and pays before kickoff. If no replacement takes the place, the draft policy provides no late refund, subject to mandatory consumer rights. Do not enable paid checkout until this whole workflow and the final policy are verified.
