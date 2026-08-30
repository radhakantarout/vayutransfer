import type { WebsiteGalleryStyle, WebsiteLanguage } from '@/types/studio'
import PortfolioGallery from './PortfolioGallery'
import RotateScroll from './gallery-styles/RotateScroll'
import CardStack from './gallery-styles/CardStack'
import Coverflow from './gallery-styles/Coverflow'
import ParallaxMasonry from './gallery-styles/ParallaxMasonry'
import Cube3D from './gallery-styles/Cube3D'
import Orbit3D from './gallery-styles/Orbit3D'
import Spiral3D from './gallery-styles/Spiral3D'
import HorizontalParallax from './gallery-styles/HorizontalParallax'
import FilmReel from './gallery-styles/FilmReel'
import CinemaScreen from './gallery-styles/CinemaScreen'
import RackFocus from './gallery-styles/RackFocus'
import SpotlightStage from './gallery-styles/SpotlightStage'
import ProjectorSlide from './gallery-styles/ProjectorSlide'
import type { GalleryItem } from './PortfolioGallery'

// Single dispatch point so templates never branch on gallery style themselves
// — same role as HeroMedia's photo/video dispatch. undefined/'classic' always
// renders PortfolioGallery exactly as before this existed (the grid + 3D
// flip-book), so no existing site's gallery changes.
export default function Gallery({
  style, photos, studioName, accent, fontColor, language,
}: {
  style?: WebsiteGalleryStyle
  photos: GalleryItem[]
  studioName: string
  accent?: string
  fontColor?: string
  language?: WebsiteLanguage
}) {
  switch (style) {
    case 'rotateScroll':     return <RotateScroll photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'stack':            return <CardStack photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'coverflow':        return <Coverflow photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'parallaxMasonry':  return <ParallaxMasonry photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'cube':             return <Cube3D photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'orbit':            return <Orbit3D photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'spiral':           return <Spiral3D photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'horizontalParallax': return <HorizontalParallax photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'filmReel':         return <FilmReel photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'cinemaScreen':     return <CinemaScreen photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'rackFocus':        return <RackFocus photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'spotlightStage':   return <SpotlightStage photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'projectorSlide':   return <ProjectorSlide photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
    case 'classic':
    default:                 return <PortfolioGallery photos={photos} studioName={studioName} accent={accent} fontColor={fontColor} language={language} />
  }
}
