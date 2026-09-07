import { useEffect, useState } from 'react';
import { cropPriceApi } from '@/api/cropPriceApi';
import { Card } from '@/components/ui/Card';
import { TrendingUp, Loader2, Calendar } from 'lucide-react';
import type { CropPriceRecordDto } from '@/types';

/** Format an ISO date string to a short human-readable label. */
function formatPriceDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/**
 * Compact Mandi rate highlights widget for the dashboard hero row.
 * Fetches the commodity price feed from the backend /api/crop-prices endpoint,
 * picks the 2 most recently priced commodities, and displays item name,
 * latest price, unit, and price date — fully dynamic, nothing hardcoded.
 */
export function MandiRateWidget() {
  const [items, setItems] = useState<CropPriceRecordDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    cropPriceApi
      .getPrices({ page: 1, pageSize: 20 })
      .then((r) => {
        // Pick the 2 most recently priced commodities (deduplicate by crop name,
        // keeping the latest record per crop, then sort by date descending).
        const latestByCrop = new Map<string, CropPriceRecordDto>();
        for (const rec of r.items) {
          const existing = latestByCrop.get(rec.cropName);
          if (!existing || new Date(rec.priceDate) > new Date(existing.priceDate)) {
            latestByCrop.set(rec.cropName, rec);
          }
        }
        const sorted = [...latestByCrop.values()]
          .sort((a, b) => new Date(b.priceDate).getTime() - new Date(a.priceDate).getTime());
        setItems(sorted.slice(0, 2));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card padding="none" className="overflow-hidden bg-emerald-50/60 border-emerald-100">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-900">Mandi Rates</p>
          <p className="text-[10px] text-gray-500">Crop Prices</p>
        </div>
      </div>

      <div className="px-4 pb-4">
        {loading ? (
          <div className="h-16 flex items-center justify-center text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-16 flex items-center justify-center">
            <p className="text-[11px] text-gray-400">No rates available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={`${item.cropName}-${i}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">{item.cropName}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-700">
                      PKR {item.price.toLocaleString('en-PK')}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-1">/{item.unit}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.market && (
                    <span className="text-[9px] text-gray-400 truncate">{item.market}</span>
                  )}
                  {item.priceDate && (
                    <span className="text-[9px] text-gray-400 flex items-center gap-0.5 ml-auto">
                      <Calendar className="h-2 w-2" />
                      {formatPriceDate(item.priceDate)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
