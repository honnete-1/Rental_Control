import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

const MAX_MB = 8;
const ACCEPT = "image/jpeg,image/png,image/webp";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  label?: string;
  error?: string;
  onError?: (message: string) => void;
}

/** Choose photos from the device or take one with the camera. Shows previews with a Remove button. */
export function PhotoUploader({ files, onChange, max = 6, label, error, onError }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const add = (list: FileList | null) => {
    if (!list) return;
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      if (!ACCEPT.split(",").includes(file.type)) {
        onError?.(t("common:photos.wrongType"));
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        onError?.(t("common:photos.tooLarge", { max: MAX_MB }));
        continue;
      }
      accepted.push(file);
    }
    onChange([...files, ...accepted].slice(0, max));
  };

  return (
    <div>
      {label && <p className="mb-2 font-semibold text-navy-800 dark:text-slate-100">{label}</p>}
      <p id={`${id}-hint`} className="mb-3 text-sm text-muted">
        {t("common:photos.hint", { max, size: MAX_MB })}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={files.length >= max} className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal-600 bg-teal-50 px-4 font-semibold text-teal-700 disabled:opacity-50">
          <Camera className="size-6" aria-hidden="true" />
          {t("common:photos.takePhoto")}
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()} disabled={files.length >= max} className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface px-4 font-semibold text-navy-800 disabled:opacity-50 dark:text-slate-100">
          <ImagePlus className="size-6" aria-hidden="true" />
          {t("common:photos.choosePhotos")}
        </button>
      </div>
      <input ref={cameraRef} type="file" accept={ACCEPT} capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="photo-input" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {error && <p className="mt-2 text-sm font-medium text-danger-700" role="alert">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={t("common:photos.selected", { count: files.length })}>
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="overflow-hidden rounded-xl border border-line bg-surface">
              <img src={previews[i]} alt={t("common:photos.previewAlt", { number: i + 1 })} className="aspect-[4/3] w-full object-cover" />
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="flex min-h-11 w-full items-center justify-center gap-2 text-sm font-semibold text-danger-700 hover:bg-danger-50">
                <Trash2 className="size-4" aria-hidden="true" />
                {t("common:actions.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
