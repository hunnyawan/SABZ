import { t } from '@/lib/i18n';

/** Translate a farm-size unit string (e.g. "Acres") via i18n. */
export function translateUnit(unit: string): string {
  const key = `farms.${unit.toLowerCase()}`;
  const translated = t(key);
  return translated !== key ? translated : unit;
}

const SOIL_TYPE_MAP: Record<string, string> = {
  Clay: 'farms.soil.clay',
  Sandy: 'farms.soil.sandy',
  Loamy: 'farms.soil.loamy',
  Silty: 'farms.soil.silty',
  Peaty: 'farms.soil.peaty',
  Chalky: 'farms.soil.chalky',
  Saline: 'farms.soil.saline',
  Alluvial: 'farms.soil.alluvial',
};

/** Translate a soil-type value (e.g. "Sandy") via i18n. */
export function translateSoilType(val: string): string {
  const key = SOIL_TYPE_MAP[val];
  return key ? t(key) : val;
}

const IRRIGATION_MAP: Record<string, string> = {
  Canal: 'farms.irrigation.canal',
  Tubewell: 'farms.irrigation.tubewell',
  Drip: 'farms.irrigation.drip',
  Sprinkler: 'farms.irrigation.sprinkler',
  'Rain-fed': 'farms.irrigation.rainFed',
  Flood: 'farms.irrigation.flood',
  Furrow: 'farms.irrigation.furrow',
};

/** Translate an irrigation-type value (e.g. "Rain-fed") via i18n. */
export function translateIrrigation(val: string): string {
  const key = IRRIGATION_MAP[val];
  return key ? t(key) : val;
}
