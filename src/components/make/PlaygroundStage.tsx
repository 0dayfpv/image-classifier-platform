import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  buildDefaultReaction,
  mapWebcamErrorCodeToKey,
} from '../../hooks/uiHelpers';
import { useTranslation } from '../../i18n/useTranslation';
import {
  loadImageElement,
  normalizeFileToImage,
} from '../../media/imageProcessor';
import { playSound } from '../../media/soundSynth';
import {
  WebcamError,
  attachStreamToVideo,
  classifyWebcamError,
  startWebcamStream,
  stopWebcamStream,
} from '../../media/webcamService';
import type { LabelBucketRecord, ReactionConfig } from '../../types/domain';
import type { TranslationKey } from '../../types/i18n';
import type { ClassPrediction, ImageInputSource } from '../../types/ml';
import { DrawingPad } from '../train/DrawingPad';

export interface PlaygroundStageProps {
  labels: LabelBucketRecord[];
  reactions: Record<string, ReactionConfig>;
  onPredict: (input: ImageInputSource) => Promise<ClassPrediction[]>;
}

type MakeInputTab = 'upload' | 'drawing' | 'webcam';

interface TriggerState {
  statusType: 'triggered' | 'below_threshold';
  labelId: string;
  labelName: string;
  confidence: number;
  message: string;
  color: string | null;
}

export function PlaygroundStage({
  labels,
  reactions,
  onPredict,
}: PlaygroundStageProps) {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<MakeInputTab>('upload');
  const [thresholdText, setThresholdText] = useState('50');
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [triggerState, setTriggerState] = useState<TriggerState | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  const uploadedImgRef = useRef<HTMLImageElement | null>(null);
  const cachedUploadPredsRef = useRef<ClassPrediction[] | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);

  const [isControllerRunning, setIsControllerRunning] = useState(false);
  const [webcamErrorKey, setWebcamErrorKey] = useState<TranslationKey | null>(null);

  const numericThreshold = Math.max(
    0,
    Math.min(100, Number.isFinite(Number(thresholdText)) ? Number(thresholdText) : 50)
  );

  const evaluatePredictions = useCallback(
    (preds: ClassPrediction[]) => {
      if (preds.length === 0) return;
      const top = preds[0];
      const labelObj = labels.find((l) => l.id === top.labelId);
      const labelName = labelObj?.name ?? top.labelName;

      if (top.percentage < numericThreshold) {
        setTriggerState({
          statusType: 'below_threshold',
          labelId: top.labelId,
          labelName,
          confidence: top.percentage,
          message: '',
          color: null,
        });
        return;
      }

      const fallbackLabel: LabelBucketRecord = labelObj ?? {
        id: top.labelId,
        projectId: '',
        name: labelName,
        color: '#2563eb',
        order: 0,
        createdAt: 0,
      };
      const reaction =
        reactions[top.labelId] ?? buildDefaultReaction(fallbackLabel);
      const resolvedMessage =
        reaction.message.trim() ||
        t('make.customMessagePlaceholder', { label: labelName });

      if (reaction.sound && reaction.sound !== 'none') {
        playSound(reaction.sound);
      }

      if (reaction.enableCounter) {
        setCounters((prev) => ({
          ...prev,
          [top.labelId]: (prev[top.labelId] ?? 0) + 1,
        }));
      }

      setTriggerState({
        statusType: 'triggered',
        labelId: top.labelId,
        labelName,
        confidence: top.percentage,
        message: resolvedMessage,
        color: reaction.backgroundColor || '#2563eb',
      });
    },
    [labels, numericThreshold, reactions, t]
  );

  const stopWebcamController = useCallback(() => {
    if (loopTimerRef.current !== null) {
      window.clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    stopWebcamStream(streamRef.current, videoRef.current);
    streamRef.current = null;
    setIsControllerRunning(false);
  }, []);

  const startWebcamController = useCallback(async () => {
    setWebcamErrorKey(null);
    stopWebcamController();
    try {
      const stream = await startWebcamStream();
      streamRef.current = stream;
      if (videoRef.current) {
        await attachStreamToVideo(videoRef.current, stream);
      }
      setIsControllerRunning(true);

      loopTimerRef.current = window.setInterval(() => {
        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          void onPredict(video)
            .then((preds) => evaluatePredictions(preds))
            .catch(() => undefined);
        }
      }, 450);
    } catch (err) {
      const webcamErr =
        err instanceof WebcamError ? err : classifyWebcamError(err);
      setWebcamErrorKey(mapWebcamErrorCodeToKey(webcamErr.code));
      setIsControllerRunning(false);
    }
  }, [evaluatePredictions, onPredict, stopWebcamController]);

  useEffect(() => {
    return () => {
      stopWebcamController();
    };
  }, [stopWebcamController]);

  const handleSelectTab = (tab: MakeInputTab) => {
    if (tab !== 'webcam') {
      stopWebcamController();
      setWebcamErrorKey(null);
    }
    setActiveTab(tab);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsProcessingUpload(true);
    cachedUploadPredsRef.current = null;
    try {
      const normalized = await normalizeFileToImage(file);
      const imgEl = await loadImageElement(normalized.dataUrl);
      uploadedImgRef.current = imgEl;
      setUploadPreviewUrl(normalized.dataUrl);
      const preds = await onPredict(imgEl);
      cachedUploadPredsRef.current = preds;
    } catch {
      // Ignore decode failure in playground picker
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleTriggerTest = async () => {
    if (activeTab === 'upload') {
      if (cachedUploadPredsRef.current) {
        evaluatePredictions(cachedUploadPredsRef.current);
        return;
      }
      if (uploadedImgRef.current) {
        const preds = await onPredict(uploadedImgRef.current);
        cachedUploadPredsRef.current = preds;
        evaluatePredictions(preds);
      }
      return;
    }

    let source: ImageInputSource | null = null;
    if (activeTab === 'drawing') {
      source = drawingCanvasRef.current;
    } else if (activeTab === 'webcam') {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        source = video;
      }
    }

    if (!source) return;
    const preds = await onPredict(source);
    evaluatePredictions(preds);
  };

  const handleResetCounters = () => {
    const zeroed: Record<string, number> = {};
    for (const label of labels) {
      zeroed[label.id] = 0;
    }
    setCounters(zeroed);
  };

  const activeStageStyle =
    triggerState?.statusType === 'triggered' && triggerState.color
      ? {
          backgroundColor: triggerState.color,
          borderColor: triggerState.color,
        }
      : undefined;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <h3 className="text-base font-bold text-slate-900">
          {t('make.playgroundHeading')}
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <span>{t('make.thresholdLabel')}</span>
            <input
              type="number"
              min={0}
              max={100}
              data-testid="reaction-threshold-input"
              value={thresholdText}
              onChange={(e) => setThresholdText(e.target.value)}
              className="w-18 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
            />
          </label>

          <button
            type="button"
            data-testid="reset-counters-btn"
            onClick={handleResetCounters}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t('make.resetCountersBtn')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 w-fit">
        <button
          type="button"
          data-testid="make-webcam-tab"
          onClick={() => handleSelectTab('webcam')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'webcam'
              ? 'bg-white text-indigo-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('learn.tabWebcam')}
        </button>
        <button
          type="button"
          data-testid="make-drawing-tab"
          onClick={() => handleSelectTab('drawing')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'drawing'
              ? 'bg-white text-indigo-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('learn.tabDrawing')}
        </button>
        <button
          type="button"
          data-testid="make-upload-tab"
          onClick={() => handleSelectTab('upload')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'upload'
              ? 'bg-white text-indigo-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('learn.tabUpload')}
        </button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {activeTab === 'upload' ? (
            <div className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-indigo-400">
                <span className="text-xs font-semibold text-indigo-600">
                  {t('learn.uploadTestPrompt')}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  data-testid="make-file-input"
                  onChange={handleFileChange}
                  className="mt-2 text-xs text-slate-500"
                />
              </label>

              {uploadPreviewUrl ? (
                <div className="flex justify-center">
                  <img
                    src={uploadPreviewUrl}
                    alt="Make test preview"
                    className="h-44 w-44 rounded-xl border border-slate-200 object-contain"
                  />
                </div>
              ) : null}

              <button
                type="button"
                data-testid="make-test-btn"
                disabled={isProcessingUpload}
                onClick={handleTriggerTest}
                className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {t('make.testReactionBtn')}
              </button>
            </div>
          ) : null}

          {activeTab === 'drawing' ? (
            <div className="space-y-3">
              <DrawingPad
                mode="inline"
                onCanvasReady={(canvas) => {
                  drawingCanvasRef.current = canvas;
                }}
              />
              <button
                type="button"
                data-testid="make-test-btn"
                onClick={handleTriggerTest}
                className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                {t('make.testReactionBtn')}
              </button>
            </div>
          ) : null}

          {activeTab === 'webcam' ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className="aspect-video w-full object-cover"
                />
              </div>

              {webcamErrorKey ? (
                <div
                  data-testid="webcam-error-banner"
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
                >
                  {t(webcamErrorKey)}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                {!isControllerRunning ? (
                  <button
                    type="button"
                    onClick={startWebcamController}
                    className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    {t('make.startLiveController')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopWebcamController}
                    className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
                  >
                    {t('make.stopLiveController')}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="make-test-btn"
                  onClick={handleTriggerTest}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {t('make.testReactionBtn')}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-between space-y-4">
          {triggerState ? (
            <div
              data-testid="make-status-banner"
              className={`rounded-xl border px-4 py-2.5 text-xs font-semibold ${
                triggerState.statusType === 'triggered'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {triggerState.statusType === 'triggered'
                ? t('make.triggeredStatus', {
                    label: triggerState.labelName,
                    confidence: triggerState.confidence.toFixed(1),
                  })
                : t('make.belowThresholdStatus', {
                    label: triggerState.labelName,
                    confidence: triggerState.confidence.toFixed(1),
                  })}
            </div>
          ) : null}

          <div
            data-testid="playground-stage"
            style={activeStageStyle}
            className="flex flex-1 flex-col items-center justify-between rounded-2xl border-2 border-slate-200 bg-slate-50 p-6 text-center transition-all duration-200"
          >
            <div className="my-auto py-6">
              <p
                data-testid="playground-message"
                className={`text-xl font-bold ${
                  activeStageStyle ? 'text-white drop-shadow-xs' : 'text-slate-800'
                }`}
              >
                {triggerState?.statusType === 'triggered'
                  ? triggerState.message
                  : t('make.waitingForTrigger', { threshold: numericThreshold })}
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-2">
              {labels.map((label) => {
                const count = counters[label.id] ?? 0;
                return (
                  <div
                    key={label.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/95 px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-2xs"
                  >
                    <span className="truncate">{label.name}</span>
                    <span
                      data-testid="reaction-counter-value"
                      className="rounded-md bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700"
                    >
                      {t('make.counterValue', { count })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
