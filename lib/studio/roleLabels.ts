import type { StudioRole } from './auth'

// Split out from auth.ts so client components can import just the label map
// without pulling in the server-only JWT signing code (jose, env secrets).
export const ROLE_LABEL: Record<StudioRole, string> = {
  OWNER: 'Platform Owner',
  ADMIN: 'Studio Admin',
  CLIENT: 'Client',
  PRINT: 'Print Admin',
}
