import { apiFetch } from "./api";
import { supabase } from "./supabase";
import type { Document, StorageFile, StoragePurpose } from "../types";

export function logoKey(userId: string, ext: string = "png"): string {
  return `logos/${userId}/logo.${ext}`;
}

export function signatureKey(userId: string, ext: string = "png"): string {
  return `signatures/${userId}/signature.${ext}`;
}

export function stampKey(userId: string, ext: string = "png"): string {
  return `stamps/${userId}/stamp.${ext}`;
}

export function pdfKey(userId: string, documentId: string, variant: string = "original"): string {
  return `pdfs/${userId}/${documentId}/${variant}.pdf`;
}

export async function getR2PresignedUrl(key: string, _expiresIn: number = 3600): Promise<string> {
  if (key.startsWith("data:") || key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }
  const result = await apiFetch<{ url: string }>(`/api/storage/download-url?key=${encodeURIComponent(key)}`);
  return result.url;
}

export function getProxiedImageUrl(key: string): string {
  if (key.startsWith("data:") || key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }
  return `/api/storage/image-proxy?key=${encodeURIComponent(key)}`;
}

function inferPurpose(key: string): StoragePurpose {
  const purpose = key.split("/")[0] as StoragePurpose;
  if (!["logos", "signatures", "stamps", "pdfs", "exports", "attachments"].includes(purpose)) {
    throw new Error("Unsupported storage path");
  }
  return purpose;
}

export async function recordR2File(
  key: string,
  file: Pick<File, "name" | "type" | "size">,
  documentId?: string | null,
): Promise<StorageFile> {
  const result = await apiFetch<{ file: StorageFile }>("/api/storage/record-file", {
    method: "POST",
    body: JSON.stringify({
      key,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      documentId: documentId || null,
    }),
  });
  return result.file;
}

export async function uploadToR2(key: string, file: File, documentId?: string | null): Promise<string> {
  const result = await apiFetch<{ uploadUrl: string }>("/api/storage/upload-url", {
    method: "POST",
    body: JSON.stringify({
      key,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
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

  await recordR2File(key, file, documentId);
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
  await apiFetch<{ ok: boolean }>("/api/storage/delete-file", {
    method: "POST",
    body: JSON.stringify({ key: _key }),
  });
}

export async function deleteDocumentFiles(documentId: string): Promise<void> {
  await apiFetch<{ deleted: number }>("/api/storage/delete-document-files", {
    method: "POST",
    body: JSON.stringify({ documentId }),
  });
}

export async function getCachedPdfFile(document: Pick<Document, "id" | "user_id" | "updated_at">, variant: string): Promise<StorageFile | null> {
  const key = pdfKey(document.user_id, document.id, variant);
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("r2_key", key)
    .eq("purpose", inferPurpose(key))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const file = data as StorageFile;
  if (new Date(file.updated_at).getTime() < new Date(document.updated_at).getTime()) {
    return null;
  }

  return file;
}

export async function downloadR2Blob(key: string): Promise<Blob> {
  const url = await getR2PresignedUrl(key);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  return response.blob();
}
