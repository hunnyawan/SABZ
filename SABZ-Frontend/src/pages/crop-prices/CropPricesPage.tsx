import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cropPriceApi, type CropPriceFilters } from '@/api/cropPriceApi';
import { parseApiError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { formatDate, cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { TrendingUp, TrendingDown, Minus, Search, MapPin, Store, Calendar, RotateCcw, ChevronDown, Star, Bell, X } from 'lucide-react';
import type { CropPriceRecordDto, CropPricePagedResultDto } from '@/types';

export function CropPricesPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<CropPricePagedResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [crop, setCrop] = useState('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [market, setMarket] = useState('');
  const [page, setPage] = useState(1);

  // ── Favorites (pinned crops) ───────────────────────────────────────────
  const [favoriteCrops, setFavoriteCrops] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sabz.favoriteCrops') || '[]'); } catch { return []; }
  });

  // ── Price alerts ───────────────────────────────────────────────────────
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertCrop, setAlertCrop] = useState('');
  const [alertMarket, setAlertMarket] = useState('');
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertSaved, setAlertSaved] = useState(false);

  // ── Broad data for trend computation + crop dropdown ───────────────────
  const [broadItems, setBroadItems] = useState<CropPriceRecordDto[]>([]);

  // ── Filter option pools (fetched once on mount for cascading dropdowns) ──
  const [allProvinces, setAllProvinces] = useState<string[]>([]);
  const [allDistrictsByProvince, setAllDistrictsByProvince] = useState<Record<string, string[]>>({});
  const [allMarketsByDistrict, setAllMarketsByDistrict] = useState<Record<string, string[]>>({});

  // Fetch a broad sample of crop prices to extract unique location options + trend data
  useEffect(() => {
    cropPriceApi.getPrices({ page: 1, pageSize: 500 }).then((data) => {
      setBroadItems(data.items);

      const provinces = new Set<string>();
      const distMap: Record<string, Set<string>> = {};
      const mktMap: Record<string, Set<string>> = {};

      for (const r of data.items) {
        provinces.add(r.province);
        const pKey = r.province;
        if (!distMap[pKey]) distMap[pKey] = new Set();
        distMap[pKey].add(r.district);
        const dKey = `${r.province}::${r.district}`;
        if (!mktMap[dKey]) mktMap[dKey] = new Set();
        mktMap[dKey].add(r.market);
      }

      setAllProvinces([...provinces].sort());
      setAllDistrictsByProvince(
        Object.fromEntries([...Object.entries(distMap)].map(([k, v]) => [k, [...v].sort()])),
      );
      setAllMarketsByDistrict(
        Object.fromEntries([...Object.entries(mktMap)].map(([k, v]) => [k, [...v].sort()])),
      );
    }).catch(() => {});
  }, []);

  // ── Cascading filter options ──────────────────────────────────────────────
  const districtOptions = useMemo(() => {
    if (!province) return [...new Set(Object.values(allDistrictsByProvince).flat())].sort();
    return allDistrictsByProvince[province] ?? [];
  }, [province, allDistrictsByProvince]);

  const marketOptions = useMemo(() => {
    if (!district) {
      // Show all markets across all districts (optionally scoped by province)
      const keys = province
        ? Object.keys(allMarketsByDistrict).filter((k) => k.startsWith(`${province}::`))
        : Object.keys(allMarketsByDistrict);
      return [...new Set(keys.flatMap((k) => allMarketsByDistrict[k]))].sort();
    }
    const key = `${province || ''}::${district}`;
    // Try exact match first, then fallback to any district with that name
    if (allMarketsByDistrict[key]) return allMarketsByDistrict[key];
    return [...new Set(
      Object.entries(allMarketsByDistrict)
        .filter(([, districts]) => true)
        .flatMap(([k, v]) => k.endsWith(`::${district}`) ? v : []),
    )].sort();
  }, [province, district, allMarketsByDistrict]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: CropPriceFilters = { page, pageSize: 20 };
      if (crop.trim()) filters.crop = crop.trim();
      if (province) filters.province = province;
      if (district) filters.district = district;
      if (market) filters.market = market;
      const data = await cropPriceApi.getPrices(filters);
      setResult(data);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [crop, province, district, market, page]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => {
    setCrop('');
    setProvince('');
    setDistrict('');
    setMarket('');
    setPage(1);
  };

  const handleProvinceChange = (value: string) => {
    setProvince(value);
    setDistrict('');
    setMarket('');
    setPage(1);
  };

  const handleDistrictChange = (value: string) => {
    setDistrict(value);
    setMarket('');
    setPage(1);
  };

  const handleMarketChange = (value: string) => {
    setMarket(value);
    setPage(1);
  };

  const hasFilters = crop || province || district || market;

  // ── Price trend computation (compare each crop's price to its previous date) ──
  const priceTrendMap = useMemo(() => {
    const map = new Map<string, { pct: number; direction: 'up' | 'down' | 'flat' }>();
    const byCrop: Record<string, CropPriceRecordDto[]> = {};
    for (const item of broadItems) {
      if (!byCrop[item.cropName]) byCrop[item.cropName] = [];
      byCrop[item.cropName].push(item);
    }
    for (const [cropName, records] of Object.entries(byCrop)) {
      const uniqueDates = [...new Set(records.map((r) => r.priceDate))].sort();
      if (uniqueDates.length < 2) continue;
      const latestDate = uniqueDates[uniqueDates.length - 1];
      const prevDate = uniqueDates[uniqueDates.length - 2];
      const latestPrices = records.filter((r) => r.priceDate === latestDate);
      const prevPrices = records.filter((r) => r.priceDate === prevDate);
      if (latestPrices.length === 0 || prevPrices.length === 0) continue;
      const latestAvg = latestPrices.reduce((s, r) => s + r.price, 0) / latestPrices.length;
      const prevAvg = prevPrices.reduce((s, r) => s + r.price, 0) / prevPrices.length;
      if (prevAvg === 0) continue;
      const pct = ((latestAvg - prevAvg) / prevAvg) * 100;
      map.set(cropName, { pct: Math.abs(pct), direction: pct > 0.01 ? 'up' : pct < -0.01 ? 'down' : 'flat' });
    }
    return map;
  }, [broadItems]);

  // ── Unique crop names (for alert modal dropdown) ─────────────────────────
  const uniqueCrops = useMemo(
    () => [...new Set(broadItems.map((i) => i.cropName))].sort(),
    [broadItems],
  );

  // ── Unique markets (for alert modal dropdown) ────────────────────────────
  const uniqueMarkets = useMemo(
    () => [...new Set(broadItems.map((i) => i.market))].sort(),
    [broadItems],
  );

  // ── Toggle favorite crop ─────────────────────────────────────────────────
  const toggleFavorite = (cropName: string) => {
    setFavoriteCrops((prev) => {
      const next = prev.includes(cropName) ? prev.filter((c) => c !== cropName) : [...prev, cropName];
      localStorage.setItem('sabz.favoriteCrops', JSON.stringify(next));
      return next;
    });
  };

  // ── Sort display items: favorites first, then original order ─────────────
  const displayItems = useMemo(() => {
    if (!result) return [];
    return [...result.items].sort((a, b) => {
      const aFav = favoriteCrops.includes(a.cropName) ? 0 : 1;
      const bFav = favoriteCrops.includes(b.cropName) ? 0 : 1;
      return aFav - bFav;
    });
  }, [result, favoriteCrops]);

  if (loading && !result) return <PageSkeleton />;
  if (error && !result) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          {t('cropPrices.title')}
        </h1>
        <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">{t('cropPrices.description')}</p>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          {/* Crop search */}
          <div className="flex-1 min-w-[150px] sm:min-w-[200px]">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">{t('common.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={crop}
                onChange={(e) => { setCrop(e.target.value); setPage(1); }}
                placeholder={t('cropPrices.searchCrop')}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Province dropdown */}
          <div className="w-full sm:w-40">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">{t('farm.province')}</label>
            <div className="relative">
              <select
                value={province}
                onChange={(e) => handleProvinceChange(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 truncate"
              >
                <option value="">{t('cropPrices.allProvinces')}</option>
                {allProvinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>
          </div>

          {/* District dropdown (cascading) */}
          <div className="w-full sm:w-36">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">{t('farm.district')}</label>
            <div className="relative">
              <select
                value={district}
                onChange={(e) => handleDistrictChange(e.target.value)}
                disabled={!province && districtOptions.length === 0}
                className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:bg-gray-50 truncate"
              >
                <option value="">{t('prices.allDistricts')}</option>
                {districtOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>
          </div>

          {/* Market dropdown (cascading) */}
          <div className="w-full sm:w-36">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">{t('cropPrices.market')}</label>
            <div className="relative">
              <select
                value={market}
                onChange={(e) => handleMarketChange(e.target.value)}
                disabled={marketOptions.length === 0}
                className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:bg-gray-50 truncate"
              >
                <option value="">{t('prices.allMarkets')}</option>
                {marketOptions.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>
          </div>

          {/* Reset Filters button */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 ring-1 ring-red-200/60 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t('common.clear')}
            </button>
          )}

          {/* Set Price Alert button */}
          <button
            onClick={() => setShowAlertModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 ring-1 ring-indigo-200/60 transition-colors"
          >
            <Bell className="h-3.5 w-3.5" /> {t('prices.setAlert')}
          </button>
        </div>
      </Card>

      {result && result.dataStatus && (
        <p className="text-xs text-gray-500 ml-1">{result.dataStatus}</p>
      )}

      {/* Results */}
      {result && result.items.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-16 w-16" />}
          title={t('cropPrices.noData')}
        />
      ) : result && (
        <div className="space-y-3">
          <div className="w-full overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm md:text-base min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 sm:px-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">{t('prices.crop')}</th>
                  <th className="text-left py-2 px-2 sm:px-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">{t('prices.price')}</th>
                  <th className="text-left py-2 px-2 sm:px-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">{t('prices.trend')}</th>
                  <th className="text-left py-2 px-2 sm:px-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('prices.location')}</th>
                  <th className="text-left py-2 px-2 sm:px-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('farm.district')}</th>
                  <th className="text-left py-2 px-2 sm:px-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('farm.province')}</th>
                  <th className="text-left py-2 px-2 sm:px-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('prices.date')}</th>
                  <th className="text-left py-2 px-2 sm:px-3 text-[10px] font-medium text-gray-500 uppercase tracking-wider">{t('crop.status')}</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((record, i) => (
                  <PriceRow
                    key={`${record.cropName}-${record.market}-${record.priceDate}-${i}`}
                    record={record}
                    trend={priceTrendMap.get(record.cropName)}
                    isFavorite={favoriteCrops.includes(record.cropName)}
                    onToggleFavorite={() => toggleFavorite(record.cropName)}
                    onClick={() => navigate(`/crop-prices/${encodeURIComponent(record.cropName)}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {result.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t('common.previous')}
              </Button>
              <span className="flex items-center text-xs text-gray-500">{result.page} / {result.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= result.totalPages} onClick={() => setPage((p) => p + 1)}>
                {t('common.next')}
              </Button>
            </div>
          )}

          {result.disclaimer && (
            <p className="text-[10px] text-gray-400 text-center">{result.disclaimer}</p>
          )}
        </div>
      )}

      {/* Price Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-gray-900">{t('prices.setAlert')}</h3>
              </div>
              <button
                onClick={() => { setShowAlertModal(false); setAlertSaved(false); }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {alertSaved ? (
                <div className="text-center py-6">
                  <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                    <Bell className="h-6 w-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">Alert Saved!</p>
                  <p className="text-xs text-gray-500">You'll be notified when <strong>{alertCrop}</strong> reaches your target price.</p>
                </div>
              ) : (
                <>
                  {/* Crop select */}
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">{t('prices.crop')}</label>
                    <select
                      value={alertCrop}
                      onChange={(e) => setAlertCrop(e.target.value)}
                      className="w-full appearance-none px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select a crop…</option>
                      {uniqueCrops.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {/* Market select */}
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">{t('prices.location')}</label>
                    <select
                      value={alertMarket}
                      onChange={(e) => setAlertMarket(e.target.value)}
                      className="w-full appearance-none px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Any market</option>
                      {uniqueMarkets.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {/* Target price */}
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">{t('prices.targetPrice')}</label>
                    <input
                      type="number"
                      value={alertTargetPrice}
                      onChange={(e) => setAlertTargetPrice(e.target.value)}
                      placeholder="e.g. 8500"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}
            </div>
            {!alertSaved && (
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => { setShowAlertModal(false); setAlertSaved(false); }}
                  className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (!alertCrop || !alertTargetPrice) return;
                    // Save alert to localStorage (no backend endpoint yet)
                    const alerts = JSON.parse(localStorage.getItem('sabz.priceAlerts') || '[]');
                    alerts.push({
                      id: crypto.randomUUID(),
                      crop: alertCrop,
                      market: alertMarket || 'Any',
                      targetPrice: Number(alertTargetPrice),
                      createdAt: new Date().toISOString(),
                    });
                    localStorage.setItem('sabz.priceAlerts', JSON.stringify(alerts));
                    setAlertSaved(true);
                  }}
                  disabled={!alertCrop || !alertTargetPrice}
                  className="flex-1 px-4 py-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50 border-l border-indigo-500"
                >
                  {t('prices.saveAlert')}
                </button>
              </div>
            )}
            {alertSaved && (
              <div className="border-t border-gray-100">
                <button
                  onClick={() => { setShowAlertModal(false); setAlertSaved(false); setAlertCrop(''); setAlertMarket(''); setAlertTargetPrice(''); }}
                  className="w-full px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  {t('common.done')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PriceRow({ record, trend, isFavorite, onToggleFavorite, onClick }: {
  record: CropPriceRecordDto;
  trend?: { pct: number; direction: 'up' | 'down' | 'flat' };
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors',
        isFavorite && 'bg-amber-50/40 hover:bg-amber-50/70',
      )}
    >
      <td className="py-2.5 px-2 sm:py-3 sm:px-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={cn(
              'shrink-0 transition-colors',
              isFavorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300',
            )}
            title={isFavorite ? 'Unpin crop' : 'Pin crop to top'}
          >
            <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
          </button>
          <span className="font-medium text-gray-900 truncate text-xs sm:text-sm">{record.cropName}</span>
        </div>
      </td>
      <td className="py-2.5 px-2 sm:py-3 sm:px-3">
        <span className="font-bold text-primary-700 text-xs sm:text-sm">
          PKR {record.price.toLocaleString('en-PK')}
        </span>
        <span className="text-[10px] sm:text-xs text-gray-400 ml-1">/{record.unit}</span>
      </td>
      <td className="py-2.5 px-2 sm:py-3 sm:px-3">
        {trend ? (
          <span className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
            trend.direction === 'up' && 'bg-emerald-50 text-emerald-700',
            trend.direction === 'down' && 'bg-red-50 text-red-700',
            trend.direction === 'flat' && 'bg-gray-100 text-gray-500',
          )}>
            {trend.direction === 'up' && <TrendingUp className="h-3 w-3" />}
            {trend.direction === 'down' && <TrendingDown className="h-3 w-3" />}
            {trend.direction === 'flat' && <Minus className="h-3 w-3" />}
            {trend.pct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-[10px] text-gray-400">—</span>
        )}
      </td>
      <td className="py-2.5 px-2 sm:py-3 sm:px-3 text-gray-600 hidden md:table-cell">
        <span className="flex items-center gap-1 text-xs sm:text-sm"><Store className="h-3 w-3 text-gray-400" />{record.market}</span>
      </td>
      <td className="py-2.5 px-2 sm:py-3 sm:px-3 text-gray-600 hidden md:table-cell text-xs sm:text-sm">{record.district}</td>
      <td className="py-2.5 px-2 sm:py-3 sm:px-3 text-gray-600 hidden lg:table-cell">
        <span className="flex items-center gap-1 text-xs sm:text-sm"><MapPin className="h-3 w-3 text-gray-400" />{record.province}</span>
      </td>
      <td className="py-2.5 px-2 sm:py-3 sm:px-3 text-gray-500 text-[10px] sm:text-xs hidden lg:table-cell">
        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(record.priceDate)}</span>
      </td>
      <td className="py-2.5 px-2 sm:py-3 sm:px-3">
        <Badge variant={record.dataStatus === 'Live' ? 'success' : 'warning'} size="sm">
          {record.dataStatus}
        </Badge>
      </td>
    </tr>
  );
}
