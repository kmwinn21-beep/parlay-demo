import type { ProductRelevanceResult } from '@/lib/productRelevance';

const ROLE_STYLES = {
  decision_maker: { label: 'Decision Maker', bg: '#1D9E7518', text: '#1D9E75', border: '#1D9E7540' },
  influencer:     { label: 'Influencer',     bg: '#534AB718', text: '#534AB7', border: '#534AB740' },
  target_title:   { label: 'Target Title',   bg: '#EF9F2718', text: '#EF9F27', border: '#EF9F2740' },
} as const;

function ConfidenceDots({ level }: { level: 'high' | 'medium' | 'low' }) {
  const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  const color = level === 'high' ? '#1D9E75' : level === 'medium' ? '#EF9F27' : '#9ca3af';
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {[1, 2, 3].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: i <= filled ? color : '#e5e7eb' }}
        />
      ))}
    </div>
  );
}

export function ProductRelevanceSection({ results }: { results: ProductRelevanceResult[] }) {
  if (results.length === 0) return null;

  return (
    <div className="border-t border-gray-100 pt-2.5 mt-0.5">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
        Products to discuss
      </p>
      <div className="flex flex-col gap-1">
        {results.map(r => {
          const role = r.buyerRole ? ROLE_STYLES[r.buyerRole] : null;
          return (
            <div key={r.productId} className="flex items-center gap-2 min-w-0" style={{ height: 28 }}>
              {/* Category dot + product name */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: r.categoryColor ?? '#9ca3af' }}
                />
                <span className="text-xs font-medium text-gray-800 truncate">{r.productName}</span>
              </div>
              {/* Confidence dots */}
              <ConfidenceDots level={r.confidence} />
              {/* Buyer role badge */}
              {role ? (
                <span
                  className="text-[10px] font-medium rounded-full px-2 py-0.5 flex-shrink-0 border"
                  style={{ backgroundColor: role.bg, color: role.text, borderColor: role.border }}
                >
                  {role.label}
                </span>
              ) : (
                <span className="w-[80px] flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
