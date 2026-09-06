// Shared between the public booking form's client-side validation
// (app/(studio-site)/.../templates/BookingForm.tsx) and the server-side
// route it posts to (app/studio/api/public/[subdomain]/book/route.ts) — the
// route is a public, unauthenticated endpoint, so the client's own checks
// can always be bypassed by posting directly; both sides must agree on the
// same rules rather than the server trusting whatever the client already
// validated.

export const MAX_NAME_LENGTH = 100
export const MAX_MESSAGE_LENGTH = 1000

export function validateEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

export function validatePhone(v: string): boolean {
  return !v || /^(\+91[\s-]?|0)?[6-9]\d{9}$/.test(v.trim())
}

// Covers Latin plus every script this product's language picker supports
// (Devanagari/Hindi, Oriya/Odia, Bengali, Tamil, Telugu — see
// lib/studio/i18n.ts's LANGUAGE_OPTIONS) since a client's real name may be
// typed in any of them — this only rejects names that are just digits/
// symbols with no actual letters, or that contain any digit at all (a real
// name never does), not names in a non-Latin script. Explicit \uXXXX block
// ranges rather than the `u`-flag \p{L} Unicode property escape, which needs
// a newer TS/JS target than this project currently compiles against.
const HAS_LETTER = /[a-zA-Zऀ-ॿঀ-৿଀-୿஀-௿ఀ-౿]/

export function validateName(v: string): boolean {
  const trimmed = v.trim()
  return trimmed.length >= 2 && !/\d/.test(trimmed) && HAS_LETTER.test(trimmed)
}
