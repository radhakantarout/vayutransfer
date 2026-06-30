'use client'

export default function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/918984769522"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="group fixed bottom-6 right-6 z-50 flex items-center gap-3"
    >
      {/* Tooltip */}
      <span className="
        opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0
        transition-all duration-200
        bg-[#111827] text-white text-xs font-semibold
        px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap
        pointer-events-none
      ">
        Chat with us
      </span>

      {/* Button */}
      <div className="relative flex-shrink-0">
        {/* Pulse rings */}
        <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-30 animate-ping" />
        <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-20 scale-125 animate-ping [animation-delay:0.4s]" />

        {/* Main circle */}
        <div className="
          relative w-14 h-14 rounded-full
          bg-gradient-to-br from-[#25D366] to-[#128C7E]
          flex items-center justify-center
          shadow-[0_4px_20px_rgba(37,211,102,0.45)]
          hover:shadow-[0_6px_28px_rgba(37,211,102,0.65)]
          hover:scale-110 active:scale-95
          transition-all duration-200
        ">
          <WhatsAppIcon />
        </div>
      </div>
    </a>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.832 6.5L4 29l7.75-1.818A11.94 11.94 0 0016 28c6.627 0 12-5.373 12-12S22.627 3 16 3z"
        fill="white"
        fillOpacity="0.2"
      />
      <path
        d="M16 4.5C10.201 4.5 5.5 9.201 5.5 15c0 2.21.71 4.26 1.914 5.932L5.5 27.5l6.75-1.594A11.46 11.46 0 0016 27c5.799 0 10.5-4.701 10.5-11S21.799 4.5 16 4.5z"
        fill="white"
      />
      <path
        d="M21.5 18.385c-.288-.144-1.7-.838-1.963-.934-.263-.097-.454-.144-.646.144-.191.288-.742.934-.909 1.126-.167.191-.335.215-.623.072-.288-.144-1.216-.448-2.317-1.428-.856-.763-1.434-1.706-1.602-1.993-.167-.288-.018-.444.126-.587.129-.129.288-.335.432-.503.144-.167.191-.288.288-.48.096-.191.048-.359-.024-.503-.072-.144-.646-1.558-.885-2.133-.233-.56-.47-.484-.646-.493l-.55-.01c-.191 0-.503.072-.767.359-.263.288-1.005.982-1.005 2.396s1.029 2.779 1.173 2.971c.144.191 2.025 3.09 4.908 4.332.686.296 1.22.473 1.637.605.687.22 1.313.188 1.808.114.552-.082 1.7-.695 1.94-1.366.239-.671.239-1.247.167-1.366-.072-.12-.263-.192-.55-.336z"
        fill="#25D366"
      />
    </svg>
  )
}
