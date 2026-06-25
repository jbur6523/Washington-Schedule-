# PWA App Experience

Washington-Schedule is still a Next.js web app. It is not a native iOS or Android app.

This phase adds Progressive Web App support so the app can feel more like a phone app when installed from the browser.

## App Metadata

The app includes:

- Web app manifest at `/manifest.webmanifest`
- App name: WHHS RT Schedule
- Short name: Schedule
- Standalone display mode
- Mobile theme color
- Background color
- App icon
- iOS-friendly metadata

## iPhone Install Steps

1. Open the app in Safari.
2. Tap Share.
3. Tap Add to Home Screen.

On iPhone, install the app to the Home Screen before enabling notifications.

## Android Install Notes

Supported Android browsers may show an install prompt. If not, open the browser menu and choose the install or Add to Home Screen option.

## Service Worker

The service worker is served from `/sw.js`.

It supports:

- Conservative app shell caching
- Push notification display
- Notification click handling

It does not aggressively cache private data.

Protected app data should always be fetched fresh from Supabase, including:

- Schedule data
- Staff Directory data
- Phone numbers
- Shift requests
- Coverage offers

## Out Of Scope

This phase does not include:

- Native iOS app
- Native Android app
- App Store deployment
- Push notification analytics
- Offline schedule editing
- OCR
- Schedule photo import
- Payroll integration
- EMR integration
- Patient information
- Clinical notes
- Billing
- Workday integration
