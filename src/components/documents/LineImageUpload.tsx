import { useEffect, useRef, useState } from "react";
import { deleteFromR2, uploadToR2 } from "../../lib/r2";
import { getProxiedImageUrl } from "../../lib/storageApi";
import { compressImageIfNeeded, uploadErrorMessage } from "../../lib/imageCompress";

interface LineImageUploadProps {
  userId: string;
  /** R2 object key of the line's example photo (null = none). */
  imageKey: string | null;
  onKeyChange: (key: string | null) => void;
}

/**
 * Per-line example photo for quotation items: compact upload button +
 * thumbnail preview. Stored as an R2 key on document_line_items.image_url;
 * printed under the item name on classic V2 quotations.
 */
export function LineImageUpload({ userId, imageKey, onKeyChange }: LineImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError("");
  }, [imageKey]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const uploadFile = await compressImageIfNeeded(file);
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const key = `line-images/${userId}/${crypto.randomUUID()}.${ext}`;
      await uploadToR2(key, uploadFile);
      if (imageKey && imageKey !== key) {
        deleteFromR2(imageKey).catch(() => undefined);
      }
      onKeyChange(key);
    } catch (err: unknown) {
      setError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    if (imageKey) {
      deleteFromR2(imageKey).catch(() => undefined);
    }
    onKeyChange(null);
  }

  return (
    <div className="mt-1">
      {imageKey ? (
        <div className="flex items-start gap-2">
          <img
            src={getProxiedImageUrl(imageKey)}
            alt="รูปตัวอย่าง"
            className="h-14 w-20 rounded border border-card-border bg-gray-50 object-cover"
          />
          <div className="space-y-0.5 text-xs">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="block text-blue-600 hover:underline"
            >
              {uploading ? "กำลังอัปโหลด..." : "เปลี่ยนรูป"}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="block text-red-400 hover:underline"
            >
              ลบรูป
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-card-border bg-white px-2 py-1 text-xs text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
        >
          {uploading ? "กำลังอัปโหลด..." : "+ เพิ่มรูปตัวอย่าง"}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
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
