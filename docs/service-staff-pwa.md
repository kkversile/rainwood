# Service staff PWA notes

The Staff PWA registers `public/sw.js` and deliberately keeps authenticated API
traffic network-only. The worker caches only safe static assets and never
intercepts non-GET requests, so offline mode cannot replay financial writes.

The repository currently has no owned square RainWood icon asset or image-build
tooling for production PWA icons. The manifest therefore uses the existing
owned SVG as a fallback and does not claim a fabricated maskable icon. Supply
approved 192x192 and 512x512 brand assets before enabling those icon entries.

Staff stay eligibility is temporarily limited to `CONFIRMED` and `MODIFIED`
reservations whose check-in/check-out dates contain the operational date. This
is a conservative reservation-status rule, not proof of physical check-in.
The eventual PMS lifecycle should expose `EXPECTED`, `CHECKED_IN`, and
`CHECKED_OUT`; staff charge posting should ultimately require `CHECKED_IN`.
