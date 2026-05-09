'use client';
import { useState, useEffect } from 'react';
import { DEFAULT_ROLE_CAPABILITIES, type UserRole, type RoleCapabilityMap } from './auth';
import { PLAN_CAPABILITIES, type PlanCapabilities, type PlanId } from './capabilities';
import type { TrialState } from './trialState';

export interface CapabilitiesState {
  role: UserRole;
  capabilities: RoleCapabilityMap;
  planId: PlanId;
  trialState: TrialState;
  daysRemaining: number | null;
  planCapabilities: PlanCapabilities;
  isImpersonating: boolean;
  impersonatedAccountId?: string;
  impersonatedCompanyName?: string;
}

let _cache: CapabilitiesState | null = null;
let _pending: Promise<CapabilitiesState | null> | null = null;

export function invalidateCapabilitiesCache() {
  _cache = null;
  _pending = null;
}

async function fetchCapabilities(): Promise<CapabilitiesState | null> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    const { user } = await res.json();
    if (!user?.role || !user?.capabilities) return null;
    return {
      role: user.role as UserRole,
      capabilities: user.capabilities as RoleCapabilityMap,
      planId: (user.planId ?? 'trial') as PlanId,
      trialState: (user.trialState ?? 'activated') as TrialState,
      daysRemaining: user.daysRemaining ?? null,
      planCapabilities: (user.planCapabilities ?? PLAN_CAPABILITIES['trial']) as PlanCapabilities,
      isImpersonating: user.isImpersonating === true,
      impersonatedAccountId: user.impersonatedAccountId as string | undefined,
      impersonatedCompanyName: user.impersonatedCompanyName as string | undefined,
    };
  } catch {
    return null;
  }
}

export function useCapabilities(): CapabilitiesState {
  const [state, setState] = useState<CapabilitiesState | null>(_cache);

  useEffect(() => {
    if (_cache) {
      setState(_cache);
      return;
    }
    if (!_pending) {
      _pending = fetchCapabilities().then(result => {
        _cache = result;
        _pending = null;
        return result;
      });
    }
    _pending.then(result => {
      if (result) setState(result);
    });
  }, []);

  return state ?? {
    role: 'user' as UserRole,
    capabilities: DEFAULT_ROLE_CAPABILITIES['user'],
    planId: 'trial' as PlanId,
    trialState: 'activated' as TrialState,
    daysRemaining: null,
    planCapabilities: PLAN_CAPABILITIES['trial'],
    isImpersonating: false,
  };
}
