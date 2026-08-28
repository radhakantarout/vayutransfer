// Shared photo/video branch for every template's hero background — keeps the
// video-vs-photo decision in one place so each template's own layout/classNames
// are untouched. `type` undefined (every hero record created before video
// support existed) always renders the plain <img> path, so an existing site's
// hero looks byte-for-byte identical to before this component existed.
export default function HeroBackground({
  url, type, poster, className = 'w-full h-full object-cover', style,
}: {
  url: string
  type?: 'photo' | 'video'
  poster?: string
  className?: string
  style?: React.CSSProperties
}) {
  if (type === 'video') {
    return (
      <video src={url} poster={poster || undefined} className={className} style={style}
        autoPlay muted loop playsInline />
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className} style={style} />
}
