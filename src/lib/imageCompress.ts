/**
 * Downscale large photos client-side before upload — keeps R2 objects and
 * print/PDF rendering fast. Shared by ImageUpload and per-line images.
 */
export async function compressImageIfNeeded(file: File): Promise<File> {
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

export function uploadErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const status = "status" in err ? err.status : null;
    if (status === 401 || /session expired|sign in|authorization|invalid session/i.test(err.message)) {
      return "Session expired. Please sign in again, then retry the upload.";
    }
    return err.message;
  }
  return "อัปโหลดไม่สำเร็จ กรุณาลองใหม่";
}
