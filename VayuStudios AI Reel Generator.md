# VayuStudios AI Reel Generator — Production Enhancement

Implement a production-ready AI Reel Generator for VayuStudios.

## PRIMARY OBJECTIVE

Allow users to:

1. Select photos from a Client Gallery.
2. Select photos from Guest Selfie Search results.
3. Configure an AI Reel.
4. Generate a premium cinematic Reel.
5. Preview the Reel.
6. Download/share the Reel.

Use Kling 3.0 as the initial AI video generation provider.

CRITICAL ARCHITECTURE REQUIREMENT:

Do NOT couple the application directly to Kling.

Implement a provider abstraction and provider router so Runway, Luma, Google Veo or other providers can be added later without changing the frontend, Reel business logic, database model or API contract.

---

## USER SOURCES

Support two sources:

CLIENT_GALLERY
GUEST_SELFIE_SEARCH

For CLIENT_GALLERY:
- User can select any photos they are authorized to view.

For GUEST_SELFIE_SEARCH:
- User can only select photos returned/authorized by their selfie-search session.
- NEVER trust photo IDs supplied by the browser.
- Validate all selected photo IDs server-side.
- Validate gallery/event ownership.
- Validate selfie-search session authorization.

---

## PHOTO SELECTION

Minimum: 5 photos.
Recommended: 8–15.
Maximum: 30.

Implement:
- mobile-friendly photo grid
- selected numbering
- select all
- clear selection
- lazy loading
- large touch targets
- visual selection animation
- photo count

CTA:
"✨ Create AI Reel"

---

## AI PHOTO ANALYSIS

Before video generation, analyze selected photos.

Determine:
- category
- orientation
- face count
- quality score
- composition score
- subject
- recommended motion
- whether AI video is recommended

Example metadata:

{
  photoId,
  category,
  faces,
  qualityScore,
  compositionScore,
  orientation,
  recommendedMotion,
  aiVideoRecommended
}

Avoid sending low-quality or duplicate images to AI generation when possible.

---

## STORY PLANNING

Do not assume browser selection order is the final Reel order.

Create an AI story plan.

Possible roles:
- opening
- portrait
- couple
- ceremony
- family
- detail
- candid
- hero
- closing

Return structured:

{
  sequence: [
    {
      photoId,
      role,
      motion,
      aiGenerationRequired
    }
  ]
}

Allow the user to manually change ordering.

---

## REEL STYLES

Implement:

CINEMATIC
ROMANTIC
BOLLYWOOD
LUXURY
MEMORIES
PHOTOGRAPHERS_CHOICE

Default:
CINEMATIC

Do not expose AI provider names to users.

---

## OUTPUT FORMATS

Support:

9:16
4:5
16:9

Default:
9:16

Support:
720p
1080p

Default:
1080p where supported.

Durations:
15 sec
30 sec
45 sec
60 sec

Default:
30 sec.

---

## HYBRID AI GENERATION

Do NOT generate AI video for every selected photo.

For 10 selected photos, intelligently choose approximately 4–6 hero photos for Kling AI video generation.

Remaining photos should use FFmpeg cinematic animation.

Supported traditional motion:
- pan
- zoom
- Ken Burns
- parallax
- focus movement
- cinematic transitions

The goal is premium visual quality while controlling AI cost and generation time.

---

## PROVIDER ABSTRACTION

Create:

VideoProvider interface.

Required methods:

generateImageToVideo(request)
getGenerationStatus(providerJobId)
cancelGeneration(providerJobId)
getCapabilities()

Create:

KlingProvider

Do not place Kling API calls inside controllers, React components or Reel business logic.

Kling-specific request/response mapping must remain inside KlingProvider.

---

## PROVIDER ROUTER

Create:

VideoProviderRouter

It must select a provider based on:
- requested quality
- style
- duration
- aspect ratio
- resolution
- provider availability
- configured priority

Initial configuration:

Kling enabled.
All other providers disabled/not implemented.

Design configuration so future providers can be enabled without frontend changes.

Example:

providers:
  kling:
    enabled: true
    priority: 1

  runway:
    enabled: false
    priority: 2

  luma:
    enabled: false
    priority: 3

  veo:
    enabled: false
    priority: 4

Never expose provider names to end users.

---

## DYNAMIC FALLBACK

Implement provider fallback architecture.

If primary provider permanently fails and another provider is enabled:
- select fallback provider
- continue generation
- record provider used
- do not expose implementation details to customer

If no fallback exists:
- show friendly retry experience
- never leave ReelJob permanently stuck in generating state

---

## BACKEND JOB PROCESSING

Generation MUST be asynchronous.

Do not keep HTTP request open while AI video is being generated.

Flow:

POST /api/reels
→ create ReelJob
→ enqueue job
→ return reelId
→ worker processes job
→ analyze
→ story planning
→ AI generation
→ FFmpeg assembly
→ upload result
→ update status

Statuses:

created
analyzing
planning
queued
generating
assembling
processing
completed
failed
expired

Implement retries with configurable maximum retries.

---

## DATABASE

Create ReelJob model with:

id
galleryId
eventId
userId
guestSessionId
source
photoIds
style
aspectRatio
resolution
duration
provider
providerJobId
status
progress
outputUrl
thumbnailUrl
estimatedCost
actualCost
createdAt
startedAt
completedAt
expiresAt
errorCode
errorMessage

Do not store unnecessary sensitive selfie information.

---

## STORAGE

Use the existing VayuStudios object-storage architecture.

Store temporary AI assets and final Reel assets in R2/S3.

Suggested structure:

reels/{galleryId}/{reelId}/source/
reels/{galleryId}/{reelId}/ai-clips/
reels/{galleryId}/{reelId}/preview/
reels/{galleryId}/{reelId}/thumbnail/
reels/{galleryId}/{reelId}/final.mp4

Use signed URLs.

Never make private gallery originals publicly accessible just to generate a Reel.

Implement cleanup/expiry for temporary assets.

---

## AI PROMPTS

Create a reusable prompt-generation service.

Do not use a generic static prompt.

Generate prompt based on:
- photo category
- detected subjects
- style
- motion type
- wedding/event context
- orientation
- story role

Prompts must strongly instruct:
- preserve identity
- preserve facial structure
- preserve clothing
- preserve jewellery
- preserve hairstyle
- preserve body proportions
- preserve number of people
- no additional people
- no text
- no logos
- no artificial objects
- photorealistic motion
- natural camera movement

Create separate motion prompt templates.

---

## MOTION LIBRARY

Implement controlled motion types:

slow_push_in
slow_pull_out
left_to_right
right_to_left
orbit
parallax
portrait_focus
couple_reveal
group_zoom_out
detail_push
cinematic_pan

The story planner should select appropriate motion.

---

## FFmpeg ASSEMBLY

Build a reusable ReelAssembler.

Input:
- AI generated clips
- normal animated photo clips
- music
- optional branding
- optional text

Output:
MP4
H.264
AAC

Default:
1080x1920
9:16

Create:
- transitions
- timing
- audio synchronization
- fade in/out
- optional studio branding

Ensure generated videos are optimized for mobile playback.

---

## MUSIC

Use only properly licensed music.

Categories:
- Romantic
- Cinematic
- Bollywood-inspired
- Luxury
- Emotional
- Celebration
- Travel

Do not allow copyrighted commercial music unless explicitly licensed.

---

## API

Implement:

POST /api/reels
GET /api/reels/:id
POST /api/reels/:id/cancel
POST /api/reels/:id/retry
DELETE /api/reels/:id
GET /api/reels/:id/download

For guest selfie search, use validated session context.

---

## FRONTEND COMPONENTS

Create reusable components:

AIReelButton
ReelPhotoSelector
ReelStyleSelector
ReelSettings
ReelGenerationScreen
ReelProgress
ReelPreview
ReelShareActions
ReelHistory

Components must work in:
- Client Gallery
- Guest Selfie Search

Only authorization/data source should differ.

---

## GENERATION EXPERIENCE

Make it premium and cinematic.

Do not show a generic spinner.

Show:

REC indicator
camera focus bracket
subtle film/camera animation
progress
current processing stage

Example stages:

Selecting your best moments
Analyzing your photos
Planning your story
Creating cinematic movement
Assembling your Reel
Finalizing your video

Respect prefers-reduced-motion.

---

## RESULT EXPERIENCE

Full-screen mobile-first Reel preview.

Actions:

Download
Share
WhatsApp
Create Another

On mobile prioritize:
Preview
Download
Share

Ensure compatibility with iPhone Safari and Android Chrome.

---

## REEL HISTORY

For clients:

"My Reels"

Display:
thumbnail
date
status
preview
download
share

For guests:
use configurable temporary retention.

---

## COST CONTROL

Implement configurable:

maxPhotos
maxAIGeneratedClips
maxDuration
maxConcurrentJobs
maxRetries
dailyGalleryLimit
dailyGuestLimit
monthlyAIReelLimit

Never hard-code provider pricing.

Create provider pricing configuration.

Track:
provider
model
duration
estimated cost
actual cost
retry count

Prevent duplicate generation where appropriate using a deterministic request fingerprint based on:
gallery
authorized photo set
style
duration
aspect ratio
resolution

---

## ADMIN ANALYTICS

Add AI Reel analytics:

totalReels
successfulReels
failedReels
averageGenerationTime
averageAICost
revenue
profit

Provider usage:
Kling
Runway
Luma
Veo

Only display providers that are configured/enabled.

---

## EVENTS

Track:

reel_cta_viewed
reel_selection_started
reel_photo_selected
reel_creation_started
reel_style_selected
reel_generation_started
reel_generation_completed
reel_generation_failed
reel_preview_played
reel_downloaded
reel_shared
reel_whatsapp_shared
reel_regenerated

Include:
galleryId
eventId
source
photoCount
style
provider
duration

Do not log raw selfies or unnecessary image data.

---

## FAILURE FALLBACK

If AI generation fails, offer:

"Create Simple Cinematic Reel"

This uses FFmpeg only:
- pan
- zoom
- parallax
- transitions
- music

The user should still be able to receive a Reel.

---

## SECURITY

Implement:
- server-side authorization
- signed storage URLs
- provider credentials only on backend
- request validation
- rate limiting
- gallery/event authorization
- selfie-session authorization
- no arbitrary provider URLs from client
- no arbitrary photo IDs
- no public private-original URLs
- cleanup of temporary assets

---

## PERFORMANCE

Use:
- async queue
- workers
- concurrency limits
- lazy image loading
- thumbnail versions
- CDN/R2
- polling or webhook-based provider status
- retry with exponential backoff
- idempotent job processing

Never block normal gallery browsing because a Reel is being generated.

---

## TESTING

Add tests for:

1. Client gallery photo selection.
2. Guest selfie authorized photo selection.
3. Unauthorized guest photo injection.
4. Reel creation.
5. Provider selection.
6. Kling provider.
7. Provider failure.
8. Retry.
9. Future fallback provider.
10. Job state transitions.
11. Duplicate Reel detection.
12. Storage cleanup.
13. FFmpeg assembly.
14. Mobile UI.
15. Expired Reel.
16. Rate limits.

---

## IMPORTANT IMPLEMENTATION RULE

Before changing existing code:

1. Inspect the existing repository.
2. Identify existing gallery architecture.
3. Identify existing selfie-search architecture.
4. Identify current authentication/authorization.
5. Identify existing S3/R2 storage abstraction.
6. Identify existing background jobs/queues.
7. Identify existing FFmpeg/video processing.
8. Identify existing DynamoDB/database patterns.
9. Reuse existing infrastructure wherever possible.
10. Do NOT create duplicate storage/auth/job systems if equivalent infrastructure already exists.

Do not rewrite unrelated parts of the application.

Implement incrementally.

At the end of implementation provide:

- files changed
- database changes
- environment variables required
- API endpoints
- queue/worker changes
- deployment changes
- Kling configuration
- security considerations
- test results
- known limitations
- future provider integration instructions

Do not implement Runway/Luma/Veo now.

Only make the provider abstraction ready for them.

The first production provider is Kling 3.0.