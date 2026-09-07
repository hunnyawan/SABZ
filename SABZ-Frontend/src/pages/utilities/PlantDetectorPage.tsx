import { useState, useRef, useCallback, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { formatDate, cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import {
  ArrowLeft, Upload, X, Camera, ScanSearch, Leaf, ShieldCheck,
  AlertTriangle, CheckCircle2, Info, Microscope, Sparkles, Zap,
  Clock, FileText, ChevronRight, StopCircle, Video, Trash2,
  Sun, Droplets, Thermometer, Sprout, Flower2, TreePine,
} from 'lucide-react';
import { analyzePlantImage, isVisionAiConfigured } from '@/lib/geminiVision';
import type { PlantDetectorResult } from '@/lib/geminiVision';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const STORAGE_KEY = 'sabz-plant-detector-history';

interface ScanHistoryEntry {
  id: string;
  scannedAt: string;
  thumbnail: string;
  commonName: string | null;
  plantType: string | null;
  isPlant: boolean;
  result?: PlantDetectorResult;
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

export function PlantDetectorPage() {
  // Hub state
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [view, setView] = useState<'hub' | 'scanner' | 'report'>('hub');
  const [selectedEntry, setSelectedEntry] = useState<ScanHistoryEntry | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Scanner form state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [plantResult, setPlantResult] = useState<PlantDetectorResult | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
      setWebcamError(t('plant.cameraError'));
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
    const id = setTimeout(() => startWebcam(), 100);
    return () => {
      clearTimeout(id);
      closeWebcam();
    };
  }, [webcamOpen, startWebcam, closeWebcam]);

  /** Capture a single frame from the live video into a File. */
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
    setPlantResult(null);
    setAiFailed(false);
    setSubmitError(null);
    setFile(null);
    setPreview(null);
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
    setSubmitting(true);
    setSubmitError(null);
    setPlantResult(null);
    setAiFailed(false);
    try {
      const res = await analyzePlantImage(file, notes || undefined);
      setPlantResult(res);
      if (res.isPlant) {
        saveScanToHistory({
          commonName: res.commonName,
          plantType: res.plantType,
          isPlant: true,
          result: res,
        });
      } else {
        removeFile();
      }
    } catch (err) {
      console.error('Plant detection failed:', err);
      setAiFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Report viewer (from history) ─────────────────────────────
  if (view === 'report' && selectedEntry) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          onClick={backToHub}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t('plant.backToHistory')}
        </button>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            {t('plant.reportTitle')}
          </h1>
          <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">
            {formatDate(selectedEntry.scannedAt)}
          </p>
        </div>
        {selectedEntry.thumbnail && (
          <img
            src={selectedEntry.thumbnail}
            alt="Scanned plant"
            className="w-full max-h-64 object-cover rounded-xl border border-gray-100"
          />
        )}
        {selectedEntry.result && (
          <PlantResultCard result={selectedEntry.result} />
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
          <ArrowLeft className="h-4 w-4" /> {t('plant.backToHistory')}
        </button>

        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <Sprout className="h-5 w-5 text-white" />
            </div>
            {t('plant.title')}
          </h1>
          <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">
            {t('plant.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Upload form */}
          <div className="space-y-5">
            {/* Image upload zone */}
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Camera className="h-4 w-4 text-gray-500" />
                {t('plant.captureTitle')}
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
                      : 'border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/30',
                  )}
                >
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center mx-auto mb-4">
                    <Camera className="h-7 w-7 text-emerald-500" />
                  </div>
                  <p className="text-sm text-gray-700 font-semibold mb-1">{t('plant.dragDrop')}</p>
                  <p className="text-xs text-gray-500 mb-4">{t('plant.formatHint')}</p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      {t('plant.uploadBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={handleTakePhoto}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 shadow-sm hover:bg-gray-50 transition-colors"
                    >
                      <Camera className="h-4 w-4" />
                      {t('plant.takePhoto')}
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
                    title={t('plant.removeImage')}
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
                <label className="block text-sm font-medium text-gray-700">{t('plant.notesLabel')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('plant.notesPlaceholder')}
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
              {submitting ? t('plant.analyzing') : t('plant.analyzeBtn')}
            </Button>

            {isVisionAiConfigured() && (
              <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
                <Sparkles className="h-3 w-3" /> {t('plant.poweredBy')}
              </p>
            )}

            <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
              <Zap className="h-3 w-3" /> {t('plant.worksWith')}
            </p>

            {submitError && (
              <Alert variant="error" title={t('plant.analysisFailed')}>{submitError}</Alert>
            )}
          </div>

          {/* Right column: Results */}
          <div className="space-y-5">
            {!plantResult && !aiFailed && !submitting && (
              <Card className="flex flex-col items-center justify-center py-16 text-center">
                <Microscope className="h-16 w-16 text-gray-200 mb-4" />
                <p className="text-sm text-gray-500">{t('disease.analyzeHint')}</p>
              </Card>
            )}

            {submitting && (
              <Card className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-12 w-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-600 font-medium">{t('disease.analyzingPlant')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('disease.analyzeTimeHint')}</p>
              </Card>
            )}

            {aiFailed && !submitting && (
              <Alert variant="warning" className="py-8">
                <p className="leading-relaxed">{t('disease.aiAnalysisUnavailable')}</p>
              </Alert>
            )}

            {plantResult && !submitting && (
              plantResult.isPlant
                ? <PlantResultCard result={plantResult} />
                : <PlantRejectionCard result={plantResult} />
            )}
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
                  <span className="text-sm font-semibold">{t('plant.liveCamera')}</span>
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
                  {t('plant.cancel')}
                </button>
                <button
                  onClick={captureFrame}
                  disabled={!!webcamError}
                  className="h-14 w-14 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('plant.capturePhoto')}
                >
                  <StopCircle className="h-6 w-6 text-gray-900" />
                </button>
                <div className="w-[72px]" />
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
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
            <Sprout className="h-5 w-5 text-white" />
          </div>
          {t('plant.title')}
        </h1>
        <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">
          {t('plant.subtitle')}
        </p>
      </div>

      {/* Hero Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-green-600 to-teal-700 p-8 lg:p-10 shadow-xl shadow-emerald-500/20">
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
                {t('plant.aiPowered')}
              </span>
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-white leading-tight">
              {t('plant.scannerTitle')}
            </h2>
            <p className="text-white/80 text-sm lg:text-base max-w-xl leading-relaxed">
              {t('plant.scannerDesc')}
            </p>
          </div>
          <div className="shrink-0">
            <button
              onClick={startNewScan}
              className="inline-flex items-center gap-2.5 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-emerald-700 shadow-lg shadow-black/10 hover:bg-emerald-50 hover:shadow-xl transition-all duration-200 group"
            >
              <ScanSearch className="h-5 w-5" />
              {t('plant.startNewScan')}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Scan History */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Clock className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">{t('plant.recentHistory')}</h2>
          <div className="flex-1 h-px bg-gray-200" />
          {scanHistory.length > 0 && (
            <span className="text-xs text-gray-400 font-medium">{scanHistory.length} {t('plant.scans')}</span>
          )}
        </div>

        {scanHistory.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center mb-5">
              <ScanSearch className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('plant.noHistory')}</h3>
            <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
              {t('plant.noHistoryDesc')}
            </p>
            <button
              onClick={startNewScan}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              <ScanSearch className="h-4 w-4" />
              {t('plant.startNewScan')}
            </button>
          </div>
        ) : (
          /* History Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {scanHistory.map((entry) => (
              <div
                key={entry.id}
                className="group bg-white rounded-2xl border border-gray-200 hover:border-emerald-300 overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-0.5"
              >
                {/* Thumbnail */}
                <div className="relative h-36 bg-gray-100 overflow-hidden">
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt="Scanned plant"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Leaf className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  {/* Plant type badge overlay */}
                  <div className="absolute top-2 right-2">
                    {entry.plantType ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-white shadow-sm">
                        {entry.plantType}
                      </span>
                    ) : entry.isPlant ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-white shadow-sm">
                        {t('plant.plant')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-500 text-white shadow-sm">
                        {t('plant.rejected')}
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
                    {entry.commonName || (entry.isPlant ? t('plant.plantIdentified') : t('plant.imageNotAccepted'))}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    {entry.plantType && (
                      <>
                        <Leaf className="h-3 w-3 text-gray-400" />
                        <span>{entry.plantType}</span>
                        <span className="text-gray-300">&bull;</span>
                      </>
                    )}
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span>{formatDate(entry.scannedAt)}</span>
                  </div>
                  <button
                    onClick={() => viewReport(entry)}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors pt-1"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {t('plant.viewReport')}
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('plant.deleteScan')}</h3>
              <p className="text-sm text-gray-500">
                {t('plant.deleteConfirm')}
              </p>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('plant.cancel')}
              </button>
              <button
                onClick={() => deleteScanEntry(deleteConfirmId)}
                className="flex-1 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border-l border-gray-100"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Plant Result Card ───────────────────────────────────────────── */
function PlantResultCard({ result }: { result: PlantDetectorResult }) {
  return (
    <Card className="animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0">
          <Leaf className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{t('plant.plantIdentified')}</h3>
          <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
            <CheckCircle2 className="h-3 w-3" /> {result.servedBy ?? t('plant.poweredBy')}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Plant Name */}
        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{t('plant.plantName')}</p>
          <p className="text-lg font-bold text-gray-900">{result.commonName ?? 'Unknown'}</p>
          {result.scientificName && (
            <p className="text-sm text-gray-600 italic mt-0.5">{result.scientificName}</p>
          )}
        </div>

        {/* Plant Type & Family */}
        <div className="grid grid-cols-2 gap-3">
          {result.plantType && (
            <div className="p-3 rounded-xl border border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2 mb-1">
                <Sprout className="h-4 w-4 text-emerald-500" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('plant.type')}</p>
              </div>
              <p className="text-sm font-medium text-gray-900">{result.plantType}</p>
            </div>
          )}
          {result.family && (
            <div className="p-3 rounded-xl border border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2 mb-1">
                <Flower2 className="h-4 w-4 text-pink-500" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('plant.family')}</p>
              </div>
              <p className="text-sm font-medium text-gray-900">{result.family}</p>
            </div>
          )}
        </div>

        {/* Growing Conditions */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-500" />
            {t('plant.growingConditions')}
          </h4>
          <div className="space-y-2">
            {result.soilType && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/50 border border-amber-100">
                <TreePine className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('plant.soilType')}</p>
                  <p className="text-sm text-gray-700">{result.soilType}</p>
                </div>
              </div>
            )}
            {result.sunlight && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50/50 border border-yellow-100">
                <Sun className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('plant.sunlight')}</p>
                  <p className="text-sm text-gray-700">{result.sunlight}</p>
                </div>
              </div>
            )}
            {result.temperature && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50/50 border border-orange-100">
                <Thermometer className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('plant.temperature')}</p>
                  <p className="text-sm text-gray-700">{result.temperature}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Water & Fertilizer */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" />
            {t('plant.waterFertilizer')}
          </h4>
          <div className="space-y-2">
            {result.waterRequirements && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50/50 border border-blue-100">
                <Droplets className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('plant.water')}</p>
                  <p className="text-sm text-gray-700">{result.waterRequirements}</p>
                </div>
              </div>
            )}
            {result.fertilizerRequirements && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50/50 border border-green-100">
                <Sprout className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('plant.fertilizer')}</p>
                  <p className="text-sm text-gray-700">{result.fertilizerRequirements}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Uses & Benefits */}
        {(result.uses || result.benefits) && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary-500" />
              {t('plant.usesBenefits')}
            </h4>
            <div className="space-y-2">
              {result.uses && (
                <div className="p-3 rounded-lg bg-primary-50/50 border border-primary-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{t('plant.uses')}</p>
                  <p className="text-sm text-gray-700">{result.uses}</p>
                </div>
              )}
              {result.benefits && (
                <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{t('plant.benefits')}</p>
                  <p className="text-sm text-gray-700">{result.benefits}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Care Tips */}
        {result.careTips && (
          <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100">
            <h4 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Info className="h-4 w-4 text-indigo-500" />
              {t('plant.careTips')}
            </h4>
            <p className="text-sm text-gray-700 leading-relaxed">{result.careTips}</p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center leading-relaxed mt-4">
        {t('plant.aiDisclaimer')}
      </p>
    </Card>
  );
}

/* ─── Plant Rejection Card ────────────────────────────────────────── */
function PlantRejectionCard({ result }: { result: PlantDetectorResult }) {
  return (
    <div className="space-y-3 animate-fade-in">
      <Alert variant="error" title={t('plant.notAPlant')}>
        <p className="mt-1 leading-relaxed">{t('plant.rejectedDesc')}</p>
      </Alert>

      {result.rejectionReason && (
        <Card padding="sm">
          <p className="text-xs text-gray-600 leading-relaxed">
            <span className="font-semibold text-gray-800">{t('plant.reason')} </span>
            {result.rejectionReason}
          </p>
        </Card>
      )}

      <p className="text-xs text-gray-400 text-center">{t('plant.uploadPlantDesc')}</p>
    </div>
  );
}
