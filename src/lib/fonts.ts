import { jsPDF } from "jspdf";

const THAI_FONT_REGULAR_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf";
const THAI_FONT_BOLD_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Bold.ttf";

let cachedRegular: string | null = null;
let cachedBold: string | null = null;

async function fetchFontAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function loadThaiFont(doc: jsPDF): Promise<void> {
  try {
    if (!cachedRegular) {
      cachedRegular = await fetchFontAsBase64(THAI_FONT_REGULAR_URL);
    }
    if (!cachedBold) {
      cachedBold = await fetchFontAsBase64(THAI_FONT_BOLD_URL);
    }

    doc.addFileToVFS("Sarabun-Regular.ttf", cachedRegular);
    doc.addFileToVFS("Sarabun-Bold.ttf", cachedBold);
    doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
    doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");
    doc.setFont("Sarabun");
  } catch (e) {
    console.warn("Thai font loading failed, using default font:", e);
  }
}
