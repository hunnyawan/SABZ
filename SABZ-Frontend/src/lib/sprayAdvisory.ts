import { Sun, CloudRain, Wind, AlertTriangle, ShieldCheck, AlertOctagon, type LucideIcon } from 'lucide-react';

export type SprayStatus = 'Safe' | 'Warning' | 'Danger';

export interface SprayAdvisory {
  status: SprayStatus;
  message: string;
  colorCode: string;      // Tailwind bg class for the advisory banner
  textColor: string;      // Tailwind text class
  borderColor: string;    // Tailwind border class
  icon: LucideIcon;
}

interface SprayWeatherInput {
  temperature?: number | null;
  windSpeed?: number | null;
  precipitationProbability?: number | null;
}

/**
 * Smart spray advisory based on current weather conditions.
 *
 * Decision rules (evaluated in priority order):
 *   1. Danger  — rain probability > 40 % OR wind > 15 km/h
 *   2. Warning — temperature > 35 °C
 *   3. Safe    — everything else
 */
export function getSprayAdvisory(weather: SprayWeatherInput): SprayAdvisory {
  const rain = weather.precipitationProbability ?? 0;
  const wind = weather.windSpeed ?? 0;
  const temp = weather.temperature ?? 25;

  // Danger: high rain or wind risk
  if (rain > 40 || wind > 15) {
    const reason = rain > 40 && wind > 15
      ? 'rain and wind'
      : rain > 40
        ? 'rain'
        : 'wind';
    return {
      status: 'Danger',
      message: `\u{1F534} DO NOT SPRAY! High risk of chemical wash-off or drift due to ${reason}.`,
      colorCode: 'bg-red-50',
      textColor: 'text-red-700',
      borderColor: 'border-red-200',
      icon: AlertOctagon,
    };
  }

  // Warning: extreme heat
  if (temp > 35) {
    return {
      status: 'Warning',
      message: '\u{1F7E1} CAUTION: High temperature. Spray early morning or late evening.',
      colorCode: 'bg-amber-50',
      textColor: 'text-amber-700',
      borderColor: 'border-amber-200',
      icon: AlertTriangle,
    };
  }

  // Safe: optimal conditions
  return {
    status: 'Safe',
    message: '\u{1F7E2} CLEAR: Optimal conditions for fertilizer or pesticide application.',
    colorCode: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    icon: ShieldCheck,
  };
}

/** Pick a small weather condition icon (Sun / Rain / Wind) for the temperature row. */
export function getConditionIcon(weather: SprayWeatherInput): LucideIcon {
  if ((weather.windSpeed ?? 0) > 15) return Wind;
  if ((weather.precipitationProbability ?? 0) > 40) return CloudRain;
  return Sun;
}
