import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { farmApi } from '@/api/farmApi';
import { cropApi } from '@/api/cropApi';
import { parseApiError } from '@/api/client';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/lib/i18n';
import { MapPin, Sprout, Layers, ArrowRight, Leaf, Sparkles, ScanSearch } from 'lucide-react';
import type { FarmResponseDto, CropResponseDto } from '@/types';

/**
 * Farm picker for farm-scoped utility tools (Smart Recommendations,
 * Disease Camera). Keeps the sidebar simple: the tool links here and the
 * farmer picks which farm to open the tool for.
 *
 * UX rules:
 *  - exactly one farm → skip the picker and open the tool directly
 *  - no farms yet → offer the Add Farm wizard instead of a dead end
 */
export function SelectFarmPage({ pathTemplate, icon: Icon }: { pathTemplate: string; icon: React.ElementType }) {
  const navigate = useNavigate();
  const [farms, setFarms] = useState<FarmResponseDto[]>([]);
  const [farmCrops, setFarmCrops] = useState<Record<string, CropResponseDto[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDiseaseDetection = pathTemplate.includes('disease-detection');

  useEffect(() => {
    farmApi.getAll()
      .then(async (f) => {
        setFarms(f);
        // Single farm: jump straight into the tool (replace so Back skips the picker)
        if (f.length === 1) {
          navigate(pathTemplate.replace(':farmId', f[0].id), { replace: true });
          return;
        }
        // Fetch crops for all farms in parallel to show active crops on cards
        const cropsResults = await Promise.all(
          f.map(async (farm) => {
            try {
              const crops = await cropApi.getByFarm(farm.id);
              return { farmId: farm.id, crops };
            } catch {
              return { farmId: farm.id, crops: [] };
            }
          }),
        );
        const cropsMap: Record<string, CropResponseDto[]> = {};
        for (const { farmId, crops } of cropsResults) {
          cropsMap[farmId] = crops;
        }
        setFarmCrops(cropsMap);
      })
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setLoading(false));
  }, [navigate, pathTemplate]);

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-8 animate-fade-in mx-auto max-w-3xl lg:max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Icon className="h-5 w-5 text-white" />
          </div>
          {t('nav.selectFarm')}
        </h1>
        <p className="text-gray-500 text-sm mt-1 ml-0 sm:ml-[52px]">{t('nav.selectFarmDescription')}</p>
      </div>

      {farms.length === 0 ? (
        <EmptyState
          icon={<Sprout className="h-16 w-16" />}
          title={t('nav.selectFarmNoFarms')}
          description={t('nav.selectFarmDescription')}
          action={{ label: t('dashboard.addFirstFarm'), onClick: () => navigate('/farms/new') }}
        />
      ) : (
        <>
          {/* Hero Quick Scan Banner (Disease Detection only) */}
          {isDiseaseDetection && (
            <div
              onClick={() => navigate('/utilities/quick-scan')}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-800 to-teal-900 p-8 lg:p-10 cursor-pointer group shadow-lg shadow-emerald-900/20"
            >
              {/* Decorative background circles */}
              <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/5" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
              <div className="absolute top-1/2 right-1/4 h-20 w-20 rounded-full bg-white/3" />

              <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                      <Sparkles className="h-5 w-5 text-emerald-200" />
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/15 text-emerald-100 uppercase tracking-wider backdrop-blur-sm ring-1 ring-white/10">
                      {t('disease.quickScanInstant')}
                    </span>
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-bold text-white leading-tight">
                    {t('disease.quickScanHeroTitle')}
                  </h2>
                  <p className="text-emerald-100/90 text-sm lg:text-base max-w-xl leading-relaxed">
                    {t('disease.quickScanHeroSubtitle')}
                  </p>
                </div>
                <div className="shrink-0">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2.5 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-emerald-800 shadow-lg shadow-black/10 hover:bg-emerald-50 hover:shadow-xl transition-all duration-200 group-hover:translate-x-0.5"
                  >
                    <ScanSearch className="h-5 w-5" />
                    {t('disease.quickScanHeroCta')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section heading for farms */}
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('disease.selectFarmHeading')}</h2>
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">{farms.length} {t('disease.farmsAvailable')}</span>
          </div>

          {/* Responsive Farm Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {farms.map((farm) => {
              const activeCrops = (farmCrops[farm.id] ?? []).filter(
                (c) => c.status?.toLowerCase() !== 'harvested',
              );
              return (
                <div
                  key={farm.id}
                  onClick={() => navigate(pathTemplate.replace(':farmId', farm.id))}
                  className="group relative bg-white rounded-2xl border border-slate-200 hover:border-emerald-500 p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-0.5"
                >
                  {/* Card header */}
                  <div className="flex items-start gap-3.5 mb-4">
                    <div className="relative h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center shrink-0 ring-1 ring-emerald-100/50">
                      <Sprout className="h-6 w-6 text-emerald-600" />
                      {activeCrops.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                          <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">{farm.farmName}</h3>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        <span className="truncate">{farm.tehsilName}, {farm.districtName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Farm size */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                    <Layers className="h-3 w-3 text-gray-400" />
                    <span>{farm.farmSize} {farm.farmSizeUnit}</span>
                  </div>

                  {/* Crop badges */}
                  <div className="mb-4">
                    {activeCrops.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {activeCrops.slice(0, 3).map((crop) => (
                          <span
                            key={crop.id}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10"
                          >
                            <Leaf className="h-3 w-3 text-emerald-500" />
                            {crop.cropName}
                          </span>
                        ))}
                        {activeCrops.length > 3 && (
                          <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500 ring-1 ring-inset ring-gray-200">
                            +{activeCrops.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200/60">
                        <Leaf className="h-3 w-3 text-slate-400" />
                        {t('disease.noActiveCrops')}
                      </span>
                    )}
                  </div>

                  {/* Select Farm action */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-xs font-semibold text-emerald-600 group-hover:text-emerald-700 transition-colors">
                      {t('disease.selectFarmButton')}
                    </span>
                    <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all duration-200" />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
