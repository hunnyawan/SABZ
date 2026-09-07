import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { farmApi } from '@/api/farmApi';
import { locationApi } from '@/api/locationApi';
import { parseApiError } from '@/api/client';
import { getGreeting } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { FarmForm } from '@/components/forms/FarmForm';
import { WeatherPreviewCard } from '@/components/dashboard/WeatherPreviewCard';
import { MandiTickerCard } from '@/components/dashboard/MandiTickerCard';
import { LocalWeatherWidget } from '@/components/dashboard/LocalWeatherWidget';
import { MandiRateWidget } from '@/components/dashboard/MandiRateWidget';
import { FarmRiskWidget } from '@/components/dashboard/FarmRiskWidget';
import { FarmCard } from '@/components/dashboard/FarmCard';
import { FarmListRow } from '@/components/dashboard/FarmListRow';
import { DailyTaskChecklist } from '@/components/dashboard/DailyTaskChecklist';
import { FloatingChatWidget } from '@/components/chat/FloatingChatWidget';
import {
  Plus,
  Sprout,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-react';
import type { FarmResponseDto, CreateFarmDto } from '@/types';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [farms, setFarms] = useState<FarmResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Daily Tasks sidebar collapse state (default collapsed)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Onboarding state (0-farm accounts)
  const [previewTehsilId, setPreviewTehsilId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  // View toggle & search
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadFarms();
  }, []);

  const loadFarms = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await farmApi.getAll();
      setFarms(data);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  // Widget tehsil for weather (prefer farm's tehsil, fall back to Chakwal)
  const [widgetTehsilId, setWidgetTehsilId] = useState<number | null>(null);

  // Default the weather preview to Lahore (Punjab) until the farmer picks
  // their own tehsil in the Add Your Farm wizard.
  useEffect(() => {
    if (loading || farms.length > 0) return;
    (async () => {
      try {
        const provinces = await locationApi.getProvinces();
        const punjab = provinces.find((p) => p.name.toLowerCase() === 'punjab') ?? provinces[0];
        if (!punjab) return;
        const districts = await locationApi.getDistricts(punjab.id);
        const lahore = districts.find((d) => d.name.toLowerCase().includes('lahore')) ?? districts[0];
        if (!lahore) return;
        const tehsils = await locationApi.getTehsils(lahore.id);
        const tehsil = tehsils.find((x) => x.latitude != null) ?? tehsils[0];
        if (tehsil) setPreviewTehsilId(tehsil.id);
      } catch { /* preview is a nice-to-have; ignore failures */ }
    })();
  }, [loading, farms.length]);

  // Load widget data when user has farms
  useEffect(() => {
    if (loading || farms.length === 0) return;

    // Weather: prefer first farm's tehsil, fall back to Chakwal
    const farmTehsilId = farms.find((f) => f.tehsilId != null)?.tehsilId;
    if (farmTehsilId != null) {
      setWidgetTehsilId(farmTehsilId);
    } else {
      (async () => {
        try {
          const provinces = await locationApi.getProvinces();
          const punjab = provinces.find((p) => p.name.toLowerCase() === 'punjab') ?? provinces[0];
          if (!punjab) return;
          const districts = await locationApi.getDistricts(punjab.id);
          const chakwal = districts.find((d) => d.name.toLowerCase().includes('chakwal')) ?? districts[0];
          if (!chakwal) return;
          const tehsils = await locationApi.getTehsils(chakwal.id);
          const tehsil = tehsils.find((x) => x.latitude != null) ?? tehsils[0];
          if (tehsil) setWidgetTehsilId(tehsil.id);
        } catch { /* widget is a nice-to-have */ }
      })();
    }

  }, [loading, farms]);

  const handleCreateFarm = async (data: CreateFarmDto) => {
    setCreating(true);
    try {
      const farm = await farmApi.create(data);
      navigate(`/farms/${farm.id}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error} onRetry={loadFarms} />;

  const greeting = getGreeting();
  const firstName = user?.fullName?.split(' ')[0] || 'Farmer';

  // Filter farms by name or location
  const filteredFarms = farms.filter((farm) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const location = [farm.tehsilName, farm.districtName, farm.provinceName]
      .filter(Boolean)
      .join(', ')
      .toLowerCase();
    return farm.farmName.toLowerCase().includes(q) || location.includes(q);
  });

  return (
    <div className={`space-y-8 animate-fade-in transition-all duration-300 ease-in-out ${isSidebarOpen ? 'lg:pr-88' : 'lg:pr-16'}`}>
      {/* AI Agronomist Chat — Dashboard only */}
      <FloatingChatWidget />

      {/* Daily AI Task Checklist — collapsible right sidebar */}
      {farms.length > 0 && (
        <DailyTaskChecklist
          farms={farms}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((prev) => !prev)}
        />
      )}
      {/* Welcome */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
          {greeting}, {firstName}
        </h1>
        <p className="text-gray-500 mt-1">
          {farms.length === 0
            ? t('dashboard.onboardingWelcome')
            : t('dashboard.subtitle')}
        </p>
      </div>

      {farms.length === 0 ? (
        /* ─── Onboarding: 2-column layout for 0-farm accounts ─── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: Add Your Farm wizard */}
          <Card>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-primary-700 flex items-center justify-center shrink-0">
                  <Sprout className="h-5 w-5 text-white" />
                </div>
                {t('dashboard.onboardingTitle')}
              </h2>
              <p className="text-sm text-gray-500 mt-1.5">
                {t('dashboard.onboardingSubtitle')}
              </p>
            </div>
            <FarmForm
              onSubmit={handleCreateFarm}
              loading={creating}
              submitLabel={t('dashboard.addFirstFarm')}
              onTehsilChange={(tehsil) => setPreviewTehsilId(tehsil.id)}
            />
          </Card>

          {/* Right: regional weather preview + local Mandi price ticker */}
          <div className="space-y-6">
            <WeatherPreviewCard tehsilId={previewTehsilId} />
            <MandiTickerCard />
          </div>
        </div>
      ) : (
        <>
          {/* Real-time widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <LocalWeatherWidget
              tehsilId={widgetTehsilId}
              locationLabel={farms[0]?.tehsilName || 'Chakwal'}
            />
            <MandiRateWidget />
            <FarmRiskWidget />
          </div>

          {/* Farms — toolbar + grid/list */}
          <div>
            {/* Section header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {t('dashboard.farmOverview')}
                {searchQuery && (
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({filteredFarms.length} of {farms.length})
                  </span>
                )}
              </h2>

              <div className="flex items-center gap-2 sm:ml-auto">
                {/* Search input */}
                {farms.length > 1 && (
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder={t('dashboard.searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full sm:w-52 pl-8 pr-8 py-1.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* View toggle */}
                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setViewMode('card')}
                    title="Card View"
                    className={`p-1.5 transition-colors ${
                      viewMode === 'card'
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    title="Compact List View"
                    className={`p-1.5 transition-colors border-l border-gray-200 ${
                      viewMode === 'list'
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>

                {/* Add Farm */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/farms/new')}
                >
                  <Plus className="h-4 w-4" />
                  {t('farm.add')}
                </Button>
              </div>
            </div>

            {/* Farm list header (list view only) */}
            {viewMode === 'list' && filteredFarms.length > 0 && (
              <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
                <div className="flex-1">{t('farm.name')}</div>
                <div className="hidden sm:block w-48 shrink-0">{t('farm.location')}</div>
                <div className="hidden md:block w-24 shrink-0 text-right">{t('farm.size')}</div>
                <div className="w-32 shrink-0 text-right">{t('crop.status')}</div>
              </div>
            )}

            {/* Card view */}
            {viewMode === 'card' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredFarms.map((farm) => (
                  <FarmCard key={farm.id} farm={farm} />
                ))}
              </div>
            )}

            {/* List view */}
            {viewMode === 'list' && (
              <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
                {filteredFarms.map((farm) => (
                  <FarmListRow key={farm.id} farm={farm} />
                ))}
              </div>
            )}

            {/* Empty search result */}
            {filteredFarms.length === 0 && searchQuery && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">
                  {t('common.noData')}
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-primary-700 font-medium mt-1 hover:underline"
                >
                  {t('common.clear')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
