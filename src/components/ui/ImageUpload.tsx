import { useEffect, useRef, useState } from "react";
import { deleteFromR2, getR2PresignedUrl, uploadToR2 } from "../../lib/r2";
import { compressImageIfNeeded, uploadErrorMessage } from "../../lib/imageCompress";

interface ImageUploadProps {
  userId: string;
  storageKeyFn: (userId: string, ext: string) => string;
  currentKey: string | null;
  onKeyChange: (key: string | null) => void;
  label: string;
  placeholder?: string;
  className?: string;
}

export function ImageUpload({ userId, storageKeyFn, currentKey, onKeyChange, label, placeholder, className }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const displayLabel = placeholder || label;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    setUploading(true);
    setUploadError("");

    try {
      const uploadFile = await compressImageIfNeeded(file);
      const ext = uploadFile.name.split(".").pop() || "png";
      const key = storageKeyFn(userId, ext);
      await uploadToR2(key, uploadFile);
      if (currentKey && currentKey !== key) {
        await deleteFromR2(currentKey).catch(() => undefined);
      }
      onKeyChange(key);
      setPreview(await getR2PresignedUrl(key));
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
    onKeyChange(null);
    setPreview(null);
    setUploadError("");
  }

  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-3">
        <div
          className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-card-border bg-gray-50"
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt={displayLabel} className="h-full w-full object-contain" />
          ) : (
            <span className="text-2xl text-gray-300">+</span>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-primary hover:underline"
            disabled={uploading}
          >
            {uploading ? "กำลังอัปโหลด..." : preview ? `เปลี่ยน${label}` : `อัปโหลด${label}`}
          </button>

          {preview && (
            <button
              type="button"
              onClick={handleRemove}
              className="mt-1 block text-xs text-red-400 hover:underline"
            >
              ลบ{label}
            </button>
          )}
        </div>
      </div>

      {uploadError && <p className="mt-2 text-xs text-red-500">{uploadError}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
