import { jsPDF } from "jspdf";

/**
 * Render self-contained slip markup (must include its own <style>) into a single
 * A4 PDF blob using jsPDF's html2canvas pipeline. No new dependencies required.
 */
export async function slipNodeToPdfBlob(slipHtml: string): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;z-index:-1;";
  host.innerHTML = slipHtml;
  document.body.appendChild(host);

  try {
    await new Promise<void>((resolve, reject) => {
      const target = (host.querySelector(".slip-root") as HTMLElement) ?? host;
      try {
        pdf.html(target, {
          callback: () => resolve(),
          x: 0,
          y: 0,
          width: 210,
          windowWidth: 794,
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        });
      } catch (e) {
        reject(e);
      }
    });
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

export function sanitizePdfFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}
