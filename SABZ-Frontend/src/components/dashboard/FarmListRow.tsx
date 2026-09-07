import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { monitoringApi } from '@/api/monitoringApi';
import { Badge } from '@/components/ui/Badge';
import { MapPin, Loader2 } from 'lucide-react';
import { t, isRtl } from '@/lib/i18n';
import { translateUnit } from '@/lib/farmTranslations';
import type { FarmResponseDto, MonitoringCheckDto } from '@/types';

/**
 * Single-row farm entry for the compact list view on the dashboard.
 * Fetches real-time monitoring checks to derive the
 * same conditional status badge as FarmCard.
 */
export function FarmListRow({ farm }: { farm: FarmResponseDto }) {
  const navigate = useNavigate();
  const [dueChecks, setDueChecks] = useState<MonitoringCheckDto[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    monitoringApi.getDue()
      .then((checks) => setDueChecks(checks.filter((c) => c.farmId === farm.id)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [farm.id]);

  // Same attention logic as FarmCard: badge only for high-priority monitoring alerts.
  const highPriority = dueChecks.filter((c) => c.priority === 'High');
  const hasActiveAlerts = highPriority.length > 0;
  const riskLevel: 'Low' | 'Medium' | 'High' =
    hasActiveAlerts
      ? 'High'
      : dueChecks.length > 0
        ? 'Medium'
        : 'Low';

  const location = [farm.tehsilName, farm.districtName, farm.provinceName]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      onClick={() => navigate(`/farms/${farm.id}`)}
      className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group"
      dir={isRtl() ? 'rtl' : ''}
    >
      {/* Farm name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary-700 transition-colors">
          {farm.farmName}
        </p>
      </div>

      {/* Location */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 w-48 shrink-0 min-w-0">
        <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
        <span className="truncate">{location || t('farm.noLocation')}</span>
      </div>

      {/* Acreage */}
      <div className="hidden md:block text-xs text-gray-600 w-24 shrink-0 text-right">
        <span className="font-medium">{farm.farmSize}</span>
        <span className="text-gray-400 ml-1">{translateUnit(farm.farmSizeUnit)}</span>
      </div>

      {/* Status badge — bound to riskLevel, hidden when pest risk is Low */}
      <div className="shrink-0 w-32 flex justify-end">
        {loaded ? (
          riskLevel === 'High' && (
            <Badge variant="warning" size="sm">
              {t('farm.attentionNeeded')}
            </Badge>
          )
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300" />
        )}
      </div>
    </div>
  );
}
