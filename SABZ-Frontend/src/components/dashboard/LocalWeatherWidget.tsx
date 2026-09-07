import { useEffect, useState } from 'react';
import { weatherApi } from '@/api/weatherApi';
import { Card } from '@/components/ui/Card';
import { getWeatherInfo } from '@/lib/weatherCodes';
import { getSprayAdvisory, getConditionIcon } from '@/lib/sprayAdvisory';
import { MapPin, Droplets, Wind, CloudOff, Loader2 } from 'lucide-react';
import type { WeatherPreviewDto } from '@/types';

interface LocalWeatherWidgetProps {
  tehsilId: number | null;
  locationLabel?: string;
}

/**
 * Smart Spray & Weather Advisory widget for the dashboard hero row.
 * Replaces the old "Weather Alert" card with dynamic spray advisory logic
 * based on precipitation probability, wind speed, and temperature.
 */
export function LocalWeatherWidget({ tehsilId, locationLabel }: LocalWeatherWidgetProps) {
  const [data, setData] = useState<WeatherPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (tehsilId == null) return;
    setLoading(true);
    setError(false);
    weatherApi.getPreview(tehsilId)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tehsilId]);

  const cw = data?.current;
  const todayForecast = data?.forecast?.days?.[0];
  const info = getWeatherInfo(cw?.weatherCode ?? null);
  const Icon = info.icon;

  // Build the advisory input from current + forecast data
  const advisory = getSprayAdvisory({
    temperature: cw?.temperature,
    windSpeed: cw?.windSpeed,
    precipitationProbability: todayForecast?.precipitationProbability,
  });
  const AdvisoryIcon = advisory.icon;

  // Small condition icon next to the temperature reading
  const ConditionIcon = getConditionIcon({
    temperature: cw?.temperature,
    windSpeed: cw?.windSpeed,
    precipitationProbability: todayForecast?.precipitationProbability,
  });

  return (
    <Card padding="none" className="overflow-hidden border-sky-100">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
          <MapPin className="h-3.5 w-3.5 text-sky-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">
            {locationLabel || data?.locationName || 'Local Weather'}
          </p>
          <p className="text-[10px] font-bold text-gray-700">Spray Advisory</p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Loading state */}
        {loading && (
          <div className="h-16 flex items-center justify-center text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        {/* Error / unavailable — show a neutral advisory instead of "Unavailable" */}
        {!loading && (error || !data) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <CloudOff className="h-4 w-4 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500">Weather Unavailable</span>
            </div>
            <p className="text-[10px] text-gray-400">
              Unable to fetch weather data. Check your connection or try again later.
            </p>
          </div>
        )}

        {/* Data loaded — show temperature + advisory */}
        {!loading && data && (
          <>
            {/* Temperature row with condition icon */}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                <Icon className="h-7 w-7 text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <p className="text-2xl font-bold text-gray-900 leading-none">
                    {cw?.temperature != null ? Math.round(cw.temperature) : '--'}
                  </p>
                  <span className="text-sm font-medium text-gray-400">°C</span>
                  <ConditionIcon className="h-4 w-4 text-sky-500 ml-1" />
                </div>
                <p className="text-[11px] text-gray-500 mt-1 truncate">{info.label}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <div className="flex items-center gap-1 text-[11px] text-sky-700 justify-end">
                  <Droplets className="h-3 w-3" />
                  <span className="font-medium">
                    {todayForecast?.precipitationProbability != null
                      ? `${todayForecast.precipitationProbability}%`
                      : cw?.precipitation != null
                        ? `${cw.precipitation} mm`
                        : '--'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-sky-700 justify-end">
                  <Wind className="h-3 w-3" />
                  <span className="font-medium">
                    {cw?.windSpeed != null ? `${Math.round(cw.windSpeed)} km/h` : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Dynamic spray advisory banner */}
            <div className={`rounded-lg border ${advisory.borderColor} ${advisory.colorCode} px-3 py-2.5`}>
              <div className="flex items-start gap-2">
                <AdvisoryIcon className={`h-4 w-4 ${advisory.textColor} mt-0.5 shrink-0`} />
                <div className="min-w-0">
                  <p className={`text-[11px] font-bold ${advisory.textColor}`}>
                    {advisory.status}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5 leading-snug">
                    {advisory.message}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
