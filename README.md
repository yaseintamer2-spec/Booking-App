# Booking-App

## Match alerts and staff check-in

Apply `artifacts/lib/db/migrations/0001_match_registrations.sql` to the app database before deploying the API. Set `MATCH_STAFF_EMAILS` on the API to a comma-separated list of verified referee and staff emails; administrators already on `ADMIN_EMAILS` can also use the scanner. Staff open **Profile → Staff check-in scanner** or use the admin console link.

For push alerts, set `EXPO_PUBLIC_EAS_PROJECT_ID` for the mobile build and configure iOS APNs and Android FCM credentials in the Expo/EAS project. Build and install a development or production app (Expo Go does not support remote push notifications on Android). Players opt in from **My Matches → Enable match alerts**. The API stores Expo push tokens and sends waitlist-offer alerts through the Expo Push Service; in-app alerts remain available if push delivery is unavailable. `EXPO_ACCESS_TOKEN` can be set on the API to authenticate Expo Push Service requests.

