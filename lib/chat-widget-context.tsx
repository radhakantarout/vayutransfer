'use client'

import { createContext, useContext, useState } from 'react'

// Mirrors components/studio/ChatWidgetContext.tsx's pattern exactly — lets a
// "Help" link anywhere in the tree (e.g. Navbar) open the chat panel that's
// actually rendered up at the root layout, without prop-drilling. The panel
// itself stays fully controlled here; ChatWidget no longer owns its own
// open/closed state locally.
interface ChatWidgetState {
  open: boolean
  setOpen: (v: boolean) => void
}

const ChatWidgetContext = createContext<ChatWidgetState>({
  open: false,
  setOpen: () => {},
})

export function ChatWidgetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <ChatWidgetContext.Provider value={{ open, setOpen }}>
      {children}
    </ChatWidgetContext.Provider>
  )
}

export function useChatWidget() {
  return useContext(ChatWidgetContext)
}
