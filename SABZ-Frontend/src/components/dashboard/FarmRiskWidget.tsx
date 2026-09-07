import { useEffect, useState } from 'react';
import { monitoringApi } from '@/api/monitoringApi';
import { Card } from '@/components/ui/Card';
import { AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import type { MonitoringCheckDto } from '@/types';

const PRIORITY_STYLES: Record<string, string> = {
  High: 'text-red-600 bg-red-50',
  Medium: 'text-amber-600 bg-amber-50',
  Low: 'text-sky-600 bg-sky-50',
};

/**
 * Active farm risk status widget for the dashboard hero row.
 * Shows due monitoring checks that may indicate pest/disease pressure.
 */
export function FarmRiskWidget() {
  const [checks, setChecks] = useState<MonitoringCheckDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    monitoringApi.getDue()
      .then((data) => setChecks(data.slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const highRisk = checks.filter((c) => c.priority === 'High');

  return (
    <Card padding="none" className="overflow-hidden bg-amber-50/60 border-amber-100">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          {checks.length > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-900">Farm Risk Status</p>
          <p className="text-[10px] text-gray-500">Pest &amp; Disease</p>
        </div>
        {checks.length > 0 && (
          <span className="ml-auto text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
            {checks.length}
          </span>
        )}
      </div>

      <div className="px-4 pb-4">
        {loading ? (
          <div className="h-16 flex items-center justify-center text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : checks.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-[11px] font-medium">All clear — no active risks</p>
          </div>
        ) : (
          <div className="space-y-2">
            {highRisk.length > 0 && (
              <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">
                {highRisk.length} immediate warning{highRisk.length > 1 ? 's' : ''}
              </p>
            )}
            {checks.map((check) => {
              const priority = check.priority in PRIORITY_STYLES ? check.priority : 'Low';
              return (
                <div key={check.id} className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${PRIORITY_STYLES[priority]}`}>
                    {priority}
                  </span>
                  <span className="text-[11px] text-gray-700 truncate flex-1">{check.cropName}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{check.title}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
