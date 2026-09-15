import Link from 'next/link'

// Shown only when arriving via ?from=moments (Moments' Profile Privacy/
// Terms links) — this page itself is shared site-wide content with
// VayuTransfer's own marketing chrome suppressed for this case (see
// ConditionalNavbar.tsx), so without this strip a Moments user would land
// on a plain, unbranded page with no way back except closing the tab. A
// small Moments-flavored bar here is enough to keep the "still one
// connected product" feeling without forking the actual policy content.
export default function MomentsBackBanner() {
  return (
    <div className="bg-[#0B0F1A] border-b border-[#1E2D45] px-4 py-3 flex items-center justify-between">
      <span className="text-sm font-extrabold text-[#E0EAF8]">
        Vayu<span className="text-[#00C6FF]">Studios</span> <span className="text-[#5A7090] font-semibold">Moments</span>
      </span>
      <Link href="/studio/moments" className="text-xs font-semibold text-[#00C6FF] hover:underline">
        ← Back to Moments
      </Link>
    </div>
  )
}
