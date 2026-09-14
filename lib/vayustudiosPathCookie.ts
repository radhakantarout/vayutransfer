// Remembers which VayuStudios front door a visitor picked (Moments vs
// Studio Admin) — read by middleware.ts's root-path branch. Domain-scoped
// per environment (not one shared `.vayustudios.com` cookie for everything)
// so test.vayustudios.com, a separate developer-facing preview domain,
// never shares this preference with real production traffic.
export function setVayustudiosPath(value: 'moments' | 'studio') {
  const domain = window.location.hostname.includes('test.') ? '.test.vayustudios.com' : '.vayustudios.com'
  document.cookie = `vayustudios-path=${value}; path=/; domain=${domain}; max-age=15552000; SameSite=Lax; Secure`
}
