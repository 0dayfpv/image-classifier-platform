import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { mapWebcamErrorCodeToKey } from '../../hooks/uiHelpers';
import { useTranslation } from '../../i18n/useTranslation';
import {
  ImageProcessingError,
  loadImageElement,
  normalizeFileToImage,
} from '../../media/imageProcessor';
import {
  WebcamError,
  attachStreamToVideo,
  classifyWebcamError,
  startWebcamStream,
  stopWebcamStream,
} from '../../media/webcamService';
import type { LabelBucketRecord } from '../../types/domain';
import type { TranslationKey } from '../../types/i18n';
import type { ClassPrediction, ImageInputSource } from '../../types/ml';
import { DrawingPad } from '../train/DrawingPad';
import { ConfidenceBars } from './ConfidenceBars';

export interface LiveTestPanelProps {
  isTrained: boolean;
  labels: LabelBucketRecord[];
  predictions: ClassPrediction[];
  onPredict: (input: ImageInputSource) => Promise<ClassPrediction[]>;
}

type TestTab = 'upload' | 'drawing' | 'webcam';

export function LiveTestPanel({
  isTrained,
  labels,
  predictions,
  onPredict,
}: LiveTestPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TestTab>('upload');
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadErrorKey, setUploadErrorKey] = useState<TranslationKey | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  const uploadedImgRef = useRef<HTMLImageElement | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);

  const [isWebcamRunning, setIsWebcamRunning] = useState(false);
  const [webcamErrorKey, setWebcamErrorKey] = useState<TranslationKey | null>(null);

  const stopWebcamLoop = useCallback(() => {
    if (loopTimerRef.current !== null) {
      window.clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    stopWebcamStream(streamRef.current, videoRef.current);
    streamRef.current = null;
    setIsWebcamRunning(false);
  }, []);

  const startWebcamLoop = useCallback(async () => {
    setWebcamErrorKey(null);
    stopWebcamLoop();
    try {
      const stream = await startWebcamStream();
      streamRef.current = stream;
      if (videoRef.current) {
        await attachStreamToVideo(videoRef.current, stream);
      }
      setIsWebcamRunning(true);

      loopTimerRef.current = window.setInterval(() => {
        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          void onPredict(video).catch(() => undefined);
        }
      }, 350);
    } catch (err) {
      const webcamErr =
        err instanceof WebcamError ? err : classifyWebcamError(err);
      setWebcamErrorKey(mapWebcamErrorCodeToKey(webcamErr.code));
      setIsWebcamRunning(false);
    }
  }, [onPredict, stopWebcamLoop]);

  useEffect(() => {
    return () => {
      stopWebcamLoop();
    };
  }, [stopWebcamLoop]);

  const handleSelectTab = (tab: TestTab) => {
    if (tab !== 'webcam') {
      stopWebcamLoop();
      setWebcamErrorKey(null);
    }
    setActiveTab(tab);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadErrorKey(null);
    setIsProcessingUpload(true);
    try {
      const normalized = await normalizeFileToImage(file);
      const imgEl = await loadImageElement(normalized.dataUrl);
      uploadedImgRef.current = imgEl;
      setUploadPreviewUrl(normalized.dataUrl);
      if (isTrained) {
        await onPredict(imgEl);
      }
    } catch (err) {
      if (err instanceof ImageProcessingError && err.code === 'UNSUPPORTED_FILE_TYPE') {
        setUploadErrorKey('errors.unsupportedFileType');
      } else {
        setUploadErrorKey('errors.imageLoadFailed');
      }
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handlePredictClick = async () => {
    if (!isTrained) return;
    if (activeTab === 'upload' && uploadedImgRef.current) {
      await onPredict(uploadedImgRef.current);
    } else if (activeTab === 'drawing' && drawingCanvasRef.current) {
      await onPredict(drawingCanvasRef.current);
    } else if (activeTab === 'webcam' && videoRef.current) {
      if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
        await onPredict(videoRef.current);
      }
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <h3 className="text-base font-bold text-slate-900">
          {t('learn.liveTestHeading')}
        </h3>

        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            data-testid="live-test-webcam-tab"
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
            data-testid="live-test-upload-tab"
            onClick={() => handleSelectTab('upload')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'upload'
                ? 'bg-white text-indigo-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('learn.tabUpload')}
          </button>
          <button
            type="button"
            data-testid="live-test-drawing-tab"
            onClick={() => handleSelectTab('drawing')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'drawing'
                ? 'bg-white text-indigo-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('learn.tabDrawing')}
          </button>
        </div>
      </div>

      {!isTrained ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          {t('learn.liveTestUntrainedPrompt')}
        </div>
      ) : (
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
                    data-testid="live-test-file-input"
                    onChange={handleFileChange}
                    className="mt-2 text-xs text-slate-500"
                  />
                </label>

                {uploadErrorKey ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700"
                  >
                    {t(uploadErrorKey)}
                  </div>
                ) : null}

                {uploadPreviewUrl ? (
                  <div className="flex justify-center">
                    <img
                      src={uploadPreviewUrl}
                      alt="Test preview"
                      className="h-48 w-48 rounded-xl border border-slate-200 object-contain"
                    />
                  </div>
                ) : null}

                <button
                  type="button"
                  data-testid="live-test-predict-btn"
                  disabled={isProcessingUpload}
                  onClick={handlePredictClick}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {t('learn.classifyBtn')}
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
                  data-testid="live-test-predict-btn"
                  onClick={handlePredictClick}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  {t('learn.classifyBtn')}
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
                  {!isWebcamRunning ? (
                    <button
                      type="button"
                      onClick={startWebcamLoop}
                      className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    >
                      {t('learn.startLiveTest')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopWebcamLoop}
                      className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
                    >
                      {t('learn.stopLiveTest')}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <ConfidenceBars predictions={predictions} labels={labels} />
          </div>
        </div>
      )}
    </div>
  );
}
