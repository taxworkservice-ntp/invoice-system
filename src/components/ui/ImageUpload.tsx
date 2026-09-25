import { useEffect, useRef, useState } from "react";
import { deleteFromR2, getR2PresignedUrl, uploadToR2 } from "../../lib/r2";
import { compressImageIfNeeded, uploadErrorMessage } from "../../lib/imageCompress";

export interface UploadedFileMeta {
  name: string;
  type: string;
  size: number;
}

interface ImageUploadProps {
  userId: string;
  storageKeyFn: (userId: string, ext: string) => string;
  currentKey: string | null;
  onKeyChange: (key: string | null, file?: UploadedFileMeta | null) => void;
  label: string;
  placeholder?: string;
  className?: string;
  /** Defaults to "image/*". Include "pdf" (e.g. "image/*,.pdf") to accept PDFs. */
  accept?: string;
  /** Fetch a preview for an already-stored currentKey (default false). */
  loadPreview?: boolean;
}

export function ImageUpload({
  userId,
  storageKeyFn,
  currentKey,
  onKeyChange,
  label,
  placeholder,
  className,
  accept = "image/*",
  loadPreview = false,
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"image" | "pdf" | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const displayLabel = placeholder || label;
  const pdfAllowed = accept.includes("pdf");

  useEffect(() => {
    if (!loadPreview || !currentKey) {
      if (!currentKey) {
        setPreview(null);
        setPreviewKind(null);
        setPreviewName("");
      }
      return;
    }
    let cancelled = false;
    getR2PresignedUrl(currentKey)
      .then((url) => {
        if (cancelled) return;
        setPreview(url);
        const isPdf = currentKey.toLowerCase().endsWith(".pdf");
        setPreviewKind(isPdf ? "pdf" : "image");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentKey, loadPreview]);

  function kindOf(file: File): "image" | "pdf" | null {
    if (file.type.startsWith("image/")) return "image";
    if (file.type === "application/pdf" && pdfAllowed) return "pdf";
    return null;
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = kindOf(file);
    if (!kind) {
      setUploadError(pdfAllowed ? "รองรับเฉพาะไฟล์รูปภาพและ PDF" : "รองรับเฉพาะไฟล์รูปภาพ");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const uploadFile = kind === "image" ? await compressImageIfNeeded(file) : file;
      const ext = uploadFile.name.split(".").pop() || (kind === "pdf" ? "pdf" : "png");
      const key = storageKeyFn(userId, ext);
      await uploadToR2(key, uploadFile);
      if (currentKey && currentKey !== key) {
        await deleteFromR2(currentKey).catch(() => undefined);
      }
      onKeyChange(key, { name: file.name, type: file.type, size: file.size });
      if (kind === "image") {
        setPreview(await getR2PresignedUrl(key));
        setPreviewKind("image");
        setPreviewName("");
      } else {
        setPreview(key);
        setPreviewKind("pdf");
        setPreviewName(file.name);
      }
    } catch (err: unknown) {
      setUploadError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleRemove() {
    if (currentKey) {
      deleteFromR2(currentKey).catch(() => undefined);
    }
    onKeyChange(null, null);
    setPreview(null);
    setPreviewKind(null);
    setPreviewName("");
    setUploadError("");
  }

  return (
    <div className={className}>
      <label className="mb-1 block text-label font-medium text-ink-500">{label}</label>
      <div className="flex items-center gap-3">
        <div
          className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-control border border-card-border bg-paper-field"
          onClick={() => fileRef.current?.click()}
        >
          {preview && previewKind !== "pdf" ? (
            <img src={preview} alt={displayLabel} className="h-full w-full object-contain" />
          ) : previewKind === "pdf" ? (
            <span className="px-2 text-center text-label font-medium text-ink-600">
              PDF{previewName ? ` · ${previewName.slice(0, 12)}` : ""}
            </span>
          ) : (
            <span className="text-page text-ink-300">+</span>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-label text-primary hover:underline"
            disabled={uploading}
          >
            {uploading ? "กำลังอัปโหลด..." : preview ? `เปลี่ยน${label}` : `อัปโหลด${label}`}
          </button>

          {preview && (
            <button
              type="button"
              onClick={handleRemove}
              className="mt-1 block text-label text-red-400 hover:underline"
            >
              ลบ{label}
            </button>
          )}
        </div>
      </div>

      {uploadError && <p className="mt-2 text-label text-red-500">{uploadError}</p>}

      <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
    </div>
  );
}
