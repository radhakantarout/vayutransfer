'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface WalletContextType {
  walletId: string | null
  balancePaise: number
  refreshBalance: () => void
  topupOpen: boolean
  openTopup: () => void
  closeTopup: () => void
}

const WalletContext = createContext<WalletContextType>({
  walletId: null,
  balancePaise: 0,
  refreshBalance: () => {},
  topupOpen: false,
  openTopup: () => {},
  closeTopup: () => {},
})

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [walletId, setWalletId] = useState<string | null>(null)
  const [balancePaise, setBalancePaise] = useState(0)
  const [topupOpen, setTopupOpen] = useState(false)

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet/balance')
      const data = await res.json()
      if (data.success) {
        setWalletId(data.data.walletId)
        setBalancePaise(data.data.balancePaise)
      }
    } catch {}
  }, [])

  useEffect(() => { fetchBalance() }, [fetchBalance])

  return (
    <WalletContext.Provider value={{
      walletId,
      balancePaise,
      refreshBalance: fetchBalance,
      topupOpen,
      openTopup: () => setTopupOpen(true),
      closeTopup: () => setTopupOpen(false),
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export const useWallet = () => useContext(WalletContext)
