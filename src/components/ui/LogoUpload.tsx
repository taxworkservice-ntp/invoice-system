import { useEffect, useRef, useState } from "react";
import { getR2PresignedUrl, logoKey, uploadToR2 } from "../../lib/r2";

interface LogoUploadProps {
  userId: string;
  currentLogoKey: string | null;
  onLogoChange: (key: string | null) => void;
}

export function LogoUpload({ userId, currentLogoKey, onLogoChange }: LogoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentLogoKey) {
      setPreview(null);
      return;
    }

    getR2PresignedUrl(currentLogoKey)
      .then(setPreview)
      .catch(() => {
        setPreview(null);
      });
  }, [currentLogoKey]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    setUploading(true);
    setUploadError("");

    try {
      const ext = file.name.split(".").pop() || "png";
      const key = logoKey(userId, ext);
      await uploadToR2(key, file);
      onLogoChange(key);
      setPreview(await getR2PresignedUrl(key));
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error
          ? err.message
          : "อัปโหลดโลโก้ไม่สำเร็จ กรุณาตรวจสอบ R2 CORS แล้วลองใหม่"
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleRemove() {
    onLogoChange(null);
    setPreview(null);
    setUploadError("");
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">โลโก้บริษัท</label>
      <div className="flex items-center gap-3">
        <div
          className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-card-border bg-gray-50"
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="Logo" className="h-full w-full object-contain" />
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
            {uploading ? "กำลังอัปโหลด..." : preview ? "เปลี่ยนโลโก้" : "อัปโหลดโลโก้"}
          </button>

          {preview && (
            <button
              type="button"
              onClick={handleRemove}
              className="mt-1 block text-xs text-red-400 hover:underline"
            >
              ลบโลโก้
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
