'use client'

export default function EmailSupportButton() {
  return (
    <a
      href="mailto:support@vayutransfer.com"
      aria-label="Email us at support@vayutransfer.com"
      className="group fixed bottom-6 left-6 z-50 flex items-center gap-3"
    >
      {/* Button */}
      <div className="relative flex-shrink-0">
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full bg-[#00C6FF] opacity-25 animate-ping [animation-delay:0.6s]" />

        {/* Main circle */}
        <div className="
          relative w-14 h-14 rounded-full
          bg-gradient-to-br from-[#00C6FF] to-[#0072FF]
          flex items-center justify-center
          shadow-[0_4px_20px_rgba(0,198,255,0.4)]
          hover:shadow-[0_6px_28px_rgba(0,198,255,0.65)]
          hover:scale-110 active:scale-95
          transition-all duration-200
        ">
          <EmailIcon />
        </div>
      </div>

      {/* Tooltip — appears to the right */}
      <span className="
        opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0
        transition-all duration-200
        bg-[#111827] text-white text-xs font-semibold
        px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap
        pointer-events-none
      ">
        support@vayutransfer.com
      </span>
    </a>
  )
}

function EmailIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="20" height="16" rx="3" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5"/>
      <path
        d="M2 7l9.293 6.293a1 1 0 001.414 0L22 7"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
