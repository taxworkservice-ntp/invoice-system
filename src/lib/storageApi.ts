import { apiFetch } from "./api";

export function logoKey(userId: string, ext: string = "png"): string {
  return `logos/${userId}/logo.${ext}`;
}

export function signatureKey(userId: string, ext: string = "png"): string {
  return `signatures/${userId}/signature.${ext}`;
}

export function stampKey(userId: string, ext: string = "png"): string {
  return `stamps/${userId}/stamp.${ext}`;
}

export function pdfKey(userId: string, documentId: string): string {
  return `pdfs/${userId}/${documentId}.pdf`;
}

export async function getR2PresignedUrl(key: string, _expiresIn: number = 3600): Promise<string> {
  const result = await apiFetch<{ url: string }>(`/api/storage/logo-url?key=${encodeURIComponent(key)}`);
  return result.url;
}

export async function uploadToR2(key: string, file: File): Promise<string> {
  const result = await apiFetch<{ uploadUrl: string }>("/api/storage/upload-url", {
    method: "POST",
    body: JSON.stringify({
      key,
      contentType: file.type || "application/octet-stream",
    }),
  });

  const response = await fetch(result.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`);
  }

  return key;
}

export async function getR2Object(key: string): Promise<Uint8Array | null> {
  try {
    const url = await getR2PresignedUrl(key);
    const response = await fetch(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function deleteFromR2(_key: string): Promise<void> {
  throw new Error("deleteFromR2 is not implemented for client-side use.");
}
