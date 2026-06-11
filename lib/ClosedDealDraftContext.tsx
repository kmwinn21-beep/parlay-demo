'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';

export interface DealProduct {
  id?: number;
  product_name: string;
  quantity: number | null;
  unit_price: number | null;
  sort_order: number;
}

export interface ClosedDeal {
  id: number;
  company_id: number;
  deal_name: string;
  close_date: string;
  amount: number | null;
  currency: string;
  notes: string | null;
  opportunity_id: string | null;
  deal_type: string | null;
  contact_signor: string | null;
  contact_signor_attendee_id: number | null;
  contact_signor_title: string | null;
  contact_signor_function: string | null;
  contact_signor_seniority: string | null;
  attributed_conference: string | null;
  attribution_type: string | null;
  attributed_rep: string | null;
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  products: DealProduct[];
}

interface ClosedDealDraftContextValue {
  isOpen: boolean;
  isMinimized: boolean;
  targetCompanyId: number | null;
  editingDeal: ClosedDeal | null;
  draftLabel: string;
  openDeal: (companyId?: number | null, deal?: ClosedDeal | null) => void;
  minimizeDeal: () => void;
  expandDeal: () => void;
  closeDeal: () => void;
  setDraftLabel: (label: string) => void;
}

const ClosedDealDraftContext = createContext<ClosedDealDraftContextValue>({
  isOpen: false,
  isMinimized: false,
  targetCompanyId: null,
  editingDeal: null,
  draftLabel: '',
  openDeal: () => {},
  minimizeDeal: () => {},
  expandDeal: () => {},
  closeDeal: () => {},
  setDraftLabel: () => {},
});

export function ClosedDealDraftProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [targetCompanyId, setTargetCompanyId] = useState<number | null>(null);
  const [editingDeal, setEditingDeal] = useState<ClosedDeal | null>(null);
  const [draftLabel, setDraftLabel] = useState('');

  const openDeal = (companyId?: number | null, deal?: ClosedDeal | null) => {
    if (isOpen && isMinimized) {
      // Already have a minimized draft — just expand it unless it's a different deal
      const sameTarget =
        (companyId == null || companyId === targetCompanyId) &&
        (deal == null || deal.id === editingDeal?.id);
      if (sameTarget) {
        setIsMinimized(false);
        return;
      }
    }
    setTargetCompanyId(companyId ?? null);
    setEditingDeal(deal ?? null);
    setDraftLabel(deal?.deal_name ?? '');
    setIsOpen(true);
    setIsMinimized(false);
  };

  const minimizeDeal = () => setIsMinimized(true);
  const expandDeal = () => setIsMinimized(false);
  const closeDeal = () => {
    setIsOpen(false);
    setIsMinimized(false);
    setTargetCompanyId(null);
    setEditingDeal(null);
    setDraftLabel('');
  };

  return (
    <ClosedDealDraftContext.Provider value={{
      isOpen, isMinimized, targetCompanyId, editingDeal, draftLabel,
      openDeal, minimizeDeal, expandDeal, closeDeal, setDraftLabel,
    }}>
      {children}
    </ClosedDealDraftContext.Provider>
  );
}

export function useClosedDealDraft() {
  return useContext(ClosedDealDraftContext);
}
