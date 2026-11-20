import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTranslation } from '../../i18n/useTranslation';

export interface FileDropzoneProps {
  onSelectFiles: (files: File[]) => Promise<void>;
}

export function FileDropzone({ onSelectFiles }: FileDropzoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    event.target.value = '';
    await onSelectFiles(files);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const fileList = event.dataTransfer.files;
    if (!fileList || fileList.length === 0) return;
    await onSelectFiles(Array.from(fileList));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`rounded-xl border border-dashed p-2.5 text-center transition ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-50/70'
          : 'border-slate-300 bg-slate-50/60 hover:border-indigo-300'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        data-testid="file-upload-input"
        onChange={handleFileChange}
        className="sr-only"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full text-xs font-medium text-slate-600 hover:text-indigo-600"
      >
        <span className="font-semibold text-indigo-600">{t('train.uploadBtn')}</span>
        <span className="block text-[11px] text-slate-500">
          {isDragOver ? t('train.dropzoneActive') : t('train.dropzonePrompt')}
        </span>
      </button>
    </div>
  );
}
