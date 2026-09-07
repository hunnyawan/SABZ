import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, ImageOverlay, Polygon, useMap, LayersControl } from 'react-leaflet';
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';
import { agroMonitoringApi } from '@/api/agroMonitoringApi';
import { farmApi } from '@/api/farmApi';
import type { FarmResponseDto } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Satellite, Loader2, AlertCircle, CheckCircle2, MapPin, MapPinned, Save } from 'lucide-react';
import { t } from '@/lib/i18n';

// ── Types ──────────────────────────────────────────────────────────────────

type Phase = 'draw' | 'registered' | 'loading' | 'done';

interface NdviState {
  polygonId: string;
  ndviUrl: string;
  bounds: LatLngBoundsExpression;
  clouds: number;
  date: string;
  sat: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-PK', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/** Extract lat/lng bounds from a GeoJSON polygon for the ImageOverlay. */
function polygonBounds(geometry: GeoJSON.Geometry): LatLngBoundsExpression {
  const coords = (geometry as GeoJSON.Polygon).coordinates[0];
  const lats = coords.map((c) => c[1]);
  const lngs = coords.map((c) => c[0]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

// ── Sub-component: draw control (leaflet-draw directly) ────────────────────

function DrawControl({
  onPolygonCreated,
  onPolygonDeleted,
  disabled,
  featureGroupRef,
}: {
  onPolygonCreated: (geometry: GeoJSON.Geometry) => void;
  onPolygonDeleted: () => void;
  disabled: boolean;
  featureGroupRef: React.MutableRefObject<L.FeatureGroup | null>;
}) {
  const map = useMap();
  const controlRef = useRef<L.Control.Draw | null>(null);
  const onPolygonCreatedRef = useRef(onPolygonCreated);
  const onPolygonDeletedRef = useRef(onPolygonDeleted);

  // Keep callback refs in sync without re-running the main effect
  useEffect(() => {
    onPolygonCreatedRef.current = onPolygonCreated;
    onPolygonDeletedRef.current = onPolygonDeleted;
  }, [onPolygonCreated, onPolygonDeleted]);

  useEffect(() => {
    if (disabled) return;

    // Create or reuse the FeatureGroup
    if (!featureGroupRef.current) {
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      featureGroupRef.current = drawnItems;
    }
    const drawnItems = featureGroupRef.current;

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        rectangle: {
          shapeOptions: {
            color: '#16a34a',
            weight: 2,
            fillOpacity: 0.15,
          } as L.PolylineOptions,
        },
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: '#16a34a',
            weight: 2,
            fillOpacity: 0.15,
          } as L.PolylineOptions,
        },
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);
    controlRef.current = drawControl;

    const onCreated = (e: L.LeafletEvent) => {
      const evt = e as unknown as L.DrawEvents.Created;
      const layer = evt.layer;
      drawnItems.addLayer(layer);
      const geoJson = (layer as L.Polygon).toGeoJSON();
      onPolygonCreatedRef.current(geoJson.geometry);
    };

    const onDeleted = (_e: L.LeafletEvent) => {
      onPolygonDeletedRef.current();
    };

    const onEdited = (_e: L.LeafletEvent) => {
      const layers = drawnItems.getLayers();
      if (layers.length > 0) {
        const polygon = layers[0] as L.Polygon;
        const geoJson = polygon.toGeoJSON();
        onPolygonCreatedRef.current(geoJson.geometry);
      }
    };

    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.DELETED, onDeleted);
    map.on(L.Draw.Event.EDITED, onEdited);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.off(L.Draw.Event.DELETED, onDeleted);
      map.off(L.Draw.Event.EDITED, onEdited);
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
      // Don't remove the FeatureGroup - keep it for reuse
    };
  }, [map, disabled, featureGroupRef]);

  return null;
}

// ── Sub-component: search geocoder (Nominatim / OpenStreetMap) ─────────────

function SearchControl() {
  const map = useMap();

  useEffect(() => {
    const provider = new OpenStreetMapProvider();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SearchControlCtor = GeoSearchControl as any;
    const ctrl = new SearchControlCtor({
      provider,
      style: 'bar',
      position: 'topleft',
      placeholder: t('cropHealth.searchPlaceholder'),
      autoComplete: true,
      autoCompleteDelay: 300,
      maxMarkers: 1,
      retainZoomLevel: false,
      animateZoom: true,
      autoClose: true,
      keepResult: true,
      updateMap: true,
      showMarker: true,
      zoomLevel: 16,
      searchLabel: t('cropHealth.searchLabel'),
    }) as any;

    // Override centerMap to always flyTo with zoom level 16
    const originalCenterMap = ctrl.centerMap?.bind(ctrl);
    ctrl.centerMap = (result: any) => {
      if (result) {
        map.flyTo([result.y, result.x], 16, {
          animate: true,
          duration: 1.5,
        });
      } else if (originalCenterMap) {
        originalCenterMap(result);
      }
    };

    map.addControl(ctrl);

    return () => {
      map.removeControl(ctrl);
    };
  }, [map]);

  return null;
}

// ── Sub-component: load saved farm boundary into feature group ─────────────

function LoadFarmBoundary({
  farm,
  featureGroupRef,
  onBoundaryLoaded,
}: {
  farm: FarmResponseDto | null;
  featureGroupRef: React.MutableRefObject<L.FeatureGroup | null>;
  onBoundaryLoaded: (geometry: GeoJSON.Geometry) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!farm) return;

    // Wait for FeatureGroup to be ready
    const tryLoad = () => {
      if (!featureGroupRef.current) {
        setTimeout(tryLoad, 50);
        return;
      }

      const fg = featureGroupRef.current;
      fg.clearLayers();

      // If farm has a saved boundary, load it and zoom to it
      if (farm.boundary) {
        const coords = (farm.boundary as GeoJSON.Polygon).coordinates[0];
        const latlngs = coords.map((c) => [c[1], c[0]] as [number, number]);
        const polygon = L.polygon(latlngs, {
          color: '#16a34a',
          weight: 2,
          fillOpacity: 0.15,
        });
        polygon.addTo(fg);
        map.fitBounds(polygon.getBounds(), { padding: [40, 40], maxZoom: 16 });
        onBoundaryLoaded(farm.boundary);
      } else if (farm.latitude && farm.longitude) {
        // No boundary, but has coordinates - fly to them
        map.flyTo([farm.latitude, farm.longitude], 15, {
          animate: true,
          duration: 1.5,
        });
      }
    };

    tryLoad();
  }, [farm, map, featureGroupRef, onBoundaryLoaded]);

  return null;
}

// ── Sub-component: fit map to drawn polygon ────────────────────────────────

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds as never, { padding: [40, 40], maxZoom: 16 });
  }, [bounds, map]);
  return null;
}

// ── NDVI Legend ────────────────────────────────────────────────────────────

function NdviLegend() {
  return (
    <div className="absolute bottom-6 left-3 z-[1000] rounded-xl bg-white/95 backdrop-blur-sm border border-gray-200 shadow-lg px-3.5 py-3 text-xs pointer-events-none">
      <p className="font-bold text-gray-800 mb-2 text-[11px] uppercase tracking-wide">{t('cropHealth.ndviHealth')}</p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm bg-emerald-600 shrink-0" />
          <span className="text-gray-700">{t('cropHealth.excellent')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm bg-yellow-400 shrink-0" />
          <span className="text-gray-700">{t('cropHealth.average')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm bg-red-600 shrink-0" />
          <span className="text-gray-700">{t('cropHealth.poor')}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function CropHealthMap() {
  const [phase, setPhase] = useState<Phase>('draw');
  const [polygonGeoJson, setPolygonGeoJson] = useState<GeoJSON.Geometry | null>(null);
  const [polygonBoundsState, setPolygonBoundsState] = useState<LatLngBoundsExpression | null>(null);
  const [ndvi, setNdvi] = useState<NdviState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [farms, setFarms] = useState<FarmResponseDto[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [selectedFarm, setSelectedFarm] = useState<FarmResponseDto | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // ── Fetch user's farms on mount ──────────────────────────────────────
  useEffect(() => {
    farmApi.getAll().then(setFarms).catch(() => {});
  }, []);

  // ── Handle farm selection from dropdown ──────────────────────────────
  const handleFarmSelect = useCallback((farmId: string) => {
    setSelectedFarmId(farmId);
    if (!farmId) {
      setSelectedFarm(null);
      return;
    }
    const farm = farms.find((f) => f.id === farmId);
    if (farm) {
      setSelectedFarm(farm);
    }
  }, [farms]);

  // ── Polygon created by user ────────────────────────────────────────────
  const onPolygonCreated = useCallback((geometry: GeoJSON.Geometry) => {
    setPolygonGeoJson(geometry);
    setPolygonBoundsState(polygonBounds(geometry));
    setError(null);
    setNdvi(null);
    setPhase('registered');
  }, []);

  const onPolygonDeleted = useCallback(() => {
    setPolygonGeoJson(null);
    setPolygonBoundsState(null);
    setNdvi(null);
    setPhase('draw');
    setError(null);
  }, []);

  // ── Analyze: register polygon + fetch NDVI ─────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!polygonGeoJson) return;
    setPhase('loading');
    setError(null);
    setNdvi(null);

    try {
      // Step A — register polygon
      const poly = await agroMonitoringApi.createPolygon(polygonGeoJson, 'SABZ Farm');

      // Step B — fetch latest satellite imagery
      const img = await agroMonitoringApi.getLatestNdvi(poly.id);
      if (!img?.image?.ndvi) {
        setError(t('cropHealth.noImagery'));
        setPhase('registered');
        return;
      }

      // Step C — store NDVI URL + bounds
      setNdvi({
        polygonId: poly.id,
        ndviUrl: img.image.ndvi,
        bounds: polygonBoundsState!,
        clouds: img.clouds,
        date: formatTimestamp(img.date),
        sat: img.sat,
      });
      setPhase('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('cropHealth.analyzeFailed');
      setError(msg.includes('not configured')
        ? t('cropHealth.apiKeyMissing')
        : msg);
      setPhase('registered');
    }
  }, [polygonGeoJson, polygonBoundsState]);

  // ── Reset ─────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setPolygonGeoJson(null);
    setPolygonBoundsState(null);
    setNdvi(null);
    setError(null);
    setPhase('draw');
    setSaveSuccess(false);
  }, []);

  // ── Save farm boundary ────────────────────────────────────────────────
  const handleSaveFarmBoundary = useCallback(async () => {
    if (!selectedFarm || !polygonGeoJson) return;

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const updatedFarm = await farmApi.update(selectedFarm.id, {
        farmName: selectedFarm.farmName,
        provinceId: selectedFarm.provinceId,
        districtId: selectedFarm.districtId,
        tehsilId: selectedFarm.tehsilId,
        latitude: selectedFarm.latitude,
        longitude: selectedFarm.longitude,
        farmSize: selectedFarm.farmSize,
        farmSizeUnit: selectedFarm.farmSizeUnit,
        soilType: selectedFarm.soilType,
        irrigationType: selectedFarm.irrigationType,
        boundary: polygonGeoJson,
      });

      // Update the selected farm with the new boundary
      setSelectedFarm(updatedFarm);
      setSaveSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('cropHealth.saveFailed');
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  }, [selectedFarm, polygonGeoJson]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-700 flex items-center justify-center shrink-0">
            <Satellite className="h-5 w-5 text-white" />
          </div>
          {t('cropHealth.title')}
        </h1>
        <p className="text-gray-500 mt-1.5 ml-0 sm:ml-[52px]">
          {t('cropHealth.subtitle')}
        </p>
      </div>

      {/* Farm selector dropdown - outside map */}
      {farms.length > 0 && (
        <div className="flex justify-between items-center mb-4 bg-white rounded-lg border border-gray-200 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <MapPinned className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium text-gray-700">{t('cropHealth.quickJump')}</span>
          </div>
          <select
            value={selectedFarmId}
            onChange={(e) => handleFarmSelect(e.target.value)}
            className="text-sm bg-gray-50 border border-gray-300 rounded-md px-3 py-1.5 text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-w-[200px]"
          >
            <option value="">{t('cropHealth.selectFarm')}</option>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.farmName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Map card */}
      <Card padding="none" className="overflow-hidden">
        <div className="relative w-full" style={{ height: 'min(70vh, 560px)' }}>
          <MapContainer
            center={[30.3753, 69.3451]}
            zoom={6}
            className="h-full w-full z-0"
            scrollWheelZoom
          >
            {/* Base layer control - Satellite (default) and Street Map options */}
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name={t('cropHealth.satelliteView')}>
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name={t('cropHealth.streetMap')}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            {/* Search geocoder */}
            <SearchControl />

            {/* Drawing controls — only polygon */}
            <DrawControl
              onPolygonCreated={onPolygonCreated}
              onPolygonDeleted={onPolygonDeleted}
              disabled={phase === 'done'}
              featureGroupRef={featureGroupRef}
            />

            {/* Load saved farm boundary */}
            <LoadFarmBoundary
              farm={selectedFarm}
              featureGroupRef={featureGroupRef}
              onBoundaryLoaded={onPolygonCreated}
            />

            {/* Drawn polygon */}
            {polygonGeoJson && (
              <Polygon
                positions={(polygonGeoJson as GeoJSON.Polygon).coordinates[0].map((c) => [c[1], c[0]])}
                pathOptions={{ color: '#16a34a', weight: 2, fillOpacity: ndvi ? 0 : 0.15 }}
              />
            )}

            {/* NDVI image overlay */}
            {ndvi && (
              <ImageOverlay
                url={ndvi.ndviUrl}
                bounds={ndvi.bounds}
                opacity={0.75}
                interactive={false}
              />
            )}

            {/* Fit bounds helper */}
            <FitBounds bounds={polygonBoundsState} />
          </MapContainer>

          {/* Legend overlay */}
          {ndvi && <NdviLegend />}

          {/* Loading overlay */}
          {phase === 'loading' && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-gray-600">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                <p className="text-sm font-medium">{t('cropHealth.fetching')}</p>
                <p className="text-xs text-gray-400">{t('cropHealth.fetchingSub')}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {phase === 'draw' && (
          <p className="text-sm text-gray-500 flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-gray-400" />
            {t('cropHealth.drawInstruction')}
          </p>
        )}

        {phase === 'registered' && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleAnalyze} size="lg" className="gap-2">
              <Satellite className="h-4 w-4" />
              {t('cropHealth.analyzeBtn')}
            </Button>
            {selectedFarm && (
              <Button
                onClick={handleSaveFarmBoundary}
                variant="outline"
                size="lg"
                disabled={isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? t('cropHealth.saving') : t('cropHealth.saveArea')}
              </Button>
            )}
          </div>
        )}

        {saveSuccess && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {t('cropHealth.saved')}
          </div>
        )}

        {phase === 'done' && ndvi && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              {t('cropHealth.ndviLoaded')}
            </div>
            <span className="text-xs text-gray-400">
              {ndvi.date} &middot; {ndvi.sat} &middot; {ndvi.clouds}% clouds
            </span>
            <Button variant="outline" size="sm" onClick={handleReset}>
              {t('cropHealth.drawNew')}
            </Button>
          </div>
        )}

        {phase === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('cropHealth.analyzing')}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <Card padding="sm" className="border-red-200 bg-red-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">{t('cropHealth.somethingWrong')}</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

