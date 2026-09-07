/**
 * AgroMonitoring API client (free tier — agromonitoring.com).
 *
 * Provides satellite NDVI (Normalized Difference Vegetation Index) imagery
 * for user-drawn farm polygons.  The free tier allows 50 calls / day.
 *
 * Flow:
 *   1. POST /polygons          — register a GeoJSON polygon, get polygon_id
 *   2. GET  /image/search      — find the most recent satellite pass
 *   3. The response includes image.ndvi — a tile URL to overlay on the map
 */

const BASE = 'https://api.agromonitoring.com/agro/1.0';
const TIMEOUT_MS = 30_000;

function appId(): string {
  const key = import.meta.env.VITE_AGROMONITORING_API_KEY;
  if (!key) throw new Error('AgroMonitoring API key is not configured.');
  return key;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`agromonitoring-${res.status}: ${body || res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgroPolygon {
  id: string;
  name?: string;
  geometry: GeoJSON.Geometry;
}

export interface AgroImageSearchResult {
  id: string;
  sat: string;
  clouds: number;
  date: number;        // unix timestamp
  image: {
    ndvi?: string;
    true_color?: string;
    false_color?: string;
    ndwi?: string;
  };
}

export interface AgroPolygonResponse {
  id: string;
  name?: string;
  geometry: GeoJSON.Geometry;
  links?: { self?: string };
}

// ─── API ────────────────────────────────────────────────────────────────────

export const agroMonitoringApi = {
  /** Register a GeoJSON polygon and receive a polygon_id. */
  async createPolygon(geometry: GeoJSON.Geometry, name?: string): Promise<AgroPolygonResponse> {
    const key = appId();
    const body = name ? { name, geometry } : { geometry };
    return fetchJson<AgroPolygonResponse>(
      `${BASE}/polygons?appid=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  },

  /** List all registered polygons for this API key. */
  async listPolygons(): Promise<AgroPolygonResponse[]> {
    const key = appId();
    return fetchJson<AgroPolygonResponse[]>(`${BASE}/polygons?appid=${key}`);
  },

  /** Delete a polygon by id. */
  async deletePolygon(polygonId: string): Promise<void> {
    const key = appId();
    await fetchJson(`${BASE}/polygons/${polygonId}?appid=${key}`, { method: 'DELETE' });
  },

  /**
   * Search for the most recent satellite image for a polygon.
   * Returns the latest NDVI image URL (if available).
   */
  async getLatestNdvi(polygonId: string): Promise<AgroImageSearchResult | null> {
    const key = appId();
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    const url =
      `${BASE}/image/search?polyid=${polygonId}` +
      `&start=${thirtyDaysAgo}&end=${now}&appid=${key}`;

    const results = await fetchJson<AgroImageSearchResult[]>(url);
    if (!results || results.length === 0) return null;

    // Prefer images that have NDVI data; pick the most recent.
    const withNdvi = results.filter((r) => r.image?.ndvi);
    const chosen = withNdvi.length > 0 ? withNdvi[0] : results[0];
    return chosen;
  },
};
