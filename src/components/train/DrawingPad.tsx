import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import {
  normalizeCanvasToImage,
  type NormalizedImageResult,
} from '../../media/imageProcessor';
import type { TranslationKey } from '../../types/i18n';

export interface DrawingPadProps {
  mode: 'modal' | 'inline';
  labelName?: string;
  onAddSample?: (image: NormalizedImageResult) => Promise<void>;
  onClose?: () => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  onDrawingChange?: (hasDrawn: boolean) => void;
}

const CANVAS_SIZE = 256;
const COLOR_OPTIONS = ['#0f172a', '#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed'];

export function DrawingPad({
  mode,
  labelName = '',
  onAddSample,
  onClose,
  onCanvasReady,
  onDrawingChange,
}: DrawingPadProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeColor, setStrokeColor] = useState('#0f172a');
  const [brushSize, setBrushSize] = useState(12);
  const [autoClear, setAutoClear] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fillWhiteBackground = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const clearCanvas = useCallback(() => {
    fillWhiteBackground();
    isDrawingRef.current = false;
    lastPointRef.current = null;
    setHasDrawn(false);
    setErrorKey(null);
    onDrawingChange?.(false);
  }, [fillWhiteBackground, onDrawingChange]);

  useEffect(() => {
    fillWhiteBackground();
    onCanvasReady?.(canvasRef.current);
    return () => {
      onCanvasReady?.(null);
    };
  }, [fillWhiteBackground, onCanvasReady]);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      isDrawingRef.current = false;
      lastPointRef.current = null;
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

  const getCanvasCoordinates = (
    event: ReactMouseEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const drawStrokeSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activeColor = tool === 'eraser' ? '#ffffff' : strokeColor;
    const activeWidth = tool === 'eraser' ? brushSize * 1.8 : brushSize;

    ctx.save();
    ctx.strokeStyle = activeColor;
    ctx.fillStyle = activeColor;
    ctx.lineWidth = activeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(to.x, to.y, activeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoordinates(event);
    if (!pt) return;
    isDrawingRef.current = true;
    lastPointRef.current = pt;
    drawStrokeSegment(pt, pt);
    if (!hasDrawn) {
      setHasDrawn(true);
      onDrawingChange?.(true);
    }
    if (errorKey) {
      setErrorKey(null);
    }
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pt = getCanvasCoordinates(event);
    if (!pt) return;
    const prev = lastPointRef.current ?? pt;
    drawStrokeSegment(prev, pt);
    lastPointRef.current = pt;
    if (!hasDrawn) {
      setHasDrawn(true);
      onDrawingChange?.(true);
    }
  };

  const handleMouseUp = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleAddSample = async () => {
    if (!hasDrawn) {
      setErrorKey('validation.blankCanvas');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !onAddSample) return;

    setErrorKey(null);
    setIsSaving(true);
    try {
      const normalized = normalizeCanvasToImage(canvas);
      await onAddSample(normalized);
      if (autoClear) {
        clearCanvas();
      }
    } catch {
      setErrorKey('errors.imageLoadFailed');
    } finally {
      setIsSaving(false);
    }
  };

  const padContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="drawing-pen-btn"
            onClick={() => setTool('pen')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tool === 'pen'
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t('train.drawingPenTool')}
          </button>
          <button
            type="button"
            data-testid="drawing-eraser-btn"
            onClick={() => setTool('eraser')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tool === 'eraser'
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t('train.drawingEraserTool')}
          </button>
          <button
            type="button"
            data-testid="drawing-clear-btn"
            onClick={clearCanvas}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t('train.drawingClearBtn')}
          </button>
        </div>

        <div className="flex items-center gap-1.5" aria-label={t('train.drawingColorLabel')}>
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                setStrokeColor(color);
                setTool('pen');
              }}
              style={{ backgroundColor: color }}
              aria-label={color}
              className={`h-6 w-6 rounded-full border-2 transition ${
                strokeColor === color && tool === 'pen'
                  ? 'scale-110 border-indigo-600 ring-2 ring-indigo-200'
                  : 'border-white shadow-xs'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-600">
        <label htmlFor="drawing-brush-size" className="font-medium">
          {t('train.drawingBrushSize')}: {brushSize}px
        </label>
        <input
          id="drawing-brush-size"
          type="range"
          min={4}
          max={28}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="h-1.5 w-32 cursor-pointer accent-indigo-600"
        />
      </div>

      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          data-testid="drawing-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="h-64 w-64 cursor-crosshair rounded-2xl border-2 border-slate-300 bg-white shadow-inner select-none"
        />
      </div>

      {errorKey ? (
        <div
          data-testid="drawing-error-banner"
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
        >
          {t(errorKey)}
        </div>
      ) : null}

      {mode === 'modal' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              data-testid="drawing-auto-clear-toggle"
              checked={autoClear}
              onChange={(e) => setAutoClear(e.target.checked)}
              className="rounded-sm border-slate-300 text-indigo-600"
            />
            {t('train.drawingAutoClear')}
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="drawing-close-btn"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              data-testid="drawing-add-sample-btn"
              disabled={isSaving}
              onClick={handleAddSample}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('train.drawingAddSampleBtn')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (mode === 'inline') {
    return padContent;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t('train.drawingModalTitle', { label: labelName })}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            {t('train.drawingModalTitle', { label: labelName })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        {padContent}
      </div>
    </div>
  );
}
