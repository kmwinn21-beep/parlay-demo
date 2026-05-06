'use client';
import { useState } from 'react';

export function StrategyWeightNotice({ applied, strategyLabel }: { applied?: boolean; strategyLabel?: string }) {
  const [open, setOpen] = useState(false);
  if (!applied) return null;
  return <>
    <div className="mt-1 text-[11px] text-gray-500 text-right flex items-center justify-end gap-1">Strategy-adjusted weights applied <button type="button" className="text-gray-400" onClick={()=>setOpen(true)} aria-label="Why weights changed">ⓘ</button></div>
    {open && <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={()=>setOpen(false)}><div className="bg-white rounded-xl p-4 max-w-md w-full" onClick={(e)=>e.stopPropagation()}><div className="font-semibold text-sm mb-2">Why did the weights change?</div><p className="text-xs text-gray-600">This conference is being evaluated using strategy-adjusted weights based on the selected Conference Strategy. The underlying score components did not change, but their weights were adjusted so the event is judged more appropriately based on its intended purpose.</p><p className="text-xs text-gray-600 mt-2">Conference Strategy: <span className="font-medium">{strategyLabel || 'Not set'}</span></p><div className="mt-3 text-right"><button className="text-xs text-brand-secondary" onClick={()=>setOpen(false)}>Close</button></div></div></div>}
  </>;
}
