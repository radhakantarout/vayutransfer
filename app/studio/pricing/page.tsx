import type { Metadata } from 'next'
import PricingContent from './PricingContent'

export const metadata: Metadata = {
  title: 'Pricing — VayuStudios',
  description: 'A generous free baseline for every studio — 20 GB storage and 2 GB downloads a month. Pay only when you need more, no subscriptions.',
}

export default function PricingPage() {
  return <PricingContent />
}
