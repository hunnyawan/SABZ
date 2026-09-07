import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { monitoringApi } from '@/api/monitoringApi';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { t, isRtl } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  MapPin, Cloud, Sprout, ClipboardCheck, Bell,
  Droplets, Calendar, AlertTriangle, ShieldCheck, Loader2,
} from 'lucide-react';
import type {
  FarmResponseDto,
  MonitoringCheckDto,
} from '@/types';

/**
 * Enhanced farm card for the dashboard "Your Farms" section.
 * Fetches per-farm dashboard data to show a status badge, a mini metrics
 * grid (soil moisture, last irrigation, pest risk), and secondary action
 * buttons for quick navigation.
 */
export function FarmCard({ farm }: { farm: FarmResponseDto }) {
  const navigate = useNavigate();
  const [dueChecks, setDueChecks] = useState<MonitoringCheckDto[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    monitoringApi.getDue()
      .then((checks) => setDueChecks(checks.filter((c) => c.farmId === farm.id)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [farm.id]);

  // ── Real-time attention detection ───────────────────────────────
  // Badge is bound to active pest/disease/crop alerts from monitoring checks.
  // Only high-priority checks (pest scouting, disease inspection) trigger the badge.
  // When no high-priority alerts exist → pest risk is 'Low' → badge is hidden.
  const highPriorityChecks = dueChecks.filter((c) => c.priority === 'High');
  const hasActiveAlerts = highPriorityChecks.length > 0;

  // Pest risk derived from real due-check data
  const riskLevel: 'Low' | 'Medium' | 'High' =
    hasActiveAlerts
      ? 'High'
      : dueChecks.length > 0
        ? 'Medium'
        : 'Low';

  const location = [farm.provinceName, farm.districtName].filter(Boolean).join(', ');

  return (
    <Card hover onClick={() => navigate(`/farms/${farm.id}`)} padding="none">
      <div dir={isRtl() ? 'rtl' : ''}>
      {/* Top colour bar */}
      <div className="h-1.5 bg-gradient-to-r from-primary-500 to-primary-600 rounded-t-2xl" />

      <div className="p-5">
        {/* ── Farm header + status badge ─────────────────────────── */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{farm.farmName}</h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{location || t('farm.noLocation')}</span>
            </div>
          </div>

          {loaded ? (
            riskLevel === 'High' && (
              <Badge variant="warning" size="sm" className="shrink-0 ml-2">
                {t('farm.attentionNeeded')}
              </Badge>
            )
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-gray-300 shrink-0 ml-2" />
          )}
          {/* Badge visibility bound to riskLevel — hidden when pest risk is Low or Medium */}
        </div>

        {/* ── Mini metrics grid ──────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {/* Soil Moisture */}
          <MetricCell
            icon={Droplets}
            iconColor="text-sky-500"
            label={t('farm.soilTypeLabel')}
            value={farm.soilType || '—'}
          />

          {/* Irrigation */}
          <MetricCell
            icon={Calendar}
            iconColor="text-emerald-500"
            label={t('farm.irrigationLabel')}
            value={farm.irrigationType || '—'}
          />

          {/* Pest Risk */}
          <div className="flex flex-col items-center gap-1 p-2 rounded-xl bg-gray-50/80">
            {riskLevel === 'Low' ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle
                className={cn(
                  'h-4 w-4',
                  riskLevel === 'High' ? 'text-red-500' : 'text-amber-500',
                )}
              />
            )}
            <span
              className={cn(
                'text-[11px] font-semibold',
                riskLevel === 'Low'
                  ? 'text-emerald-600'
                  : riskLevel === 'High'
                    ? 'text-red-600'
                    : 'text-amber-600',
              )}
            >
              {riskLevel}
            </span>
            <span className="text-[9px] text-gray-400">{t('farm.pestRisk')}</span>
          </div>
        </div>

        {/* ── Action buttons (secondary navigation) ──────────────── */}
        <div className="flex gap-2 pt-3 border-t border-gray-100">
          <ActionBtn
            icon={Cloud}
            label={t('farmDetail.weather')}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/farms/${farm.id}/weather`);
            }}
          />
          <ActionBtn
            icon={Sprout}
            label={t('farmDetail.crops')}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/farms/${farm.id}/crops`);
            }}
          />
          <ActionBtn
            icon={ClipboardCheck}
            label={t('farmDetail.monitoring')}
            onClick={(e) => {
              e.stopPropagation();
              navigate('/monitoring');
            }}
          />
          <ActionBtn
            icon={Bell}
            label={t('farm.alerts')}
            onClick={(e) => {
              e.stopPropagation();
              navigate('/notifications');
            }}
          />
        </div>
      </div>
      </div>
    </Card>
  );
}

/* ─── Metric Cell ────────────────────────────────────────────────── */
function MetricCell({
  icon: Icon,
  iconColor,
  label,
  value,
}: {
  icon: typeof Droplets;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-xl bg-gray-50/80">
      <Icon className={cn('h-4 w-4', iconColor)} />
      <span className="text-[11px] font-semibold text-gray-800 truncate max-w-full">
        {value}
      </span>
      <span className="text-[9px] text-gray-400">{label}</span>
    </div>
  );
}

/* ─── Action Button ──────────────────────────────────────────────── */
function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Cloud;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-primary-700 hover:bg-primary-50 transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
