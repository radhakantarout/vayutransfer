import type { Metadata } from 'next'
import PricingContent from './PricingContent'

export const metadata: Metadata = {
  title: 'Pricing — VayuStudios',
  description: 'Simple tiered pricing for professional photography studios — storage + AI photo search, with unlimited downloads on every plan.',
}

export default function PricingPage() {
  return <PricingContent />
}
