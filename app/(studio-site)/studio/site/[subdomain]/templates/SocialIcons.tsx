interface SocialIconsProps {
  instagram?: string
  facebook?: string
  youtube?: string
  className?: string
  iconClassName?: string
}

// Each icon uses the platform's official brand colour regardless of template theme.
function IconInstagram() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#E1306C" aria-label="Instagram">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

function IconFacebook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2" aria-label="Facebook">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function IconYouTube() {
  return (
    <svg width="22" height="20" viewBox="0 0 24 24" fill="#FF0000" aria-label="YouTube">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  )
}

function IconWhatsApp() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="#25D366" aria-label="WhatsApp">
      <path d="M16 4.5C10.201 4.5 5.5 9.201 5.5 15c0 2.21.71 4.26 1.914 5.932L5.5 27.5l6.75-1.594A11.46 11.46 0 0016 27c5.799 0 10.5-4.701 10.5-11S21.799 4.5 16 4.5zM21.5 18.385c-.288-.144-1.7-.838-1.963-.934-.263-.097-.454-.144-.646.144-.191.288-.742.934-.909 1.126-.167.191-.335.215-.623.072-.288-.144-1.216-.448-2.317-1.428-.856-.763-1.434-1.706-1.602-1.993-.167-.288-.018-.444.126-.587.129-.129.288-.335.432-.503.144-.167.191-.288.288-.48.096-.191.048-.359-.024-.503-.072-.144-.646-1.558-.885-2.133-.233-.56-.47-.484-.646-.493l-.55-.01c-.191 0-.503.072-.767.359-.263.288-1.005.982-1.005 2.396s1.029 2.779 1.173 2.971c.144.191 2.025 3.09 4.908 4.332.686.296 1.22.473 1.637.605.687.22 1.313.188 1.808.114.552-.082 1.7-.695 1.94-1.366.239-.671.239-1.247.167-1.366-.072-.12-.263-.192-.55-.336z"/>
    </svg>
  )
}

// A proper contact button (icon + label) rather than a plain text link — used in
// each template's Contact section wherever site.whatsapp is set.
export function WhatsAppButton({ number, className = '' }: { number?: string; className?: string }) {
  if (!number) return null
  const digits = number.replace(/\D/g, '')
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-semibold px-4 py-2 rounded-xl hover:bg-[#25D366]/20 transition-colors text-sm ${className}`}
    >
      <IconWhatsApp />
      Chat on WhatsApp
    </a>
  )
}

// Fixed floating action button, bottom-right, on every public studio site
// regardless of template — a pulsing ring behind a glossy 3D-styled circle.
export function WhatsAppFloatingButton({ number }: { number?: string }) {
  if (!number) return null
  const digits = number.replace(/\D/g, '')
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-50 group"
    >
      <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-75 animate-ping" />
      <span
        className="relative flex items-center justify-center w-14 h-14 rounded-full transition-transform group-hover:scale-110"
        style={{
          background: 'radial-gradient(circle at 32% 28%, #3EEB7E, #1DA851 75%)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.35), inset 0 -3px 6px rgba(0,0,0,0.25), inset 0 2px 3px rgba(255,255,255,0.5)',
        }}
      >
        <svg width="30" height="30" viewBox="0 0 32 32" fill="#fff">
          <path d="M16 4.5C10.201 4.5 5.5 9.201 5.5 15c0 2.21.71 4.26 1.914 5.932L5.5 27.5l6.75-1.594A11.46 11.46 0 0016 27c5.799 0 10.5-4.701 10.5-11S21.799 4.5 16 4.5zM21.5 18.385c-.288-.144-1.7-.838-1.963-.934-.263-.097-.454-.144-.646.144-.191.288-.742.934-.909 1.126-.167.191-.335.215-.623.072-.288-.144-1.216-.448-2.317-1.428-.856-.763-1.434-1.706-1.602-1.993-.167-.288-.018-.444.126-.587.129-.129.288-.335.432-.503.144-.167.191-.288.288-.48.096-.191.048-.359-.024-.503-.072-.144-.646-1.558-.885-2.133-.233-.56-.47-.484-.646-.493l-.55-.01c-.191 0-.503.072-.767.359-.263.288-1.005.982-1.005 2.396s1.029 2.779 1.173 2.971c.144.191 2.025 3.09 4.908 4.332.686.296 1.22.473 1.637.605.687.22 1.313.188 1.808.114.552-.082 1.7-.695 1.94-1.366.239-.671.239-1.247.167-1.366-.072-.12-.263-.192-.55-.336z"/>
        </svg>
      </span>
    </a>
  )
}

export default function SocialIcons({ instagram, facebook, youtube, className = '', iconClassName = '' }: SocialIconsProps) {
  if (!instagram && !facebook && !youtube) return null
  return (
    <div className={`flex items-center gap-5 ${className}`}>
      {instagram && (
        <a href={instagram} target="_blank" rel="noopener noreferrer"
          className={`transition-opacity hover:opacity-75 ${iconClassName}`} aria-label="Instagram">
          <IconInstagram />
        </a>
      )}
      {facebook && (
        <a href={facebook} target="_blank" rel="noopener noreferrer"
          className={`transition-opacity hover:opacity-75 ${iconClassName}`} aria-label="Facebook">
          <IconFacebook />
        </a>
      )}
      {youtube && (
        <a href={youtube} target="_blank" rel="noopener noreferrer"
          className={`transition-opacity hover:opacity-75 ${iconClassName}`} aria-label="YouTube">
          <IconYouTube />
        </a>
      )}
    </div>
  )
}
