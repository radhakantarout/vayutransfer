import RegisterForm from './RegisterForm'
import { getPhotosForSlug, getSamplePhotos } from '@/lib/studio/sampleImages'

export default async function RegisterPage() {
  const uploadSamples = getSamplePhotos()
  const mockupPhotos  = getPhotosForSlug('wedding')

  return <RegisterForm uploadSamples={uploadSamples} mockupPhotos={mockupPhotos} />
}
