import React from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";

/**
 * Calibration fixture for the Classic V2 row-height estimator
 * (src/lib/printRowHeight.ts). Renders the real item-table markup — same CSS
 * classes as PrintDocumentClassicV2 — behind `data-measure` hooks so
 * scripts/print-layout-measure.mjs can read actual rendered heights and keep
 * the estimator an upper bound on reality (no page overflow, no over-reserve).
 */

const params = new URLSearchParams(window.location.search);
const scale = Number(params.get("scale") || "1") || 1;
const numScale = Number(params.get("numScale") || "") || scale;
const compactDn = params.get("compact") === "1";

const NOTE_LINES = [
  "สี / ฟอยล์: ฟอยล์ทองด้าน",
  "ขนาด 33 x 44 มม.",
  "ตำแหน่ง: กลางปก",
  "วัสดุ: อาร์ตการ์ด",
];
const SO_TEXT = "SO7944758301/Z033248905 Part no.25120021";

function ItemRow({ id, notes = 0 }: { id: string; notes?: number }) {
  return (
    <tr data-measure={id}>
      <td className="center">1</td>
      <td className="print-classic-item-name">
        งานเคลือบ
        {notes > 0 ? (
          <div className="print-classic-item-note">
            {NOTE_LINES.slice(0, notes).join("\n")}
          </div>
        ) : null}
      </td>
      <td className="right">1</td>
      <td className="center">ชิ้น</td>
      <td className="right">4.00</td>
      <td className="right">4.00</td>
    </tr>
  );
}

function BandRow({
  id,
  refLine,
  soLines,
}: {
  id: string;
  refLine: boolean;
  soLines: number;
}) {
  return (
    <tr className="print-classic-dn-group-row" data-measure={id}>
      <td className="center">{refLine ? 1 : ""}</td>
      <td className="print-classic-dn-group-label" colSpan={5}>
        {refLine ? <div>อ้างอิงใบส่งของ DN-2608-001 วันที่: 20 ส.ค. 2569</div> : null}
        {Array.from({ length: soLines }).map((_, index) => (
          <div key={index} className="print-classic-dn-group-so">
            {SO_TEXT}
          </div>
        ))}
      </td>
    </tr>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="print-export-stack">
      <div className="print-export-page">
        <article
          className={`print-sheet print-theme-classic print-theme-classic-v2 print-delivery-note${compactDn ? " print-dn-compact" : ""}`}
          data-measure-scale={scale}
          data-measure-compact={compactDn ? "1" : "0"}
          style={
            {
              "--classic-font-scale": scale,
              "--classic-fs-header": scale,
              "--classic-fs-company": scale,
              "--classic-fs-title": scale,
              "--classic-fs-info": scale,
              "--classic-fs-items": scale,
              "--classic-fs-num": numScale,
              "--classic-fs-num-unit": numScale,
              "--classic-fs-thead": scale,
              "--classic-fs-totals": scale,
              "--classic-fs-net": scale,
              "--classic-fs-payment": scale,
              "--classic-fs-terms": scale,
              "--classic-fs-footer": scale,
              "--classic-fs-en": scale,
            } as React.CSSProperties
          }
        >
          <table className="print-classic-items-table">
            <colgroup>
              <col style={{ width: "12mm" }} />
              <col style={{ width: "87mm" }} />
              <col style={{ width: "23mm" }} />
              <col style={{ width: "14mm" }} />
              <col style={{ width: "21mm" }} />
              <col style={{ width: "25mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  ลำดับ<span className="en">NO.</span>
                </th>
                <th>
                  รายการ<span className="en">DESCRIPTION</span>
                </th>
                <th>
                  จำนวน<span className="en">QTY</span>
                </th>
                <th>
                  หน่วย<span className="en">UNIT</span>
                </th>
                <th>
                  ราคา/หน่วย<span className="en">UNIT PRICE</span>
                </th>
                <th>
                  จำนวนเงิน<span className="en">AMOUNT</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <ItemRow id="item-0" />
              <ItemRow id="item-1" notes={1} />
              <ItemRow id="item-2" notes={2} />
              <ItemRow id="item-3" notes={3} />
              <ItemRow id="item-4" notes={4} />
              <BandRow id="band-so" refLine={false} soLines={1} />
              <BandRow id="band-so-2" refLine={false} soLines={2} />
              <BandRow id="band-ref" refLine soLines={1} />
              <tr className="print-classic-dn-spacer" data-measure="spacer">
                <td colSpan={6} />
              </tr>
            </tbody>
          </table>
        </article>
      </div>
    </div>
  </React.StrictMode>,
);
