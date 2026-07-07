import fs from 'fs'
import path from 'path'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

export function getPhotosForSlug(slug: string): string[] {
  const dir = path.join(process.cwd(), 'public', 'images', 'gallery', slug)
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .slice(0, 6)
      .map((f) => `/images/gallery/${slug}/${f}`)
  } catch {
    return []
  }
}

export function getSamplePhotos(): string[] {
  const samplesDir = path.join(process.cwd(), 'public', 'images', 'samples')
  try {
    const files = fs
      .readdirSync(samplesDir)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .slice(0, 3)
      .map((f) => `/images/samples/${f}`)
    if (files.length > 0) return files
  } catch { /* fall through */ }
  // Fallback: use first 3 wedding photos if samples folder is empty
  return getPhotosForSlug('wedding').slice(0, 3)
}
