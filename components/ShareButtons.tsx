'use client'

interface Props {
  link: string
  fileName: string
  size?: 'sm' | 'md'
}

function gmailHref(link: string, fileName: string) {
  const subject = encodeURIComponent(`File ready: ${fileName}`)
  const body = encodeURIComponent(`Here's your download link:\n\n${link}\n\nLink expires in 24 hours.`)
  const isMobile = /Android|iPhone|iPad|iPod/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  )
  return isMobile
    ? `mailto:?subject=${subject}&body=${body}`
    : `https://mail.google.com/mail/?view=cm&su=${subject}&body=${body}`
}

export default function ShareButtons({ link, fileName, size = 'md' }: Props) {
  const iconClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const btnClass = size === 'sm'
    ? 'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border border-border hover:border-current transition-colors text-xs font-medium'
    : 'flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border hover:border-current transition-colors text-xs font-medium'

  const options = [
    {
      label: 'Gmail',
      color: '#EA4335',
      href: gmailHref(link, fileName),
      icon: (
        <svg viewBox="0 0 24 24" className={iconClass} fill="currentColor">
          <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.548l8.073-6.055C21.69 2.28 24 3.434 24 5.457z"/>
        </svg>
      ),
    },
    {
      label: 'WhatsApp',
      color: '#25D366',
      href: `https://wa.me/?text=${encodeURIComponent(`Here's your download link: ${link}\n\nExpires in 24 hours.`)}`,
      icon: (
        <svg viewBox="0 0 24 24" className={iconClass} fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
        </svg>
      ),
    },
    {
      label: 'Message',
      color: '#00C6FF',
      href: `sms:?body=${encodeURIComponent(`Download link: ${link} (expires in 24 hours)`)}`,
      icon: (
        <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
  ]

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <a
          key={opt.label}
          href={opt.href}
          target="_blank"
          rel="noopener noreferrer"
          className={btnClass}
          style={{ color: opt.color }}
        >
          {opt.icon}
          {opt.label}
        </a>
      ))}
    </div>
  )
}
