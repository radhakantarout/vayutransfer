# VayuStudios Moments — Design Document

(Working title "Individual User Galleries" throughout this doc's internal reasoning — **VayuStudios Moments** is the resolved, real user-facing product name as of §8 decision 5.)

Status: **design only, nothing built yet**. Grounded in direct research of the current codebase (2026-09-11), not assumption. All 5 open decisions in §8 are now resolved — nothing left blocking Phase 0.

---

## 1. Executive Summary

Today VayuStudios is B2B-only: a professional photography studio signs up, manages client events, and shares galleries with one client at a time. **VayuStudios Moments** adds a second, consumer-facing product line: **anyone** can sign up, create a personal event gallery in seconds, invite people to join, and let an approved group view/comment/like/download photos and videos together — a "shared album for real life," not a professional deliverable.

The core finding from research: **the storage/media/billing/sharing substrate is almost entirely reusable as-is.** The part that's genuinely new is the "community" layer — membership, approval, per-gallery roles, likes, comment threads, and video preview generation. That's a small, well-scoped set of additions, not a rewrite.

## 2. What's Reused vs. What's New

**Reused with zero or near-zero backend changes:**
- `Studio` as the account record. Nothing in the type distinguishes "professional studio" from "individual" — every `Studio` row is schema-identical. An individual user is simply a `Studio` on `billingPlanId: 'free'`, with all existing billing/quota/storage-grant logic (`lib/studio/quota.ts`, `constants/studioPricing.ts`) working unmodified.
- `StudioProject` as the "event." The creation route (`app/studio/api/admin/projects/route.ts:44`) already only requires `clientName` — `eventDate`/`eventType`/`clientEmail` are not enforced. A bare event name already satisfies creation today; "quick create with just a name" needs no new validation relaxation.
- `MediaFile` + the full R2 multipart upload/download flow, storage quota enforcement, audit logging — reusable unchanged for photo uploads.
- Existing share-link primitives (`clientShareToken`, `clientShareExpiresAt`, `sharePasswordProtected`) already model "a link that grants access" — the right shape to build an invite link on top of.
- `studioQueryByPK` (real DynamoDB Query on a partition key) is the established, scale-safe pattern for "many records under one project" (`MediaFile`, `Selection` both use it). Every new per-project list this design adds follows the same pattern — `studioScanTable` (full table scan) is never used for anything that could grow large, and none of this design's new tables should use it either.
- The AI Reel Generator, built earlier this session, works unmodified — an individual gallery can offer "Reel it" the same way Client Gallery does, gated by a new per-gallery permission (§5).
- The gamified CSS animation primitives already added to `tailwind.config.js` for Reels (`reel-float`, `reel-shimmer`, `reel-pop-in`, `reel-glow`) — directly reusable for the new sign-in cards and landing page, no new animation work needed.
- The Studio+StudioUser(ADMIN) creation logic in `google-onboard/route.ts:68-112` is the reusable core for individual signup — same two records, different framing.

**Genuinely new — this is the actual product:**
1. A **project-scoped membership table** — nothing today models more than one person per project, and roles today (`OWNER`/`ADMIN`/`CLIENT`/`PRINT`) are studio-wide, never per-project.
2. **Likes** — no like/reaction concept exists anywhere in the codebase today.
3. **Comment threads** — the existing `Selection.comment` is a single-value, single-purpose field (one client's one edit-request note); it cannot be stretched into a multi-person thread.
4. **Join-request + notification flow** — no generic notification system exists (`lib/studio/notify.ts` only resolves admin email addresses, doesn't send anything); email sending is done ad hoc per-route via raw SES, which is fine to copy but nothing to plug into.
5. **Video preview/thumbnail generation** — confirmed the watermark Lambda explicitly no-ops on non-image files (`lambda/vayustudio-watermark/index.js:284-289`, marks `READY` with no thumbnail at all), and no gallery UI anywhere renders a `<video>` tile. Upload/storage/billing already accept video; *displaying* it doesn't work yet.
6. **Admin-controlled per-gallery toggles** (downloads, reels) — cheap new fields, not a new table, but don't exist today (`Studio.featureFlags` is studio-wide, not per-gallery).

## 2a. AI Face Indexing + Selfie Search — also almost entirely reuse

Added per explicit request: upload should default to AI face indexing **on**, with a visible cost/warning line, and a way to skip it at upload time and apply it later.

**This needs no new indexing infrastructure.** The AI-search credit system (`Studio.aiSearchCreditsUsed/Total`, `checkAiCreditsAvailable` in `lib/studio/quota.ts`) and the face-indexing Lambda (`vayustudio-indexfaces`) are already fully studio-agnostic — an individual's `Studio` record uses the identical fields as a professional studio's, so the same cost-gate-before-dispatch pattern (`app/studio/api/admin/projects/[projectId]/faces/index/route.ts:44-60`) applies unchanged.

Two things to reuse specifically:
- **The cost/warning display**: the studio admin's billing/usage screens already compute and show "X of Y AI credits used" — the individual-upload flow's warning line ("12 photos × 1 credit = 12 credits — 188 left this cycle") is the same math, just surfaced inline at upload time instead of in a settings tab.
- **The "apply later" path**: this already exists for studio admins as the AI Sort Redesign's force-re-index flow — both the sidebar and selection-bar AI Sorting triggers already check `faceIndexed` status before running and offer a re-index option. Skipping indexing at upload time just means the photo lands with `faceIndexed: false`, and the *exact same* existing re-index entry point handles indexing it later — no new state machine needed.
- **Selfie search for members**: since gallery members are authenticated (not anonymous QR-code guests), the right reuse target is the **Client Gallery's own "Find My Photos"** flow (`app/studio/api/client/gallery/[token]/selfie-search/route.ts` + `SelfieSearchModal.tsx`), not the Guest Selfie Search flow — members already have an identity, so none of the guest flow's unauthenticated trust-boundary work (§5 of the Reel Generator doc) is needed here. Members search only among already-indexed photos in galleries they're approved for, same as a client today.

Net effect: this whole feature is new **UI wiring** exposing already-built backend mechanisms in a simpler, upload-time-integrated way — not new indexing logic, not a new cost model, not a new Lambda.

## 3. Real Risk Worth Flagging Before Building

**Free-tier cost exposure at a different scale.** The Free plan (3GB storage + 200 AI-search credits) was sized assuming professional studios who mostly convert to Pro. Opening self-serve signup to the general public changes the shape of that assumption — a much larger number of accounts that may never pay, each consuming real R2 storage indefinitely. This isn't a reason not to build it, but the pricing/conversion strategy for individual users (a different free tier? Storage caps that expire? A path to a cheap paid tier?) is a real business decision, not just an engineering one — flagged here so it's made deliberately, not discovered later in an AWS bill.

## 4. Data Model Additions

```
GalleryMember (new table)
  PK: projectId, SK: userId
  role: 'ADMIN' | 'MEMBER'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  invitedAt, approvedAt?, approvedBy?
  GSI: userId-index (userId PK) — "which galleries am I a member of"

GalleryLike (new table)
  PK: fileId, SK: userId
  createdAt
  — existence of a row IS the like; toggling is idempotent put/delete.
  MediaFile gets a new `likeCount` field, updated via atomic ADD/SUBTRACT
  (same pattern as every existing counter in this codebase, e.g.
  downloadCount) — never computed by scanning GalleryLike on read.

GalleryComment (new table)
  PK: fileId, SK: commentId (ULID/timestamp-sortable)
  userId, text, createdAt
  queried via studioQueryByPK — same pagination-safe pattern as MediaFile.

StudioProject gets new optional fields:
  allowMemberDownloads?: boolean  (default true)
  allowMemberReels?: boolean      (default false — conservative default,
                                    since every reel costs real Kling money)
  autoApproveMembers?: boolean    (default false — join requests land as
                                    PENDING and need explicit approval unless
                                    the admin flips this on for a given gallery)
  isIndividualGallery?: boolean   (distinguishes this flow's projects from
                                    professional studio projects in any
                                    shared UI/reporting, informational only)
```

A shared `lib/studio/galleryPermissions.ts` helper (`isGalleryAdmin(member)`, `canDownload(project, member)`, `canCreateReel(project, member)`) is worth adding alongside this — not to refactor the 91 existing studio-role inline checks (out of scope, unrelated, risky), just so the *new* per-gallery checks aren't copy-pasted inline eight times the way the old pattern was.

## 5. Permission Model

Two roles per gallery, independent of the global `StudioRole`:
- **Gallery Admin** (the creator, plus anyone they promote) — approves join requests, can promote another approved member to admin, toggles `allowMemberDownloads`/`allowMemberReels`, can remove members.
- **Gallery Member** (status `APPROVED`) — views the live gallery, likes, comments, downloads/creates reels only if the admin has enabled it.
- **Pending** (status `PENDING`) — requested to join, sees a "waiting for approval" state, no gallery access yet.

Reel generation reuses the exact existing `ReelMvpModal`/pipeline — the only new work is a permission check (`canCreateReel`) before showing the button, using the studio's existing reel-credit balance. No pipeline changes needed.

## 5a. Identity: Client + Individual Unified, Studio Admin Always Separate

**Principle, added per explicit instruction (2026-09-11): any studio's client is automatically also an individual-gallery user under the same identity, but Studio Admin access is never reachable from an Individual/Client session — even for the exact same person — regardless of what other roles that email happens to hold.**

This isn't a new mechanism to invent — it's the natural extension of how Client identity already works. `client-gallery-access/route.ts:46-90` already finds-or-creates a `StudioUser` **by email**, unifying one person's CLIENT identity across every studio that's ever granted them gallery access (one record, many linked projects). Individual Gallery access should unify into that same identity: the same email, the same `StudioUser` record (or a role broadened to cover both), giving access to both surfaces without a second signup.

Studio Admin stays structurally separate because of how JWTs are actually issued, not because of an added check:
- `admin-login/route.ts` only ever issues an `ADMIN`/`OWNER` JWT after verifying a password against a `StudioUser` row that already has that exact role — it is never derived from "does this email have an admin role somewhere."
- Client/Individual login (existing `client-otp-verify`/`client-gallery-access`, and the new individual-signup flow in Phase 0) would only ever issue the lighter role's JWT, full stop — regardless of whether that same email separately owns a studio.
- **The one thing that must never be built**: any kind of "we noticed this email also has an ADMIN record, want to switch context?" convenience shortcut. That would silently reintroduce exactly the cross-access risk this principle rules out. If a Studio Admin wants their own admin dashboard, they always go through the explicit, dedicated Studio Admin login — same password/Google-OAuth-admin check as today, no shortcuts from an Individual session.

Net effect: no new security code needs to be written to enforce this — it's already true by construction, as long as Phase 0's individual-login route is built as a sibling to the existing Client login (issuing its own scoped JWT), not as an email-lookup-then-role-switcher.

## 6. Sign-In Page Redesign

Confirmed directly: only **Studio Admin** is a real login flow today. **Print Admin** and **Customer** are dead-ends on this specific page — both funnel into the same admin-only login form (Print Admin always fails), and Customer is a static "check your email" message with no inputs. Real Print/Customer access happens entirely via unguessable share-token links, reached from outside this page. **Safe to remove both cards without breaking any real capability.**

New sign-in page: exactly 2 options —
- **Studio Admin** — unchanged (existing form/Google OAuth/`admin-login`).
- **Individual User** (new) — Google OAuth (reuse the existing OAuth plumbing) into a parallel onboarding route that mirrors `google-onboard/route.ts`'s Studio+StudioUser(ADMIN) creation exactly, just framed as "your personal account" rather than "your studio."

Both rendered as animated cards using the same `reel-float`/`reel-glow`/shimmer treatment already built for Reel styles — gradient backgrounds, a large icon, hover-lift, no new animation primitives needed. "GIF-style" motion is CSS/SVG-driven for the same reason as every other place in this codebase: no way to source real image/GIF assets from this seat.

## 7. Phased Rollout

**Phase 0 — Sign-in page + individual signup**
Remove Print Admin/Customer cards, add the Individual User card, build the parallel onboarding route (Studio+StudioUser creation, `billingPlanId: 'free'`), land on a new animated welcome page. No new tables yet.

**Phase 1 — Quick event creation + simple gallery view**
A stripped-down "create event" flow (name only, matching the existing route's actual minimum requirement), and a simpler, mobile-first gallery view distinct from the full studio-admin `EventSection` component (individuals don't need selection/editing-required/watermark-preset UI).

**Phase 2 — Photo/video upload + AI indexing toggle**
Reuse the existing R2 multipart upload flow as-is for photos. For video: extend the watermark Lambda (or a small sibling function) with an ffmpeg thumbnail-frame extraction step — genuinely new work, but the ffmpeg-in-Lambda pattern (bundling, cross-compilation for Linux) is now already proven from the Reel Generator build, so this is meaningfully cheaper than it would have been before that existed. Gallery grid gets `<video>` tile rendering. Upload flow also gets the AI-indexing toggle from §2a — on by default with a cost line, skippable, with the existing re-index entry point handling "apply later."

**Phase 3 — Membership, invites, approval**
New `GalleryMember` table, an invite-link flow built on the existing share-token pattern, a join-request UI, admin approval screen, and admin notification via the existing ad-hoc-SES-per-route pattern (reusing `getStudioAdminEmails`'s query shape, generalized to gallery admins).

**Phase 4 — Likes + comments**
New `GalleryLike`/`GalleryComment` tables, atomic like-count updates, comment thread UI on the gallery grid/lightbox.

**Phase 5 — Admin permission controls**
Promote-to-admin, per-gallery `allowMemberDownloads`/`allowMemberReels` toggles, download gating, and wiring the existing Reel feature behind `canCreateReel`.

**Phase 6 — Mobile polish**
Burger nav for the individual-user surface (distinct from the studio-admin dashboard's own nav), full responsive audit matching the standard already set for the Reel feature, animated landing/welcome cards throughout.

## 8. Open Decisions

1. ✅ **RESOLVED (2026-09-11)** — Individual free-tier economics: **same Free plan as studios** (3GB + 200 AI credits, no new pricing constants), with the cost-exposure risk from §3 bounded a different way: a **hard 19-day retention window from the gallery's `createdAt`**, independent of storage usage. This is a genuinely simpler mechanism than a second quota tier — one condition (`elapsed >= 19 days`) instead of a parallel set of Free-plan numbers to maintain forever.

   **Mechanism** (extends the existing `cron/storage-check` pattern, doesn't replace it): the existing storage-overage grace period is triggered by exceeding a *storage* quota; this is a new, separate trigger keyed on elapsed *time* since creation, for `isIndividualGallery` projects only. Same reminder-then-delete shape as the existing overage flow, scaled to 19 days instead of the studio default of 25: reminder emails at roughly day 10 (~50%) and day 17 (~90%), then deletion at day 19 if nothing has changed — reusing the exact same per-project deletion cascade (`deleteOldestProjectsUntilUnderQuota`'s per-project cleanup logic, `app/studio/api/cron/storage-check/route.ts`) rather than writing a second one. "Proper message to user" means the reminder emails (and an in-gallery banner counting down) must say plainly *why* — "created N days ago, will be removed on [date] unless [renewed/upgraded]" — not a silent deletion.

   **Open follow-on, not resolved yet**: is there any way to *extend* past 19 days (upgrade to Pro, one-time renewal fee, or is 19 days simply final)? Flagging so it doesn't get decided by omission when Phase 1 actually builds this — happy to take this up now or later.

2. ✅ **RESOLVED (2026-09-11)** — Signup method: **Google OAuth only** for Individual User (reuses the exact existing `google-onboard/route.ts` plumbing, a different onboarding branch creating a lighter identity instead of a studio). No email/password for this surface — one less credential system to build and maintain for a product where most people only ever create one or two galleries.
3. ✅ **RESOLVED (2026-09-11)** — Invite link model: **open link + approval**, reusing the existing `clientShareToken`-shaped single-link-per-project primitive almost as-is. Added refinement: an **auto-approve toggle** on the gallery (`GalleryMember` status flips straight to `APPROVED` on join instead of `PENDING` when enabled) — lets an admin running a large, low-risk event (e.g. a big family gathering) skip approving every request individually, while smaller/more private galleries keep manual approval as the default.
4. ✅ **RESOLVED (2026-09-11)** — Moderation: **not over-built for v1**, since there's no existing content-moderation system anywhere in this codebase to extend (net-new either way, for a currently theoretical risk). Two cheap things ship in v1:
   - **Rate-limit join requests to max 50 per link per hour** — closes the obvious "script spam-requests an open link" path.
   - **Admin can remove a member and their uploads in one action** — fixes the actual failure mode (something bad got in) after the fact, reusing the existing per-file/per-project deletion cascade rather than a new one.

   Explicitly deferred: automated content scanning (nudity/violence detection etc.) — real engineering cost, no evidence of need yet, and easy to bolt on later via Rekognition's existing moderation APIs (already the vendor in use for face indexing) if real abuse ever shows up.
5. ✅ **RESOLVED (2026-09-11)** — Product name: **VayuStudios Moments**. Replaces "Individual User Galleries" everywhere in user-facing copy (sign-in card, landing page, emails) — internal code/table names can stay descriptive (`isIndividualGallery`, `GalleryMember`, etc.) without needing to match the marketing name exactly.

**All 5 open decisions are now resolved.** Nothing left blocking Phase 0.

---

*No code written yet. Phase 0 is the natural starting point once the open decisions above are resolved — smallest, most visible, and requires no new data model.*
