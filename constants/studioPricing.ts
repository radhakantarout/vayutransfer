// VayuStudios billing constants — deliberately separate from VayuTransfer's
// constants/pricing.ts. Prices computed for a ~40% margin after AWS Mumbai
// (ap-south-1) costs and Razorpay's ~2.36% fee (2% + 18% GST), verified July 2026:
//   S3 storage:  ~$0.023/GB/month  (~₹1.93/GB/month at ₹84/$)
//   S3/CloudFront egress to India: ~$0.109/GB (~₹9.16/GB, one-time)

export const GB = 1024 * 1024 * 1024

// Free baseline — every studio gets this regardless of plan.
export const FREE_STORAGE_BYTES  = 20 * GB   // standing balance
export const FREE_DOWNLOAD_BYTES = 2  * GB   // resets every calendar month

// Storage is sold in time-bound blocks ("N GB guaranteed for M months") —
// this is what lets a one-time payment stay profitable regardless of how
// long a studio keeps the data, unlike an open-ended "N GB forever" grant.
export interface StorageTopupPackage {
  id: string
  label: string
  gb: number
  months: number
  pricePaise: number
  popular?: boolean
}

export const STORAGE_TOPUP_PACKAGES: StorageTopupPackage[] = [
  { id: 'storage_50_3',  label: '50 GB · 3 months',  gb: 50,  months: 3, pricePaise: 50000 },
  { id: 'storage_100_3', label: '100 GB · 3 months', gb: 100, months: 3, pricePaise: 100000, popular: true },
  { id: 'storage_100_6', label: '100 GB · 6 months', gb: 100, months: 6, pricePaise: 200000 },
]

// Downloads don't persist — a one-time charge per GB is the correct economic
// model here (no retention/expiry concept needed, unlike storage).
export interface DownloadTopupPackage {
  id: string
  label: string
  gb: number
  pricePaise: number
  popular?: boolean
}

export const DOWNLOAD_TOPUP_PACKAGES: DownloadTopupPackage[] = [
  { id: 'download_10',  label: '10 GB',  gb: 10,  pricePaise: 16000 },
  { id: 'download_50',  label: '50 GB',  gb: 50,  pricePaise: 80000, popular: true },
  { id: 'download_100', label: '100 GB', gb: 100, pricePaise: 160000 },
]

export const DEFAULT_RETENTION_GRACE_DAYS = 25
export const RETENTION_GRACE_DAY_OPTIONS = [15, 25, 45] as const

export function formatPaiseAsRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

export function formatBytesGB(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`
}
