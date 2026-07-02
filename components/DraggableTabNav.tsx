'use client';
import { useState, type CSSProperties } from 'react';

export interface DraggableTab {
  key: string;
  label: string;
}

// Reusable drag-to-reorder tab bar. Reordering only rearranges the currently
// visible tabs — persisting/hiding tabs is still done in Admin → Section Management.
export function DraggableTabNav({
  tabs,
  activeKey,
  onSelect,
  onReorder,
  renderTab,
}: {
  tabs: DraggableTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  onReorder: (newOrderKeys: string[]) => void;
  renderTab: (tab: DraggableTab, isActive: boolean) => { className?: string; style?: CSSProperties };
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleDrop = (targetKey: string) => {
    const keys = tabs.map(t => t.key);
    const fromIdx = dragKey ? keys.indexOf(dragKey) : -1;
    const toIdx = keys.indexOf(targetKey);
    if (dragKey && dragKey !== targetKey && fromIdx !== -1 && toIdx !== -1) {
      const next = [...keys];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragKey);
      onReorder(next);
    }
    setDragKey(null);
    setDragOverKey(null);
  };

  return (
    <nav className="flex gap-0 px-4">
      {tabs.map(t => {
        const isActive = activeKey === t.key;
        const { className, style } = renderTab(t, isActive);
        const isDragTarget = dragOverKey === t.key && dragKey != null && dragKey !== t.key;
        return (
          <button
            key={t.key}
            type="button"
            draggable
            onDragStart={() => setDragKey(t.key)}
            onDragOver={e => { e.preventDefault(); if (dragOverKey !== t.key) setDragOverKey(t.key); }}
            onDragLeave={() => setDragOverKey(prev => (prev === t.key ? null : prev))}
            onDrop={e => { e.preventDefault(); handleDrop(t.key); }}
            onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
            onClick={() => onSelect(t.key)}
            title="Drag to reorder tabs"
            className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-grab active:cursor-grabbing
              ${isDragTarget ? 'bg-gray-100' : ''} ${dragKey === t.key ? 'opacity-40' : ''} ${className ?? ''}`}
            style={style}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
