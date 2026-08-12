// Shared Raw Transfer expiry constants — a route.ts file is a server module,
// so importing it directly from a client component isn't a pattern used
// elsewhere in this codebase; this small shared file is the home for the
// numbers both the API routes and the Extend popover need.

export const DEFAULT_TRANSFER_EXPIRY_DAYS = 7

export function transferLinkExpirySeconds(): number {
  return parseInt(process.env.TRANSFER_LINK_EXPIRY_SECONDS ?? String(DEFAULT_TRANSFER_EXPIRY_DAYS * 86400), 10)
}

// Product-policy ceiling, not a physical storage constraint — unlike
// VayuTransfer's R2 bucket, Raw Transfer objects are deleted by the daily
// cron sweep (app/studio/api/cron/storage-check), not a bucket lifecycle
// rule, so this number is free to pick and change later without risk of a
// link outliving its own file.
export const MAX_TRANSFER_EXPIRY_DAYS = 20

export const TRANSFER_EXTEND_DAY_OPTIONS = [3, 7, 15] as const

// RECEIVE-direction on-demand progress checks (admin side, querying R2's own
// ListParts for a still-in-progress anonymous upload) — rate-limited so a
// large multipart upload with thousands of parts can't be hammered by
// repeated manual "check progress" clicks.
export const RECEIVE_PROGRESS_CHECK_COOLDOWN_MS = 10 * 60 * 1000
// Pads the raw average-speed ETA — network speed on the uploader's end is
// inherently variable, so the displayed estimate leans conservative rather
// than promising an arrival time it then blows past.
export const RECEIVE_PROGRESS_ETA_BUFFER_MULTIPLIER = 1.15
