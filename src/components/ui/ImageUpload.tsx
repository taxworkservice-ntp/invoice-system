import { useEffect, useRef, useState } from "react";
import { deleteFromR2, getR2PresignedUrl, uploadToR2 } from "../../lib/r2";

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

  async function compressImageIfNeeded(file: File): Promise<File> {
    if (file.size <= 2 * 1024 * 1024) return file;

    const imageUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = imageUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("ไม่สามารถอ่านรูปภาพได้"));
      });

      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob || blob.size >= file.size) return file;

      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  useEffect(() => {
    if (!currentKey) {
      setPreview(null);
      return;
    }

    if (currentKey.startsWith("data:")) {
      setPreview(currentKey);
      return;
    }

    getR2PresignedUrl(currentKey)
      .then(setPreview)
      .catch(() => {
        setPreview(null);
      });
  }, [currentKey]);

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
      setUploadError(
        err instanceof Error
          ? err.message
          : `อัปโหลด${label}ไม่สำเร็จ กรุณาลองใหม่`
      );
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
