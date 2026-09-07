import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { diseaseApi } from '@/api/diseaseApi';
import { cropApi } from '@/api/cropApi';
import { farmApi } from '@/api/farmApi';
import { parseApiError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { formatDate, cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import {
  ArrowLeft, Upload, X, Camera, ScanSearch, Leaf, ShieldCheck,
  AlertTriangle, CheckCircle2, Info, Microscope, Activity, Stethoscope,
  Sparkles, Zap, Clock, FileText, ScanLine, ChevronRight,
  StopCircle, Video, Trash2,
} from 'lucide-react';
import { analyzeLeafImage, isVisionAiConfigured } from '@/lib/geminiVision';
import type { LeafGuardResult } from '@/lib/geminiVision';
import type { DiseaseDetectionResponseDto, DiseaseAdviceDto, CropResponseDto, FarmResponseDto } from '@/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const STORAGE_KEY = 'sabz-scan-history';

interface ScanHistoryEntry {
  id: string;
  scannedAt: string;
  thumbnail: string;
  diseaseName: string | null;
  severity: string | null;
  cropType: string | null;
  isPlantLeaf: boolean;
  leafResult?: LeafGuardResult;
  backendResult?: DiseaseDetectionResponseDto;
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

function loadHistory(): ScanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistHistory(entries: ScanHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 50)));
}

/* ─── Main Component ───────────────────────────────────────────────── */

export function DiseaseDetectionPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  // Hub state
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [view, setView] = useState<'hub' | 'scanner' | 'report'>('hub');
  const [selectedEntry, setSelectedEntry] = useState<ScanHistoryEntry | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Farm & crop data (farm-scoped mode only)
  const [farm, setFarm] = useState<FarmResponseDto | null>(null);
  const [crops, setCrops] = useState<CropResponseDto[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Scanner form state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cropId, setCropId] = useState('');
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DiseaseDetectionResponseDto | null>(null);
  const [leafResult, setLeafResult] = useState<LeafGuardResult | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const quickScan = !farmId;

  // ─── Webcam modal state (desktop camera capture) ──────────────
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /** Cleanup stream on unmount. */
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Load scan history on mount
  useEffect(() => {
    setScanHistory(loadHistory());
  }, []);

  // Farm-scoped: load farm + crops
  useEffect(() => {
    if (!farmId) return;
    setPageLoading(true);
    Promise.all([farmApi.getById(farmId), cropApi.getByFarm(farmId)])
      .then(([f, c]) => { setFarm(f); setCrops(c); })
      .catch((err) => setPageError(parseApiError(err).message))
      .finally(() => setPageLoading(false));
  }, [farmId]);

  // Tier 1 — fast client-side rejection: valid image type + under 10 MB.
  const validateFile = useCallback((f: File): boolean => {
    if (!ACCEPTED_TYPES.includes(f.type) || f.size > MAX_FILE_SIZE) {
      setFileError(t('disease.invalidFile'));
      return false;
    }
    setFileError(null);
    return true;
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!validateFile(f)) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }, [validateFile]);

  /** Detect mobile/tablet — these devices use native capture="environment" input. */
  const isMobileDevice = () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || ('ontouchstart' in window && window.innerWidth < 1024);

  /** "Take Photo" click: mobile → native camera input; desktop → webcam modal. */
  const handleTakePhoto = () => {
    if (isMobileDevice()) {
      cameraInputRef.current?.click();
    } else {
      setWebcamOpen(true);
    }
  };

  /** Start desktop webcam stream with rear-facing preference. */
  const startWebcam = useCallback(async () => {
    setWebcamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setWebcamError(t('disease.cameraDenied'));
    }
  }, []);

  /** Stop webcam stream and close modal. */
  const closeWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setWebcamOpen(false);
    setWebcamError(null);
  }, []);

  /** Start webcam stream when modal opens. */
  useEffect(() => {
    if (!webcamOpen) return;
    // Small delay to let the <video> element mount before attaching the stream.
    const id = setTimeout(() => startWebcam(), 100);
    return () => {
      clearTimeout(id);
      closeWebcam();
    };
  }, [webcamOpen, startWebcam, closeWebcam]);

  /** Capture a single frame from the live video into a File and populate upload state. */
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const capturedFile = new File(
          [blob],
          `camera-capture-${Date.now()}.jpg`,
          { type: 'image/jpeg' },
        );
        handleFile(capturedFile);
        closeWebcam();
      },
      'image/jpeg',
      0.92,
    );
  }, [handleFile, closeWebcam]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const removeFile = () => {
    setFile(null);
    setPreview(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // Save a scan result to history
  const saveScanToHistory = (entry: Omit<ScanHistoryEntry, 'id' | 'scannedAt' | 'thumbnail'>) => {
    const newEntry: ScanHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      scannedAt: new Date().toISOString(),
      thumbnail: preview || '',
    };
    const updated = [newEntry, ...scanHistory].slice(0, 50);
    setScanHistory(updated);
    persistHistory(updated);
  };

  const startNewScan = () => {
    setResult(null);
    setLeafResult(null);
    setAiFailed(false);
    setSubmitError(null);
    setFile(null);
    setPreview(null);
    setCropId('');
    setNotes('');
    setFileError(null);
    setSelectedEntry(null);
    setView('scanner');
  };

  const backToHub = () => {
    setView('hub');
    setSelectedEntry(null);
  };

  const viewReport = (entry: ScanHistoryEntry) => {
    setSelectedEntry(entry);
    setView('report');
  };

  const deleteScanEntry = (id: string) => {
    const updated = scanHistory.filter((e) => e.id !== id);
    setScanHistory(updated);
    persistHistory(updated);
    setDeleteConfirmId(null);
  };

  const handleSubmit = async () => {
    if (!file) return;
    if (!quickScan && !farmId) return;
    const visionMode = quickScan || isVisionAiConfigured();
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    setLeafResult(null);
    setAiFailed(false);
    try {
      if (visionMode) {
        const selectedCrop = !quickScan ? crops.find((c) => c.id === cropId) : undefined;
        const hint = [selectedCrop?.cropName, notes].filter(Boolean).join(' — ');
        const res = await analyzeLeafImage(file, hint || undefined);
        setLeafResult(res);
        if (res.isPlantLeaf) {
          saveScanToHistory({
            diseaseName: res.diseaseName,
            severity: res.severity,
            cropType: selectedCrop?.cropName || null,
            isPlantLeaf: true,
            leafResult: res,
          });
        } else {
          removeFile();
        }
      } else {
        const res = await diseaseApi.detect(farmId!, file, cropId || null, notes || null);
        setResult(res);
        const da = res.diseaseAssessment;
        saveScanToHistory({
          diseaseName: da?.disease || null,
          severity: da?.severity || null,
          cropType: da?.crop || res.cropContext?.cropName || null,
          isPlantLeaf: res.imageAssessment.isPlantImage,
          backendResult: res,
        });
      }
    } catch (err) {
      if (visionMode) {
        console.error('Leaf guard analysis failed:', err);
        setAiFailed(true);
      } else {
        setSubmitError(parseApiError(err).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) return <PageSkeleton />;
  if (pageError) return <ErrorState message={pageError} />;

  const activeCrops = crops.filter((c) => c.status?.toLowerCase() !== 'harvested');

  // ─── Report viewer (from history) ─────────────────────────────
  if (view === 'report' && selectedEntry) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          onClick={backToHub}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t('disease.backToHistory')}
        </button>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            {t('disease.scanReport')}
          </h1>
          <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">
            {formatDate(selectedEntry.scannedAt)}
          </p>
        </div>
        {selectedEntry.thumbnail && (
          <img
            src={selectedEntry.thumbnail}
            alt="Scanned leaf"
            className="w-full max-h-64 object-cover rounded-xl border border-gray-100"
          />
        )}
        {selectedEntry.leafResult && (
          <DiagnosticReportCard result={selectedEntry.leafResult} />
        )}
        {selectedEntry.backendResult && (
          <ResultDisplay result={selectedEntry.backendResult} />
        )}
      </div>
    );
  }

  // ─── Scanner view ─────────────────────────────────────────────
  if (view === 'scanner') {
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          onClick={backToHub}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t('disease.backToHistory')}
        </button>

        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            {t('disease.quickScanPageTitle')}
          </h1>
          <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">
            {t('disease.quickScanPageSubtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Upload form */}
          <div className="space-y-5">
            {/* Image upload zone */}
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Camera className="h-4 w-4 text-gray-500" />
                {t('disease.quickScanUploadLabel')}
              </h3>

              {!preview ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={cn(
                    'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
                    dragOver
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-violet-200 hover:border-violet-300 hover:bg-violet-50/30',
                  )}
                >
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-4">
                    <Camera className="h-7 w-7 text-violet-500" />
                  </div>
                  <p className="text-sm text-gray-700 font-semibold mb-1">{t('disease.quickScanDropzoneTitle')}</p>
                  <p className="text-xs text-gray-500 mb-4">{t('disease.quickScanDropzoneHint')}</p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      {t('disease.quickScanUploadPhoto')}
                    </button>
                    <button
                      type="button"
                      onClick={handleTakePhoto}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 shadow-sm hover:bg-gray-50 transition-colors"
                    >
                      <Camera className="h-4 w-4" />
                      {t('disease.quickScanTakePhoto')}
                    </button>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </div>
              ) : (
                <div className="relative group">
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-64 object-cover rounded-xl border border-gray-100"
                  />
                  <button
                    onClick={removeFile}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('disease.removeImage')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/60 text-white text-xs">
                    {file?.name}
                  </div>
                </div>
              )}

              {fileError && (
                <div className="mt-3">
                  <Alert variant="warning">{fileError}</Alert>
                </div>
              )}
            </Card>

            {/* Notes */}
            <Card className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">{t('disease.notes')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('disease.quickScanNotesPlaceholder')}
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-500 focus:border-primary-500 hover:border-gray-400 transition-colors resize-none"
                />
              </div>
            </Card>

            {/* Submit */}
            <Button
              size="lg"
              className="w-full"
              disabled={!file}
              loading={submitting}
              onClick={handleSubmit}
            >
              <ScanSearch className="h-5 w-5" />
              {submitting ? t('disease.analyzing') : t('disease.analyze')}
            </Button>

            {isVisionAiConfigured() && (
              <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
                <Sparkles className="h-3 w-3" /> {t('disease.visionActive')}
              </p>
            )}

            <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
              <Zap className="h-3 w-3" /> {t('disease.quickScanHint')}
            </p>

            {submitError && (
              <Alert variant="error" title={t('disease.analysisFailed')}>{submitError}</Alert>
            )}
          </div>

          {/* Right column: Results */}
          <div className="space-y-5">
            {!result && !leafResult && !aiFailed && !submitting && (
              <Card className="flex flex-col items-center justify-center py-16 text-center">
                <Microscope className="h-16 w-16 text-gray-200 mb-4" />
                <p className="text-sm text-gray-500">{t('disease.analyzeHint')}</p>
              </Card>
            )}

            {submitting && (
              <Card className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-12 w-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-600 font-medium">{t('disease.analyzing')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('disease.analyzeTimeHint')}</p>
              </Card>
            )}

            {aiFailed && !submitting && (
              <Alert variant="warning" className="py-8">
                <p className="leading-relaxed">{t('disease.aiUnavailable')}</p>
              </Alert>
            )}

            {leafResult && !submitting && (
              leafResult.isPlantLeaf
                ? <DiagnosticReportCard result={leafResult} />
                : <LeafRejectionCard result={leafResult} />
            )}

            {result && <ResultDisplay result={result} />}
          </div>
        </div>

        {/* ─── Desktop Webcam Capture Modal ──────────────────────── */}
        {webcamOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="relative w-full max-w-2xl bg-gray-950 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 bg-black/40">
                <div className="flex items-center gap-2 text-white">
                  <Video className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold">{t('disease.liveCamera')}</span>
                </div>
                <button
                  onClick={closeWebcam}
                  className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Video feed */}
              <div className="relative aspect-video bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {webcamError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 text-center px-6">
                    <AlertTriangle className="h-10 w-10 text-amber-400 mb-3" />
                    <p className="text-sm text-gray-300 max-w-xs">{webcamError}</p>
                  </div>
                )}

                {/* Viewfinder corners */}
                {!webcamError && (
                  <>
                    <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-white/40 rounded-tl-lg" />
                    <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-white/40 rounded-tr-lg" />
                    <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-white/40 rounded-bl-lg" />
                    <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-white/40 rounded-br-lg" />
                  </>
                )}
              </div>

              {/* Capture controls */}
              <div className="flex items-center justify-center gap-4 py-4 bg-black/40">
                <button
                  onClick={closeWebcam}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/15 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={captureFrame}
                  disabled={!!webcamError}
                  className="h-14 w-14 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('disease.capturePhoto')}
                >
                  <StopCircle className="h-6 w-6 text-gray-900" />
                </button>
                <div className="w-[72px]" /> {/* Spacer for centering */}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Hub view (default) ───────────────────────────────────────
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <ScanLine className="h-5 w-5 text-white" />
          </div>
          {t('disease.hubTitle')}
        </h1>
        <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">
          {t('disease.hubSubtitle')}
        </p>
      </div>

      {/* Hero Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 p-8 lg:p-10 shadow-xl shadow-indigo-500/20">
        {/* Decorative elements */}
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
        <div className="absolute top-1/2 right-1/3 h-20 w-20 rounded-full bg-white/[0.03]" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <Leaf className="h-5 w-5 text-white" />
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/15 text-white/90 uppercase tracking-wider backdrop-blur-sm ring-1 ring-white/10">
                {t('disease.aiPowered')}
              </span>
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-white leading-tight">
              {t('disease.scannerTitle')}
            </h2>
            <p className="text-white/80 text-sm lg:text-base max-w-xl leading-relaxed">
              {t('disease.scannerDesc')}
            </p>
          </div>
          <div className="shrink-0">
            <button
              onClick={startNewScan}
              className="inline-flex items-center gap-2.5 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-indigo-700 shadow-lg shadow-black/10 hover:bg-indigo-50 hover:shadow-xl transition-all duration-200 group"
            >
              <ScanSearch className="h-5 w-5" />
              {t('disease.startNewScan')}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Scan History */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Clock className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">{t('disease.recentHistory')}</h2>
          <div className="flex-1 h-px bg-gray-200" />
          {scanHistory.length > 0 && (
            <span className="text-xs text-gray-400 font-medium">{scanHistory.length} {t('disease.scans')}</span>
          )}
        </div>

        {scanHistory.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center mb-5">
              <ScanSearch className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('disease.noHistory')}</h3>
            <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
              {t('disease.noHistoryDesc')}
            </p>
            <button
              onClick={startNewScan}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
            >
              <ScanSearch className="h-4 w-4" />
              {t('disease.startNewScan')}
            </button>
          </div>
        ) : (
          /* History Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {scanHistory.map((entry) => (
              <div
                key={entry.id}
                className="group bg-white rounded-2xl border border-gray-200 hover:border-indigo-300 overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5"
              >
                {/* Thumbnail */}
                <div className="relative h-36 bg-gray-100 overflow-hidden">
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt="Scanned leaf"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Leaf className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  {/* Severity badge overlay */}
                  <div className="absolute top-2 right-2">
                    {entry.severity ? (
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm',
                        entry.severity.toLowerCase().includes('high') || entry.severity.toLowerCase().includes('severe')
                          ? 'bg-red-500 text-white'
                          : entry.severity.toLowerCase().includes('moderate')
                            ? 'bg-amber-400 text-amber-900'
                            : 'bg-emerald-500 text-white',
                      )}>
                        {entry.severity}
                      </span>
                    ) : entry.diseaseName ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-white shadow-sm">
                        {t('disease.healthy')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-500 text-white shadow-sm">
                        {t('disease.rejected')}
                      </span>
                    )}
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(entry.id); }}
                    className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all duration-200"
                    title="Delete scan"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Card body */}
                <div className="p-4 space-y-2.5">
                  <h3 className="font-semibold text-gray-900 text-sm truncate">
                    {entry.diseaseName || (entry.isPlantLeaf ? t('disease.noDiseaseDetected') : t('disease.notAcceptedShort'))}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    {entry.cropType && (
                      <>
                        <Leaf className="h-3 w-3 text-gray-400" />
                        <span>{entry.cropType}</span>
                        <span className="text-gray-300">&bull;</span>
                      </>
                    )}
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span>{formatDate(entry.scannedAt)}</span>
                  </div>
                  <button
                    onClick={() => viewReport(entry)}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors pt-1"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {t('disease.viewFullReport')}
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('disease.deleteScanRecord')}</h3>
              <p className="text-sm text-gray-500">
                {t('disease.deleteScanDesc')}
              </p>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteScanEntry(deleteConfirmId)}
                className="flex-1 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border-l border-gray-100"
              >
                {t('disease.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Result Display ───────────────────────────────────────────────── */
function ResultDisplay({ result }: { result: DiseaseDetectionResponseDto }) {
  // Local reference fallback (AI unavailable): the backend supplies the crop's
  // common diseases plus curated guidance — show that instead of a dead end.
  if (result.isLocalFallback) {
    return <LocalFallbackDisplay result={result} />;
  }

  // Image not accepted
  if (!result.imageAssessment.imageAccepted || !result.imageAssessment.isPlantImage) {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{t('disease.imageAssessment')}</h3>
            <p className="text-xs text-gray-500">{t('disease.imageNotAcceptedDesc')}</p>
          </div>
        </div>
        <p className="text-sm text-gray-700">
          {result.imageAssessment.message || t('disease.notPlant')}
        </p>
        {result.imageAssessment.possiblyBlurry && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {t('disease.blurry')}
          </p>
        )}
      </Card>
    );
  }

  const da = result.diseaseAssessment;
  const advice = result.advice;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Image assessment — compact */}
      <Card padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-gray-900">{t('disease.imageAssessment')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{result.imageAssessment.width}×{result.imageAssessment.height}</span>
            {result.imageAssessment.format && (
              <Badge variant="neutral" size="sm">{result.imageAssessment.format.toUpperCase()}</Badge>
            )}
          </div>
        </div>
        {result.imageAssessment.plantConfidence != null && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">{t('disease.plantConfidence')}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${(result.imageAssessment.plantConfidence * 100).toFixed(0)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-700">
              {(result.imageAssessment.plantConfidence * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </Card>

      {/* Disease assessment */}
      {da && (
        <Card padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center',
              da.detected ? 'bg-red-50' : 'bg-emerald-50',
            )}>
              <Stethoscope className={cn('h-4 w-4', da.detected ? 'text-red-600' : 'text-emerald-600')} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">{t('disease.diseaseAssessment')}</h3>
              <Badge variant={da.detected ? 'danger' : 'success'} size="sm">
                {da.assessmentLevel}
              </Badge>
            </div>
          </div>

          {da.detected && da.disease && (
            <div className="mb-3 p-3 rounded-lg bg-red-50/50 border border-red-100">
              <p className="text-sm font-semibold text-red-800">{da.disease}</p>
              {da.crop && <p className="text-xs text-red-600 mt-0.5">{t('disease.cropPrefix')} {da.crop}</p>}
            </div>
          )}

          {!da.detected && (
            <div className="mb-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
              <p className="text-sm font-semibold text-emerald-800">{t('disease.noDiseaseDetected')}</p>
              {da.explanation && <p className="text-xs text-emerald-600 mt-0.5">{da.explanation}</p>}
            </div>
          )}

          {/* Confidence bar */}
          {da.confidence != null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{t('disease.confidence')}</span>
                <span className="font-medium text-gray-700">{(da.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-700', da.detected ? 'bg-red-500' : 'bg-emerald-500')}
                  style={{ width: `${(da.confidence * 100).toFixed(0)}%` }}
                />
              </div>
            </div>
          )}

          {da.severity && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-gray-500">{t('disease.severity')}:</span>
              <Badge variant={da.severity.toLowerCase().includes('high') || da.severity.toLowerCase().includes('severe') ? 'danger' : da.severity.toLowerCase().includes('moderate') ? 'warning' : 'info'} size="sm">
                {da.severity}
              </Badge>
            </div>
          )}

          {da.explanation && da.detected && (
            <p className="text-xs text-gray-600 mt-2 leading-relaxed">{da.explanation}</p>
          )}

          <p className="text-[10px] text-gray-400 mt-2">{t('disease.sourcePrefix')} {da.assessmentSource}</p>
        </Card>
      )}

      {/* Advice */}
      {advice && <AdviceCard advice={advice} />}

      {/* Provider info */}
      <Card padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-700">{t('disease.provider')}</span>
          </div>
          <div className="text-xs text-gray-500 text-right">
            <span className="font-medium">{result.provider.name}</span>
            {result.provider.model && <span className="text-gray-400"> · {result.provider.model}</span>}
            {result.provider.version && <span className="text-gray-400"> v{result.provider.version}</span>}
          </div>
        </div>
      </Card>

      {/* Disclaimer */}
      <p className="text-[10px] text-gray-400 text-center leading-relaxed px-4">
        {result.disclaimer || t('disease.disclaimer')}
      </p>

      {/* Crop context info */}
      {result.cropContext && (
        <Card padding="sm" className="bg-gray-50/50">
          <p className="text-xs text-gray-500">
            {t('disease.analysisContext')} <span className="font-medium text-gray-700">{result.cropContext.cropName}</span>
            {result.cropContext.season && <span> · {result.cropContext.season}</span>}
            {result.cropContext.growthStage && <span> · {result.cropContext.growthStage}</span>}
            {result.cropContext.plantingDate && <span> · {t('disease.plantedPrefix')} {formatDate(result.cropContext.plantingDate)}</span>}
          </p>
        </Card>
      )}
    </div>
  );
}

/* ─── Report Row ───────────────────────────────────────────────────── */
function ReportRow({ icon, label, value, highlight }: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl border p-3',
      highlight ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-100 bg-gray-50/50',
    )}>
      <span className="text-lg leading-none mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className={cn('text-sm mt-0.5 leading-relaxed break-words', highlight ? 'font-semibold text-gray-900' : 'text-gray-700')}>
          {value}
        </p>
      </div>
    </div>
  );
}


/* ─── Advice card (shared by AI result and local fallback) ─────────── */
function AdviceCard({ advice }: { advice: DiseaseAdviceDto }) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-primary-50 flex items-center justify-center">
          <Leaf className="h-4 w-4 text-primary-600" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900">{t('disease.advice')}</h3>
      </div>

      <p className="text-sm text-gray-700 mb-3 leading-relaxed">{advice.summary}</p>

      {advice.recommendedActions.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> {t('disease.recommendedActions')}
          </h4>
          <ul className="space-y-1">
            {advice.recommendedActions.map((a, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {advice.prevention.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> {t('disease.prevention')}
          </h4>
          <ul className="space-y-1">
            {advice.prevention.map((a, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {advice.monitoring.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
            <Activity className="h-3 w-3" /> {t('disease.monitoring')}
          </h4>
          <ul className="space-y-1">
            {advice.monitoring.map((a, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ─── Gemini Leaf Guard cards ───────────────────────────────────── */

/** Non-plant photo: no report, no pesticides — retake guidance only. */
function LeafRejectionCard({ result }: { result: LeafGuardResult }) {
  return (
    <div className="space-y-3 animate-fade-in">
      <Alert variant="error" title={t('disease.rejectedTitle')}>
        <p className="mt-1 leading-relaxed">{t('disease.rejectedMessage')}</p>
      </Alert>

      {result.rejectionReason && (
        <Card padding="sm">
          <p className="text-xs text-gray-600 leading-relaxed">
            <span className="font-semibold text-gray-800">{t('disease.rejectionReason')}: </span>
            {result.rejectionReason}
          </p>
        </Card>
      )}

      <p className="text-xs text-gray-400 text-center">{t('disease.retakeHint')}</p>
    </div>
  );
}

/** Plant leaf confirmed — the structured diagnostic report. */
function DiagnosticReportCard({ result }: { result: LeafGuardResult }) {
  return (
    <Card className="animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0">
          <Leaf className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{t('disease.report.title')}</h3>
          <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
            <CheckCircle2 className="h-3 w-3" /> {result.servedBy ?? t('disease.visionActive')}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <ReportRow
          icon="🌿"
          label={t('disease.report.healthStatus')}
          value={result.diseaseName ?? t('disease.report.noDisease')}
          highlight
        />
        {result.severity && (
          <ReportRow icon="📊" label={t('disease.report.severity')} value={result.severity} />
        )}
        {result.pesticide && (
          <ReportRow icon="🧪" label={t('disease.report.chemical')} value={result.pesticide} />
        )}
        {result.dosagePerAcre && (
          <ReportRow icon="💧" label={t('disease.report.dosage')} value={result.dosagePerAcre} />
        )}
        {result.prevention && (
          <ReportRow icon="🛡️" label={t('disease.report.prevention')} value={result.prevention} />
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center leading-relaxed mt-4">
        {t('disease.disclaimer')}
      </p>
    </Card>
  );
}

/* ─── Local Reference fallback (AI unavailable) ───────────────────── */
function LocalFallbackDisplay({ result }: { result: DiseaseDetectionResponseDto }) {
  const da = result.diseaseAssessment;
  const advice = result.advice;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Mode banner */}
      <Alert variant="warning" title={t('disease.localModeTitle')}>
        <p className="mt-1">{t('disease.localModeDescription')}</p>
      </Alert>

      {/* Image received confirmation */}
      <Card padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-gray-900">{t('disease.imageAssessment')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{result.imageAssessment.width}×{result.imageAssessment.height}</span>
            {result.imageAssessment.format && (
              <Badge variant="neutral" size="sm">{result.imageAssessment.format.toUpperCase()}</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Common diseases for the crop */}
      {da && (
        <Card padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-amber-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">{t('disease.commonDiseases')}</h3>
          </div>

          {da.commonDiseasesForCrop.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {da.commonDiseasesForCrop.map((d) => (
                <Badge key={d} variant="warning" size="sm">{d}</Badge>
              ))}
            </div>
          )}

          {da.explanation && (
            <p className="text-xs text-gray-600 leading-relaxed">{da.explanation}</p>
          )}
        </Card>
      )}

      {/* Guidance */}
      {advice && <AdviceCard advice={advice} />}

      {/* Missing data notes */}
      {result.missingData.length > 0 && (
        <Card padding="sm" className="bg-gray-50/50">
          <ul className="space-y-1.5">
            {result.missingData.map((m, i) => (
              <li key={i} className="text-xs text-gray-500 flex items-start gap-2">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                {m}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Provider info */}
      <Card padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-700">{t('disease.provider')}</span>
          </div>
          <div className="text-xs text-gray-500 text-right">
            <span className="font-medium">{result.provider.name}</span>
          </div>
        </div>
      </Card>

      {/* Disclaimer + hint */}
      <p className="text-[10px] text-gray-400 text-center leading-relaxed px-4">
        {result.disclaimer || t('disease.disclaimer')}
      </p>
      <p className="text-[10px] text-gray-400 text-center leading-relaxed px-4">
        {t('disease.localModeHint')}
      </p>
    </div>
  );
}
