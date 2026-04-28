'use client';

import { createContext, useContext, useState } from 'react';

interface ChatPanelContextValue {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const ChatPanelContext = createContext<ChatPanelContextValue>({
  panelOpen: false,
  setPanelOpen: () => {},
});

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  return (
    <ChatPanelContext.Provider value={{ panelOpen, setPanelOpen }}>
      {children}
    </ChatPanelContext.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelContext);
}
