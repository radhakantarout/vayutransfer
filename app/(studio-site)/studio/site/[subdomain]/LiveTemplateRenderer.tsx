'use client'

import { useEffect, useState } from 'react'
import type { StudioWebsite } from '@/types/studio'
import Lumina from './templates/Lumina'
import Clarity from './templates/Clarity'
import Ember from './templates/Ember'
import Bold from './templates/Bold'
import Bloom from './templates/Bloom'
import Frame from './templates/Frame'
import Zari from './templates/Zari'
import Monsoon from './templates/Monsoon'
import { WhatsAppFloatingButton } from './templates/SocialIcons'

function renderTemplate(site: StudioWebsite) {
  switch (site.templateId) {
    case 'lumina':  return <Lumina site={site} />
    case 'clarity': return <Clarity site={site} />
    case 'ember':   return <Ember site={site} />
    case 'bold':    return <Bold site={site} />
    case 'bloom':   return <Bloom site={site} />
    case 'frame':   return <Frame site={site} />
    case 'zari':    return <Zari site={site} />
    case 'monsoon': return <Monsoon site={site} />
    default:        return <Lumina site={site} />
  }
}

// Real public visitors always just get the server-fetched `initialSite`
// rendered once — `isPreview` is only true when this page was reached via a
// verified preview token (see page.tsx / lib/studio/previewToken.ts), which
// only the dashboard's own live-preview iframe and manual preview link can
// produce. In that case, the dashboard's LivePreviewPanel posts the studio
// owner's current in-memory (possibly unsaved) edits into this window as
// they type, so the preview updates instantly without needing a save —
// while the actual saved record, and everything a real visitor ever sees,
// is completely untouched until an explicit Save/Publish.
export default function LiveTemplateRenderer({
  initialSite, isPreview,
}: {
  initialSite: StudioWebsite
  isPreview: boolean
}) {
  const [site, setSite] = useState(initialSite)

  useEffect(() => {
    if (!isPreview) return
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'vayustudio-preview-update') return
      setSite(e.data.site as StudioWebsite)
    }
    window.addEventListener('message', onMessage)
    // Lets the dashboard know it can start pushing updates immediately,
    // instead of guessing when this iframe has finished mounting.
    window.parent?.postMessage({ type: 'vayustudio-preview-ready' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [isPreview])

  const content = (
    <>
      {renderTemplate(site)}
      <WhatsAppFloatingButton number={site.whatsapp} />
    </>
  )

  // Click-to-edit (coarse/section-level): only active in preview mode, so a
  // real visitor's page is byte-for-byte the same `<>...</>` as before this
  // existed. Delegates from a single listener instead of annotating every
  // individual field — every template already wraps its content in
  // <section>/<header>/<footer> landmarks carrying a `data-preview-tab`
  // attribute (see templates/*.tsx), so "which dashboard tab does this click
  // belong to" is just a closest() lookup. Posts a message the dashboard's
  // LivePreviewPanel listens for to switch its tab — never touches `site` or
  // triggers a save, so it can't affect what's actually persisted.
  if (!isPreview) return content

  const onPreviewClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-preview-tab]')
    if (target?.dataset.previewTab) {
      window.parent?.postMessage({ type: 'vayustudio-preview-edit-request', tab: target.dataset.previewTab }, '*')
    }
  }

  return (
    <div onClick={onPreviewClick}>
      <style>{'[data-preview-tab]:hover{outline:2px dashed rgba(99,102,241,0.85);outline-offset:-2px;cursor:pointer}'}</style>
      {content}
    </div>
  )
}
