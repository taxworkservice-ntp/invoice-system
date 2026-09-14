import { describe, expect, it } from "vitest";
import { buildReceiptPaymentRows } from "../../src/lib/format";

describe("buildReceiptPaymentRows", () => {
  it("cash shows method + amount only", () => {
    expect(
      buildReceiptPaymentRows({ methodLabel: "เงินสด", amountReceived: 9656.75 }),
    ).toEqual([
      { label: "วิธีชำระเงิน :", value: "เงินสด", emphasize: true },
      { label: "จำนวนเงินที่รับ :", value: "9,656.75" },
    ]);
  });

  it("transfer adds the receiving-account row", () => {
    const rows = buildReceiptPaymentRows({
      methodLabel: "โอนเงิน",
      isTransfer: true,
      bankAccountLine: "กสิกรไทย · 123-4-56789-0",
      amountReceived: 100,
    });
    expect(rows.map((r) => r.label)).toEqual(["วิธีชำระเงิน :", "เข้าบัญชี :", "จำนวนเงินที่รับ :"]);
  });

  it("cheque shows its own rows with a Buddhist date", () => {
    const rows = buildReceiptPaymentRows({
      methodLabel: "เช็คธนาคาร",
      isCheque: true,
      chequeNo: "0098765",
      chequeBank: "ธ.กรุงไทย",
      chequeDate: "2026-09-13",
      issueDate: "2026-09-13",
      amountReceived: 5000,
    });
    expect(rows).toEqual([
      { label: "วิธีชำระเงิน :", value: "เช็คธนาคาร", emphasize: true },
      { label: "เลขที่เช็ค :", value: "0098765" },
      { label: "ธนาคาร :", value: "ธ.กรุงไทย" },
      { label: "ลงวันที่ :", value: "13 ก.ย. 2569" },
      { label: "จำนวนเงินที่รับ :", value: "5,000.00" },
    ]);
  });

  it("flags post-dated cheques, never on equal/missing/garbage dates", () => {
    const flagged = buildReceiptPaymentRows({
      methodLabel: "เช็คธนาคาร",
      isCheque: true,
      chequeDate: "2026-10-01",
      issueDate: "2026-09-13",
    });
    expect(flagged.find((r) => r.label === "ลงวันที่ :")?.value).toBe(
      "1 ต.ค. 2569 (เช็คธนาคารลงวันที่ล่วงหน้า)",
    );
    const sameDay = buildReceiptPaymentRows({
      methodLabel: "เช็คธนาคาร",
      isCheque: true,
      chequeDate: "2026-09-13",
      issueDate: "2026-09-13",
    });
    expect(sameDay.find((r) => r.label === "ลงวันที่ :")?.value).toBe("13 ก.ย. 2569");
    const noIssue = buildReceiptPaymentRows({
      methodLabel: "เช็คธนาคาร",
      isCheque: true,
      chequeDate: "2026-10-01",
    });
    expect(noIssue.find((r) => r.label === "ลงวันที่ :")?.value).toBe("1 ต.ค. 2569");
    // Garbage passes through raw — user data is never dropped or NaN-ed.
    const garbage = buildReceiptPaymentRows({
      methodLabel: "เช็คธนาคาร",
      isCheque: true,
      chequeDate: "next friday",
      issueDate: "2026-09-13",
    });
    expect(garbage.find((r) => r.label === "ลงวันที่ :")?.value).toBe("next friday");
  });

  it("appends the WHT cert row and returns [] for empty input", () => {
    const rows = buildReceiptPaymentRows({
      methodLabel: "โอนเงิน",
      isTransfer: true,
      amountReceived: 100,
      whtCertificateNo: "WHT-2026-001",
    });
    expect(rows[rows.length - 1]).toEqual({ label: "หัก ณ ที่จ่าย :", value: "เลขที่ WHT-2026-001" });
    expect(buildReceiptPaymentRows({})).toEqual([]);
  });
});
