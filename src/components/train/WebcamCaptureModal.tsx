import { useCallback, useEffect, useRef, useState } from 'react';
import { mapWebcamErrorCodeToKey } from '../../hooks/uiHelpers';
import { useTranslation } from '../../i18n/useTranslation';
import type { NormalizedImageResult } from '../../media/imageProcessor';
import {
  WebcamError,
  attachStreamToVideo,
  captureWebcamFrame,
  classifyWebcamError,
  startWebcamStream,
  stopWebcamStream,
} from '../../media/webcamService';
import type { TranslationKey } from '../../types/i18n';

export interface WebcamCaptureModalProps {
  isOpen: boolean;
  labelName: string;
  onCaptureSample: (image: NormalizedImageResult) => Promise<void>;
  onClose: () => void;
}

export function WebcamCaptureModal({
  isOpen,
  labelName,
  onCaptureSample,
  onClose,
}: WebcamCaptureModalProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const pendingChainRef = useRef<Promise<void>>(Promise.resolve());

  const [isReady, setIsReady] = useState(false);
  const [isBursting, setIsBursting] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const stopBurst = useCallback(() => {
    if (burstTimerRef.current !== null) {
      window.clearInterval(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    setIsBursting(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const videoEl = videoRef.current;

    (async () => {
      try {
        const stream = await startWebcamStream();
        if (cancelled) {
          stopWebcamStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          await attachStreamToVideo(videoRef.current, stream);
        }
        if (!cancelled) {
          setIsReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        const webcamErr =
          err instanceof WebcamError ? err : classifyWebcamError(err);
        setErrorKey(mapWebcamErrorCodeToKey(webcamErr.code));
        setIsReady(false);
      }
    })();

    return () => {
      cancelled = true;
      stopBurst();
      stopWebcamStream(streamRef.current, videoEl);
      streamRef.current = null;
    };
  }, [isOpen, stopBurst]);

  useEffect(() => {
    if (!isOpen) return;
    const handleWindowMouseUp = () => {
      stopBurst();
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [isOpen, stopBurst]);

  const captureSingleFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isReady) return;
    try {
      const normalized = captureWebcamFrame(video);
      setCapturedCount((prev) => prev + 1);
      pendingChainRef.current = pendingChainRef.current
        .then(() => onCaptureSample(normalized))
        .catch(() => undefined);
    } catch {
      // Ignore transient empty video frame before first decode
    }
  }, [isReady, onCaptureSample]);

  const handleStartBurst = () => {
    if (!isReady || burstTimerRef.current !== null) return;
    setIsBursting(true);
    captureSingleFrame();
    burstTimerRef.current = window.setInterval(() => {
      captureSingleFrame();
    }, 150);
  };

  const handleClose = async () => {
    stopBurst();
    stopWebcamStream(streamRef.current, videoRef.current);
    streamRef.current = null;
    await pendingChainRef.current;
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t('train.webcamModalTitle', { label: labelName })}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            {t('train.webcamModalTitle', { label: labelName })}
          </h3>
          <button
            type="button"
            data-testid="webcam-close-btn"
            onClick={handleClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="aspect-video w-full object-cover"
          />
        </div>

        {errorKey ? (
          <div
            data-testid="webcam-error-banner"
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
          >
            {t(errorKey)}
          </div>
        ) : null}

        {capturedCount > 0 ? (
          <p className="mt-3 text-center text-xs font-semibold text-emerald-700">
            {t('train.webcamCapturedFeedback', { count: capturedCount })}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-testid="webcam-capture-btn"
            disabled={!isReady}
            onClick={captureSingleFrame}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {t('train.webcamTakePhoto')}
          </button>
          <button
            type="button"
            data-testid="webcam-burst-btn"
            disabled={!isReady}
            onMouseDown={handleStartBurst}
            onMouseUp={stopBurst}
            className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-50 ${
              isBursting
                ? 'bg-amber-600 text-white'
                : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            {isBursting ? t('train.webcamBurstActive') : t('train.webcamHoldBurst')}
          </button>
        </div>
      </div>
    </div>
  );
}
