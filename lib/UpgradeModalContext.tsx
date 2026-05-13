'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { CheckoutPlanId } from './constants';

interface UpgradeModalContextValue {
  isOpen: boolean;
  defaultPlan: Exclude<CheckoutPlanId, 'custom'> | undefined;
  openUpgradeModal: (defaultPlan?: Exclude<CheckoutPlanId, 'custom'>) => void;
  closeUpgradeModal: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue>({
  isOpen: false,
  defaultPlan: undefined,
  openUpgradeModal: () => {},
  closeUpgradeModal: () => {},
});

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultPlan, setDefaultPlan] = useState<Exclude<CheckoutPlanId, 'custom'> | undefined>(undefined);

  function openUpgradeModal(plan?: Exclude<CheckoutPlanId, 'custom'>) {
    setDefaultPlan(plan);
    setIsOpen(true);
  }

  function closeUpgradeModal() {
    setIsOpen(false);
  }

  return (
    <UpgradeModalContext.Provider value={{ isOpen, defaultPlan, openUpgradeModal, closeUpgradeModal }}>
      {children}
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  return useContext(UpgradeModalContext);
}
