# Campnect Client Security Model & Data Privacy

## Overview
Campnect is engineered around a zero-trust student network architecture designed to safeguard user identity, academic records, and peer interactions.

## 1. Authentication & Session Hygiene
- **Bearer Tokens**: Stored securely in memory and refreshed using httpOnly secure cookies where available.
- **Biometric Integration**: Capacitor Biometric Auth integration allows instant fingerprint/FaceID unlocks on Android devices without transmitting raw credentials.
- **Auto-Lock Timeout**: Inactive sessions auto-lock after 15 minutes of inactivity in high-security campus shared kiosks.

## 2. Content Security Policy (CSP)
Campnect enforces a strict CSP headers configuration:
- `default-src 'self'`
- `connect-src 'self' https://api.campnect.app wss://api.campnect.app`
- `img-src 'self' data: blob: https://images.unsplash.com`
- `object-src 'none'`

## 3. Data Sanitization & Input Defense
- Every post, comment, and event description passes through strict client-side escaping (`sanitizeUserInput`) prior to rendering.
- Markdown links are restricted to verified academic domain patterns (`.ac.in`, `.edu.in`, `.edu`).
