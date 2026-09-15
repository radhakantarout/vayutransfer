// Deliberately a no-op — this exists only because some browsers gate PWA
// install-eligibility on an active service worker registration. It does not
// cache anything, so it can't make gallery content stale or interfere with
// the app's own polling. Registered with scope '/studio/moments/' only
// (see components/studio/moments/InstallPrompt.tsx) — never intercepts
// requests anywhere else in the app.
self.addEventListener('fetch', () => {})
