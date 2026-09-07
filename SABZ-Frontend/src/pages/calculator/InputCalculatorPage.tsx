import { useEffect, useState, useRef, useCallback } from 'react';
import { farmApi } from '@/api/farmApi';
import { cropApi } from '@/api/cropApi';
import { inputCalculatorApi } from '@/api/inputCalculatorApi';
import { parseApiError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  Calculator, Sprout, MapPin, AlertTriangle, FlaskConical,
  Flower, SprayCan, Download, Printer, Beaker, Clock, DollarSign,
  ChevronDown, Ruler, ToggleLeft, ToggleRight, Zap, Lightbulb,
} from 'lucide-react';
import type {
  FarmResponseDto, CropResponseDto,
  InputCalculatorRequestDto, InputCalculatorResponseDto,
} from '@/types';

/* ─── Types ──────────────────────────────────────────────────────────── */

type CalcTab = 'fertilizer' | 'seed' | 'pesticide';
type AreaMode = 'farm' | 'custom';

interface Preset {
  name: string;
  category: string;
  dosageRate: number;
  dosageUnit: string;
  dosageBasis: string;
  timeline: { stage: string; instruction: string }[];
  unitPrice: number;
  unitLabel: string;
}

/* ─── Presets ────────────────────────────────────────────────────────── */

const FERTILIZER_PRESETS: Preset[] = [
  {
    name: 'DAP', category: 'Fertilizer', dosageRate: 2, dosageUnit: 'bags', dosageBasis: 'acre',
    timeline: [
      { stage: 'Basal Dose', instruction: 'Apply 2 bags/acre at sowing — place below the seed row.' },
      { stage: '1st Top Dressing', instruction: 'Apply 1 bag/acre at tillering stage (21–25 days after sowing).' },
    ],
    unitPrice: 12500, unitLabel: 'per 50 kg bag',
  },
  {
    name: 'Urea', category: 'Fertilizer', dosageRate: 3, dosageUnit: 'bags', dosageBasis: 'acre',
    timeline: [
      { stage: '1st Top Dressing', instruction: 'Apply 1.5 bags/acre at tillering (21–25 days).' },
      { stage: '2nd Top Dressing', instruction: 'Apply 1.5 bags/acre at flowering / heading stage.' },
    ],
    unitPrice: 8200, unitLabel: 'per 50 kg bag',
  },
  {
    name: 'NPK 18-18-18', category: 'Fertilizer', dosageRate: 2, dosageUnit: 'bags', dosageBasis: 'acre',
    timeline: [
      { stage: 'Basal Dose', instruction: 'Apply 2 bags/acre at sowing as complete basal nutrition.' },
    ],
    unitPrice: 14000, unitLabel: 'per 50 kg bag',
  },
  {
    name: 'Potash (MOP)', category: 'Fertilizer', dosageRate: 1, dosageUnit: 'bags', dosageBasis: 'acre',
    timeline: [
      { stage: 'Basal Dose', instruction: 'Apply 1 bag/acre at sowing — essential for rice & sugarcane.' },
    ],
    unitPrice: 11000, unitLabel: 'per 50 kg bag',
  },
];

const SEED_PRESETS: Preset[] = [
  {
    name: 'Wheat Seed', category: 'Seed', dosageRate: 50, dosageUnit: 'kg', dosageBasis: 'acre',
    timeline: [
      { stage: 'Sowing', instruction: 'Use treated seed at 50 kg/acre. Increase to 60 kg for late sowing.' },
    ],
    unitPrice: 200, unitLabel: 'per kg',
  },
  {
    name: 'Rice (Basmati)', category: 'Seed', dosageRate: 12, dosageUnit: 'kg', dosageBasis: 'acre',
    timeline: [
      { stage: 'Nursery', instruction: 'Sow 3 kg/acre in nursery; transplant at 25-day seedling age.' },
      { stage: 'Transplanting', instruction: '2–3 seedlings per hill at 9″ × 9″ spacing.' },
    ],
    unitPrice: 600, unitLabel: 'per kg',
  },
  {
    name: 'Maize (Hybrid)', category: 'Seed', dosageRate: 8, dosageUnit: 'kg', dosageBasis: 'acre',
    timeline: [
      { stage: 'Sowing', instruction: '8 kg/acre, 2 seeds per hill, 75 cm × 25 cm spacing.' },
    ],
    unitPrice: 1200, unitLabel: 'per kg',
  },
  {
    name: 'Cotton Seed', category: 'Seed', dosageRate: 12, dosageUnit: 'kg', dosageBasis: 'acre',
    timeline: [
      { stage: 'Sowing', instruction: 'Sow delinted / treated seed at 12 kg/acre on ridges.' },
    ],
    unitPrice: 800, unitLabel: 'per kg',
  },
];

const PESTICIDE_PRESETS: Preset[] = [
  {
    name: 'Imidacloprid', category: 'Pesticide', dosageRate: 200, dosageUnit: 'ml', dosageBasis: 'acre',
    timeline: [
      { stage: 'Spray', instruction: 'Mix 200 ml in 150–200 L water/acre. Targets aphids, jassids, whitefly.' },
    ],
    unitPrice: 1800, unitLabel: 'per litre',
  },
  {
    name: 'Lambda-cyhalothrin', category: 'Pesticide', dosageRate: 250, dosageUnit: 'ml', dosageBasis: 'acre',
    timeline: [
      { stage: 'Spray', instruction: 'Mix 250 ml in 150–200 L water/acre. Targets bollworm, armyworm.' },
    ],
    unitPrice: 2400, unitLabel: 'per litre',
  },
  {
    name: 'Mancozeb (M-45)', category: 'Pesticide', dosageRate: 2, dosageUnit: 'kg', dosageBasis: 'acre',
    timeline: [
      { stage: 'Spray', instruction: 'Mix 2 kg in 150–200 L water/acre. Preventive for blight & rust.' },
    ],
    unitPrice: 1500, unitLabel: 'per kg',
  },
  {
    name: 'Glyphosate', category: 'Pesticide', dosageRate: 3, dosageUnit: 'L', dosageBasis: 'acre',
    timeline: [
      { stage: 'Weed Control', instruction: 'Mix 3 L in 200 L water/acre. Directed spray before crop emergence.' },
    ],
    unitPrice: 2200, unitLabel: 'per litre',
  },
];

const PRESETS_BY_TAB: Record<CalcTab, Preset[]> = {
  fertilizer: FERTILIZER_PRESETS,
  seed: SEED_PRESETS,
  pesticide: PESTICIDE_PRESETS,
};

const TAB_META: { key: CalcTab; label: string; icon: typeof FlaskConical; gradient: string }[] = [
  { key: 'fertilizer', label: 'Fertilizer Dosage', icon: FlaskConical, gradient: 'from-emerald-500 to-green-600' },
  { key: 'seed', label: 'Seed Quantity', icon: Flower, gradient: 'from-amber-500 to-orange-600' },
  { key: 'pesticide', label: 'Pesticide / Spray', icon: SprayCan, gradient: 'from-violet-500 to-purple-600' },
];

const AREA_UNITS = ['Acres', 'Kanals', 'Hectares'];

/* ─── Crop Recommendation Guidelines ─────────────────────────────── */

interface CropRecommendation {
  fertilizer?: Preset;
  seed?: Preset;
  pesticide?: Preset;
}

const CROP_RECOMMENDATIONS: Record<string, CropRecommendation> = {
  wheat: {
    fertilizer: {
      name: 'DAP + Urea', category: 'Fertilizer', dosageRate: 2, dosageUnit: 'bags', dosageBasis: 'acre',
      timeline: [
        { stage: 'Basal Dose', instruction: 'Apply 2 bags DAP/acre at sowing — place below the seed row.' },
        { stage: '1st Irrigation', instruction: 'Apply 1.5 bags Urea/acre at tillering (21–25 days after sowing).' },
        { stage: '2nd Irrigation', instruction: 'Apply 1.5 bags Urea/acre at flowering / heading stage.' },
      ],
      unitPrice: 12500, unitLabel: 'per 50 kg bag',
    },
    seed: SEED_PRESETS[0],
    pesticide: PESTICIDE_PRESETS[0],
  },
  rice: {
    fertilizer: {
      name: 'DAP + Urea + Potash', category: 'Fertilizer', dosageRate: 3, dosageUnit: 'bags', dosageBasis: 'acre',
      timeline: [
        { stage: 'Basal Dose', instruction: 'Apply 2 bags DAP + 1 bag Potash/acre at transplanting.' },
        { stage: '1st Irrigation', instruction: 'Apply 1.5 bags Urea/acre at tillering (15–20 days after transplanting).' },
        { stage: 'Flowering Stage', instruction: 'Apply 1.5 bags Urea/acre at panicle initiation.' },
      ],
      unitPrice: 12500, unitLabel: 'per 50 kg bag',
    },
    seed: SEED_PRESETS[1],
    pesticide: PESTICIDE_PRESETS[0],
  },
  maize: {
    fertilizer: {
      name: 'NPK + Urea', category: 'Fertilizer', dosageRate: 3, dosageUnit: 'bags', dosageBasis: 'acre',
      timeline: [
        { stage: 'Basal Dose', instruction: 'Apply 2 bags NPK 18-18-18/acre at sowing.' },
        { stage: 'Knee High', instruction: 'Apply 1.5 bags Urea/acre at knee-high stage (25–30 days).' },
        { stage: 'Tasseling', instruction: 'Apply 1.5 bags Urea/acre before tasseling.' },
      ],
      unitPrice: 14000, unitLabel: 'per 50 kg bag',
    },
    seed: SEED_PRESETS[2],
    pesticide: PESTICIDE_PRESETS[1],
  },
  cotton: {
    fertilizer: {
      name: 'DAP + Urea', category: 'Fertilizer', dosageRate: 3, dosageUnit: 'bags', dosageBasis: 'acre',
      timeline: [
        { stage: 'Basal Dose', instruction: 'Apply 1.5 bags DAP/acre at sowing on ridges.' },
        { stage: '1st Irrigation', instruction: 'Apply 1.5 bags Urea/acre at first irrigation (15–20 days).' },
        { stage: 'Flowering Stage', instruction: 'Apply 1.5 bags Urea/acre at flowering initiation.' },
      ],
      unitPrice: 12500, unitLabel: 'per 50 kg bag',
    },
    seed: SEED_PRESETS[3],
    pesticide: PESTICIDE_PRESETS[1],
  },
  sugarcane: {
    fertilizer: {
      name: 'DAP + Urea + Potash', category: 'Fertilizer', dosageRate: 5, dosageUnit: 'bags', dosageBasis: 'acre',
      timeline: [
        { stage: 'Basal Dose', instruction: 'Apply 2 bags DAP + 1 bag Potash/acre at planting.' },
        { stage: '1st Irrigation', instruction: 'Apply 1.5 bags Urea/acre at tillering (30–40 days).' },
        { stage: 'Grand Growth', instruction: 'Apply 1.5 bags Urea/acre at grand growth stage (60–90 days).' },
      ],
      unitPrice: 12500, unitLabel: 'per 50 kg bag',
    },
    pesticide: PESTICIDE_PRESETS[3],
  },
};

function findRecommendation(cropName: string | undefined | null, tab: CalcTab): Preset | null {
  if (!cropName) return null;
  const key = cropName.toLowerCase().trim();
  // Direct match
  const rec = CROP_RECOMMENDATIONS[key];
  if (rec) return rec[tab] ?? null;
  // Partial match
  for (const [crop, recommendations] of Object.entries(CROP_RECOMMENDATIONS)) {
    if (key.includes(crop) || crop.includes(key)) return recommendations[tab] ?? null;
  }
  return null;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

const emptyForm: InputCalculatorRequestDto = {
  cropId: null, inputName: '', category: '', dosageRate: 0, dosageUnit: '', dosageBasis: '',
};

function convertToAcres(value: number, unit: string): number {
  if (unit === 'Kanals') return value / 8;
  if (unit === 'Hectares') return value * 2.47105;
  return value;
}

function estimateCost(qty: number, qtyUnit: string, preset: Preset): number {
  // Normalise quantity to the preset's unit for cost calculation
  const q = normaliseQty(qty, qtyUnit, preset);
  return Math.round(q * preset.unitPrice);
}

function normaliseQty(qty: number, qtyUnit: string, preset: Preset): number {
  const qu = qtyUnit.toLowerCase();
  const pu = preset.dosageUnit.toLowerCase();
  if (qu === pu) return qty;
  // bags → kg (50 kg per bag)
  if (qu.includes('bag') && (pu.includes('kg') || pu.includes('litre'))) return qty * 50;
  if (pu.includes('bag') && (qu.includes('kg') || qu.includes('litre'))) return qty / 50;
  // L ↔ ml
  if (qu === 'l' && pu === 'ml') return qty * 1000;
  if (qu === 'ml' && pu === 'l') return qty / 1000;
  return qty;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function InputCalculatorPage() {
  const [farms, setFarms] = useState<FarmResponseDto[]>([]);
  const [crops, setCrops] = useState<CropResponseDto[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [form, setForm] = useState<InputCalculatorRequestDto>({ ...emptyForm });
  const [result, setResult] = useState<InputCalculatorResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New state
  const [activeTab, setActiveTab] = useState<CalcTab>('fertilizer');
  const [areaMode, setAreaMode] = useState<AreaMode>('farm');
  const [customArea, setCustomArea] = useState('');
  const [customAreaUnit, setCustomAreaUnit] = useState('Acres');
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);

  /* ── Data loading ──────────────────────────────────────────────────── */
  useEffect(() => {
    farmApi.getAll()
      .then(setFarms)
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedFarmId) { setCrops([]); return; }
    cropApi.getByFarm(selectedFarmId).then(setCrops).catch(() => {});
  }, [selectedFarmId]);

  const selectedFarm = farms.find((f) => f.id === selectedFarmId);

  const handleCropChange = (cropId: string) => {
    setForm((f) => ({ ...f, cropId: cropId || null }));
    setResult(null);
    // Auto-recommend based on crop selection + current area
    if (cropId) {
      const crop = crops.find((c) => c.id === cropId);
      if (crop) {
        const rec = findRecommendation(crop.cropName, activeTab);
        if (rec) {
          applyPreset(rec);
          return;
        }
      }
    }
  };

  /* ── Derived values ────────────────────────────────────────────────── */
  const getArea = useCallback((): { area: number; unit: string } => {
    if (areaMode === 'farm' && selectedFarm) {
      return { area: selectedFarm.farmSize, unit: selectedFarm.farmSizeUnit || 'Acres' };
    }
    const v = parseFloat(customArea);
    if (isNaN(v) || v <= 0) return { area: 0, unit: customAreaUnit };
    return { area: v, unit: customAreaUnit };
  }, [areaMode, selectedFarm, customArea, customAreaUnit]);

  const presets = PRESETS_BY_TAB[activeTab];
  const { area: calcArea } = getArea();
  const canCalculate = calcArea > 0 && form.inputName && form.dosageRate > 0 && form.dosageUnit;

  /* ── Handlers ──────────────────────────────────────────────────────── */
  const handleTabChange = (tab: CalcTab) => {
    setActiveTab(tab);
    setSelectedPreset(null);
    setForm({ ...emptyForm });
    setResult(null);
  };

  const applyPreset = (p: Preset) => {
    setSelectedPreset(p);
    setForm((f) => ({ ...f, inputName: p.name, category: p.category, dosageRate: p.dosageRate, dosageUnit: p.dosageUnit, dosageBasis: p.dosageBasis }));
    setResult(null);
  };

  const handleCalculate = async () => {
    setError(null);
    const { area, unit } = getArea();
    if (area <= 0) {
      setError(areaMode === 'farm' ? 'Select a farm with a valid area.' : 'Enter a valid land size.');
      return;
    }
    if (!form.inputName || !form.dosageRate || !form.dosageUnit) {
      setError('Fill in all required fields.');
      return;
    }
    setCalculating(true);

    if (areaMode === 'farm' && selectedFarmId) {
      try {
        const data = await inputCalculatorApi.calculate(selectedFarmId, form);
        setResult(data);
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      } catch (err) {
        setError(parseApiError(err).message);
      } finally {
        setCalculating(false);
      }
    } else {
      // Client-side calculation for custom area
      const acres = convertToAcres(area, unit);
      const ratePerAcre = form.dosageBasis.toLowerCase() === 'hectare'
        ? form.dosageRate / 2.47105
        : form.dosageRate;
      const qty = ratePerAcre * acres;

      const clientResult: InputCalculatorResponseDto = {
        farmId: 'custom',
        cropId: form.cropId,
        inputName: form.inputName,
        category: form.category,
        farmArea: area,
        farmAreaUnit: unit,
        calculationArea: Math.round(acres * 100) / 100,
        calculationAreaUnit: 'Acres',
        dosageRate: form.dosageRate,
        dosageUnit: form.dosageUnit,
        dosageBasis: form.dosageBasis,
        requiredQuantity: Math.round(qty * 100) / 100,
        requiredQuantityUnit: form.dosageUnit,
        conversionApplied: form.dosageBasis.toLowerCase() === 'hectare',
        calculationFormula: `${form.dosageRate} ${form.dosageUnit}/${form.dosageBasis} × ${acres.toFixed(2)} acres = ${qty.toFixed(2)} ${form.dosageUnit}`,
        disclaimer: 'Calculated using standard unit conversion. Verify with local agronomist before application.',
      };
      setResult(clientResult);
      setCalculating(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  };

  const handlePrint = () => window.print();

  const handleDownload = () => {
    if (!result) return;
    const lines = [
      '══════════════════════════════════════════',
      '       SABZ — INPUT CALCULATION SHEET      ',
      '══════════════════════════════════════════',
      '',
      `Date:           ${new Date().toLocaleDateString()}`,
      `Type:           ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`,
      '',
      '─── INPUT ───────────────────────────────',
      `Input:          ${result.inputName}`,
      `Category:       ${result.category}`,
      `Dosage Rate:    ${result.dosageRate} ${result.dosageUnit} / ${result.dosageBasis}`,
      '',
      '─── AREA ────────────────────────────────',
      `Land Size:      ${result.farmArea} ${result.farmAreaUnit}`,
      `Calc. Area:     ${result.calculationArea} ${result.calculationAreaUnit}`,
      '',
      '─── RESULT ──────────────────────────────',
      `Required Qty:   ${result.requiredQuantity} ${result.requiredQuantityUnit}`,
    ];
    if (selectedPreset?.timeline.length) {
      lines.push('', '─── APPLICATION TIMELINE ────────────────');
      selectedPreset.timeline.forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s.stage}: ${s.instruction}`);
      });
    }
    if (selectedPreset) {
      const cost = estimateCost(result.requiredQuantity, result.requiredQuantityUnit, selectedPreset);
      lines.push('', '─── COST ESTIMATE ───────────────────────');
      lines.push(`Unit Price:     PKR ${selectedPreset.unitPrice.toLocaleString()} ${selectedPreset.unitLabel}`);
      lines.push(`Est. Total:     PKR ${cost.toLocaleString()}`);
    }
    lines.push('', `Formula: ${result.calculationFormula}`, '', result.disclaimer, '══════════════════════════════════════════');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sabz-${result.inputName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Render ────────────────────────────────────────────────────────── */
  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Calculator className="h-5 w-5 text-white" />
          </div>
          {t('calculator.title')}
        </h1>
        <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">{t('calculator.description')}</p>
      </div>

      {/* ─── Calculation Type Tabs ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {TAB_META.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'relative flex flex-col items-center gap-2 px-4 py-4 rounded-2xl border-2 transition-all duration-200',
                active
                  ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-500/10'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm',
              )}
            >
              <div className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center transition-colors',
                active ? `bg-gradient-to-br ${tab.gradient}` : 'bg-gray-100',
              )}>
                <Icon className={cn('h-5 w-5', active ? 'text-white' : 'text-gray-400')} />
              </div>
              <span className={cn('text-xs font-semibold transition-colors', active ? 'text-indigo-700' : 'text-gray-500')}>
                {tab.label}
              </span>
              {active && <div className="absolute -bottom-px left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-indigo-500" />}
            </button>
          );
        })}
      </div>

      {/* ─── Area Mode Toggle ──────────────────────────────────────── */}
      <Card padding="sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5" /> {t('calculator.landAreaSource')}
          </span>
          <button
            onClick={() => { setAreaMode((m) => m === 'farm' ? 'custom' : 'farm'); setResult(null); }}
            className="flex items-center gap-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            {areaMode === 'farm' ? (
              <><ToggleRight className="h-4 w-4" /> {t('calculator.switchToCustom')}</>
            ) : (
              <><ToggleLeft className="h-4 w-4" /> {t('calculator.switchToFarm')}</>
            )}
          </button>
        </div>

        {areaMode === 'farm' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                <MapPin className="h-3 w-3 inline mr-1" />{t('farm.name')} *
              </label>
              <select
                value={selectedFarmId}
                onChange={(e) => { setSelectedFarmId(e.target.value); setForm((f) => ({ ...f, cropId: null })); setResult(null); }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('calculator.selectFarm')}</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.farmName} ({f.farmSize} {f.farmSizeUnit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                <Sprout className="h-3 w-3 inline mr-1" />{t('crop.name')} (optional)
              </label>
              <select
                value={form.cropId || ''}
                onChange={(e) => handleCropChange(e.target.value)}
                disabled={!selectedFarmId}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              >
                <option value="">-- {t('financial.allCrops')} --</option>
                {crops.map((c) => (
                  <option key={c.id} value={c.id}>{c.cropName} ({c.season})</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                <Ruler className="h-3 w-3 inline mr-1" /> {t('calculator.landSize')} *
              </label>
              <input
                type="number"
                value={customArea}
                onChange={(e) => { setCustomArea(e.target.value); setResult(null); }}
                placeholder="e.g. 5"
                min={0}
                step="any"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">{t('calculator.unit')}</label>
              <div className="relative">
                <select
                  value={customAreaUnit}
                  onChange={(e) => { setCustomAreaUnit(e.target.value); setResult(null); }}
                  className="w-full appearance-none px-3 pr-8 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {AREA_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Quick-Select Presets ──────────────────────────────────── */}
      <Card padding="sm">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Beaker className="h-3.5 w-3.5" /> {t('calculator.quickSelect')} {activeTab} {t('calculator.input')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                selectedPreset?.name === p.name
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50',
              )}
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={() => { setSelectedPreset(null); setForm({ ...emptyForm }); setResult(null); }}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              !selectedPreset
                ? 'bg-gray-100 text-gray-700 border-gray-300'
                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300',
            )}
          >
            {t('calculator.custom')}
          </button>
        </div>

        {/* ── Primary CTA ─────────────────────────────────────────── */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <button
            onClick={handleCalculate}
            disabled={!canCalculate || calculating}
            className={cn(
              'w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-sm font-bold transition-all duration-200',
              canCalculate && !calculating
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98]'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            )}
          >
            {calculating ? (
              <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('calculator.calculating')}</>
            ) : (
              <><Zap className="h-4.5 w-4.5" /> {t('calculator.calculateReq')}</>
            )}
          </button>
          {!canCalculate && (
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              {t('calculator.selectInputHint')}
            </p>
          )}
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ─── Structured Result Card ────────────────────────────────── */}
      {result && (
        <div ref={resultRef} className="space-y-4 animate-fade-in">
          {/* Summary */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-10 w-10 rounded-xl flex items-center justify-center',
                  activeTab === 'fertilizer' ? 'bg-emerald-50' : activeTab === 'seed' ? 'bg-amber-50' : 'bg-violet-50',
                )}>
                  {activeTab === 'fertilizer' && <FlaskConical className="h-5 w-5 text-emerald-600" />}
                  {activeTab === 'seed' && <Flower className="h-5 w-5 text-amber-600" />}
                  {activeTab === 'pesticide' && <SprayCan className="h-5 w-5 text-violet-600" />}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{result.inputName}</h3>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{result.category} {t('calculator.calculation')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                  title={t('calculator.downloadSheet')}
                >
                  <Download className="h-3.5 w-3.5" /> {t('calculator.download')}
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                  title={t('calculator.printSheet')}
                >
                  <Printer className="h-3.5 w-3.5" /> {t('calculator.print')}
                </button>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label={t('calculator.area')} value={`${result.farmArea}`} sub={result.farmAreaUnit} tone="blue" />
              <MetricCard label={t('calculator.dosage')} value={`${result.dosageRate}`} sub={`${result.dosageUnit} / ${result.dosageBasis}`} tone="gray" />
              <MetricCard
                label={t('calculator.requiredQty')}
                value={`${result.requiredQuantity}`}
                sub={result.requiredQuantityUnit}
                tone={activeTab === 'fertilizer' ? 'emerald' : activeTab === 'seed' ? 'amber' : 'violet'}
                highlight
              />
              {selectedPreset && (
                <MetricCard
                  label={t('calculator.estCost')}
                  value={`PKR ${estimateCost(result.requiredQuantity, result.requiredQuantityUnit, selectedPreset).toLocaleString()}`}
                  sub={selectedPreset.unitLabel}
                  tone="orange"
                />
              )}
            </div>

            {result.conversionApplied && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mt-3">
                <AlertTriangle className="h-3 w-3" /> {t('calculator.conversionApplied')}
              </p>
            )}
            <p className="text-[10px] text-gray-400 mt-3">{result.disclaimer}</p>
          </Card>

          {/* Application Timeline */}
          {selectedPreset?.timeline.length ? (
            <Card padding="sm">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {t('calculator.applicationTimeline')}
              </h4>
              <div className="space-y-3">
                {selectedPreset.timeline.map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        i === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600',
                      )}>
                        {i + 1}
                      </div>
                      {i < selectedPreset.timeline.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-semibold text-gray-900">{step.stage}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{step.instruction}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Cost Breakdown */}
          {selectedPreset && (
            <Card padding="sm">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> {t('calculator.costBreakdown')}
              </h4>
              <div className="space-y-2">
                <CostRow
                  label={`${result.inputName} — ${result.requiredQuantity} ${result.requiredQuantityUnit}`}
                  detail={`@ PKR ${selectedPreset.unitPrice.toLocaleString()} ${selectedPreset.unitLabel}`}
                  amount={estimateCost(result.requiredQuantity, result.requiredQuantityUnit, selectedPreset)}
                />
                <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-900">{t('calculator.estimatedTotal')}</span>
                  <span className="text-lg font-bold text-indigo-700">
                    PKR {estimateCost(result.requiredQuantity, result.requiredQuantityUnit, selectedPreset).toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-3">
                {t('calculator.pricesNote')}
              </p>
            </Card>
          )}

      {/* Formula (compact) */}
      {result && (
        <Card padding="sm">
          <p className="text-xs text-gray-500">
            <span className="font-medium">{t('calculator.formula')}:</span> {result.calculationFormula}
          </p>
        </Card>
      )}
        </div>
      )}

      {/* ─── Empty / Guidance State ─────────────────────────────────── */}
      {!result && (
        <Card padding="md">
          <div className="text-center py-6">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center mx-auto mb-4">
              <Lightbulb className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">{t('calculator.readyTitle')}</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-5">
              {t('calculator.readyDesc')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-lg mx-auto">
              <StepHint number={1} text={t('calculator.step1')} done={!!activeTab} />
              <StepHint number={2} text={t('calculator.step2')} done={calcArea > 0} />
              <StepHint number={3} text={t('calculator.step3')} done={!!selectedPreset} />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function MetricCard({ label, value, sub, tone, highlight }: {
  label: string; value: string; sub: string; tone: string; highlight?: boolean;
}) {
  const bg = highlight
    ? tone === 'emerald' ? 'bg-emerald-50 border-emerald-200'
      : tone === 'amber' ? 'bg-amber-50 border-amber-200'
      : tone === 'violet' ? 'bg-violet-50 border-violet-200'
      : 'bg-primary-50 border-primary-200'
    : 'bg-gray-50 border-gray-100';
  const val = highlight
    ? tone === 'emerald' ? 'text-emerald-800'
      : tone === 'amber' ? 'text-amber-800'
      : tone === 'violet' ? 'text-violet-800'
      : 'text-primary-800'
    : 'text-gray-900';
  const lbl = highlight
    ? tone === 'emerald' ? 'text-emerald-600'
      : tone === 'amber' ? 'text-amber-600'
      : tone === 'violet' ? 'text-violet-600'
      : 'text-primary-600'
    : 'text-gray-500';
  return (
    <div className={cn('rounded-xl p-3 border', bg)}>
      <p className={cn('text-[10px] font-medium uppercase tracking-wider', lbl)}>{label}</p>
      <p className={cn('text-lg font-bold', val)}>{value}</p>
      <p className="text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}

function CostRow({ label, detail, amount }: { label: string; detail: string; amount: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-[10px] text-gray-400">{detail}</p>
      </div>
      <span className="text-sm font-bold text-gray-800">PKR {amount.toLocaleString()}</span>
    </div>
  );
}

function StepHint({ number, text, done }: { number: number; text: string; done: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className={cn(
        'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
        done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
      )}>
        {done ? '✓' : number}
      </div>
      <p className={cn('text-xs leading-relaxed', done ? 'text-emerald-700' : 'text-gray-500')}>{text}</p>
    </div>
  );
}
