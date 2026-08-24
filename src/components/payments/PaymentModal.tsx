import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useBankAccounts } from "../../hooks/useBankAccounts";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { DateInput } from "../ui/DateInput";
import { FieldGuidance } from "../ui/FieldGuidance";
import { PAYMENT_METHOD_LABELS } from "../../constants";
import { useToast } from "../../hooks/useToast";
import {
  buildReceiptBackdateFields,
  composeReceiptBackdateReason,
  isPastDate,
  RECEIPT_BACKDATE_REASON_OPTIONS,
  toLocalMiddayIso,
} from "../../lib/receiptBackdating";
import { getReceiptInputBasisPreference, setReceiptInputBasisPreference } from "../../lib/receiptInputBasis";
import type { ReceiptInputBasis } from "../../lib/tax";
import { getReceiptTotalsForDocument } from "../../lib/receiptTotals";
import { resolveDocNumber } from "../../lib/docNumber";
import {
  calculateReceiptAllocationFromInput,
  convertReceiptInputAmount,
  convertReceiptInputToPreTax,
} from "../../lib/tax";
import { formatCurrency } from "../../lib/format";
import type { Document, DocumentStatus, PaymentMethod, WhtRate } from "../../types";

type Paying = "draft" | null;

/**
 * Shared "บันทึกรับเงิน (ร่างใบเสร็จ)" modal for every entry point
 * (deal page + document detail). Saves an unconfirmed draft receipt —
 * financial side effects apply only when the draft is confirmed later.
 */
export function PaymentModal({
  open,
  onClose,
  sourceDoc,
  draftReceipt,
  dealId,
  businessToday,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  sourceDoc: Document;
  /** When set, the modal edits this existing draft receipt instead of creating one. */
  draftReceipt?: Document | null;
  dealId?: string | null;
  businessToday: string;
  onSaved: () => void;
}) {
  const userId = sourceDoc.user_id;
  const { bankAccounts, loading: bankLoading } = useBankAccounts(userId);
  const toast = useToast();
  const isEditingDraft = Boolean(draftReceipt);

  const [paying, setPaying] = useState<Paying>(null);
  const [mismatchConfirm, setMismatchConfirm] = useState(false);
  const [inputBasis, setInputBasis] = useState<ReceiptInputBasis>(
    getReceiptInputBasisPreference(),
  );
  const [baseAmount, setBaseAmount] = useState(0);
  const [baseRemaining, setBaseRemaining] = useState(0);
  const [previousWht, setPreviousWht] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [whtCert, setWhtCert] = useState("");
  const [payDate, setPayDate] = useState(businessToday);
  const [backdateReason, setBackdateReason] = useState("");
  const [backdateNote, setBackdateNote] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDate, setChequeDate] = useState("");

  // Default the receiving account once the bank list has loaded — at open
  // time the list is often still fetching, which previously left the state
  // null while the select visually showed the first account.
  useEffect(() => {
    if (!open || bankLoading) return;
    if (!bankAccountId && bankAccounts.length > 0) {
      setBankAccountId(bankAccounts[0].id);
    }
  }, [open, bankLoading, bankAccountId, bankAccounts]);

  // Reset + prefill whenever the modal opens for a (new) source document.
  useEffect(() => {
    if (!open || !sourceDoc) return;
    let cancelled = false;

    async function init() {
      const { preTaxAmount: previousTotal, whtAmount: prevWht } =
        await getReceiptTotalsForDocument(sourceDoc, userId!);
      if (cancelled) return;
      const remaining = Math.max(0, sourceDoc.subtotal - previousTotal);
      setBaseRemaining(remaining);
      setPreviousWht(prevWht);

      if (draftReceipt) {
        // Editing an existing draft: prefill from its saved values.
        setInputBasis("pre_tax");
        setBaseAmount(Number(draftReceipt.subtotal) || 0);
        setMethod((draftReceipt.payment_method as PaymentMethod) || "bank_transfer");
        setBankAccountId(draftReceipt.bank_account_id ?? null);
        setWhtCert(draftReceipt.wht_certificate_no || "");
        setPayDate(draftReceipt.issue_date || businessToday);
        const detail = draftReceipt.payment_detail;
        if (detail?.cheque_no) {
          setChequeNo(detail.cheque_no);
          setChequeBank(detail.cheque_bank || "");
          setChequeDate(detail.cheque_date || "");
        }
        return;
      }

      const initialBasis = getReceiptInputBasisPreference();
      setInputBasis(initialBasis);
      setBaseAmount(
        convertReceiptInputAmount({
          amount: remaining,
          from: "pre_tax",
          to: initialBasis,
          vatRate: sourceDoc.vat_rate,
          vatRegistered: sourceDoc.vat_registered,
          whtRate: sourceDoc.wht_rate,
        }),
      );
      setBaseRemaining(remaining);
      setPreviousWht(prevWht);
      setMismatchConfirm(false);
      setMethod("bank_transfer");
      setWhtCert("");
      setPayDate(businessToday);
      setBackdateReason("");
      setBackdateNote("");
      setChequeNo("");
      setChequeBank("");
      setChequeDate("");
    }

    void init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceDoc?.id, draftReceipt?.id]);

  const preview = (() => {
    if (!sourceDoc) return null;
    return calculateReceiptAllocationFromInput({
      amount: baseAmount,
      basis: inputBasis,
      vatRate: sourceDoc.vat_rate,
      vatRegistered: sourceDoc.vat_registered,
      whtRate: sourceDoc.wht_rate,
      expectedWht: sourceDoc.wht_amount || 0,
      previousWht,
      isFullyPaid:
        convertReceiptInputToPreTax({
          amount: baseAmount,
          basis: inputBasis,
          vatRate: sourceDoc.vat_rate,
          whtRate: sourceDoc.wht_rate,
          vatRegistered: sourceDoc.vat_registered,
        }) >=
        sourceDoc.subtotal - 0.01,
    });
  })();

  function validateBeforeSave() {
    if (isPastDate(payDate, businessToday) && !backdateReason) {
      return "กรุณาเลือกเหตุผลในการออกใบเสร็จย้อนหลัง";
    }
    if (method === "bank_transfer" && !bankAccountId) {
      return "กรุณาเลือกบัญชีที่รับโอนเงิน";
    }
    if (method === "cheque" && !chequeNo.trim()) {
      return "กรุณากรอกเลขที่เช็ค";
    }
    return null;
  }

  async function handleSaveDraft() {
    const validationError = validateBeforeSave();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setPaying("draft");
    try {
      const paidAt = toLocalMiddayIso(payDate);
      const backdateFields = buildReceiptBackdateFields({
        selectedDate: payDate,
        userId: userId!,
        reason: composeReceiptBackdateReason(backdateReason, backdateNote),
        today: businessToday,
      });

      const previousTotals = await getReceiptTotalsForDocument(sourceDoc, userId!);
      const remaining = Math.max(0, sourceDoc.subtotal - previousTotals.preTaxAmount);
      const allocation = preview!;
      if (baseAmount <= 0 || allocation.preTax > remaining + 0.01) {
        throw new Error(`ยอดก่อน VAT เกินยอดค้างชำระ ฿${formatCurrency(remaining)}`);
      }

      const payload: Record<string, unknown> = {
          user_id: userId,
          deal_id: sourceDoc.deal_id ?? dealId ?? null,
          customer_id: sourceDoc.customer_id,
          doc_type: "receipt",
          status: "draft",
          issue_date: payDate,
          converted_from_id: sourceDoc.id,
          vat_registered: sourceDoc.vat_registered,
          vat_rate: sourceDoc.vat_rate,
          wht_rate: sourceDoc.wht_rate,
          discount_percent: sourceDoc.discount_percent,
          discount_amount: sourceDoc.discount_amount,
          subtotal: allocation.preTax,
          vat_amount: allocation.vatAmount,
          total_amount: allocation.grossAmount,
          wht_amount: allocation.whtAmount,
          net_payable: allocation.netAmount,
          payment_method: method,
          bank_account_id: method === "bank_transfer" ? bankAccountId : null,
          payment_detail:
            method === "cheque"
              ? {
                  cheque_no: chequeNo.trim() || null,
                  cheque_bank: chequeBank.trim() || null,
                  cheque_date: chequeDate || null,
                }
              : null,
          amount_received: allocation.netAmount,
          wht_certificate_no: whtCert || null,
          paid_at: paidAt,
          ...backdateFields,
      };

      if (draftReceipt) {
        // Edit mode: update the existing draft in place (keeps its number).
        const { error: updateError } = await supabase
          .from("documents")
          .update(payload)
          .eq("id", draftReceipt.id);
        if (updateError) throw updateError;
      } else {
        payload.doc_number = await resolveDocNumber(userId!, "receipt", payDate);
        const { data: receipt, error: receiptError } = await supabase
          .from("documents")
          .insert(payload)
          .select("id")
          .single();
        if (receiptError || !receipt) throw receiptError || new Error("ไม่สามารถสร้างใบเสร็จได้");
      }

      toast.success(isEditingDraft ? "บันทึกการแก้ไขใบเสร็จแล้ว" : "บันทึกใบเสร็จเป็นร่างแล้ว — ยืนยันรับเงินเมื่อตรวจสอบยอดในบัญชีแล้ว");
      onClose();
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setPaying(null);
    }
  }

  function handleAttemptSave() {
    const requestedPreTax = convertReceiptInputToPreTax({
      amount: baseAmount,
      basis: inputBasis,
      vatRate: sourceDoc.vat_rate,
      whtRate: sourceDoc.wht_rate,
      vatRegistered: sourceDoc.vat_registered,
    });
    if (requestedPreTax > baseRemaining + 0.01) {
      toast.error(`ยอดก่อน VAT เกินยอดค้างชำระ ฿${formatCurrency(baseRemaining)}`);
      return;
    }
    if (requestedPreTax < baseRemaining - 0.01) {
      setMismatchConfirm(true);
      return;
    }
    void handleSaveDraft();
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditingDraft ? "แก้ไขใบเสร็จร่าง" : "บันทึกรับเงิน (ร่างใบเสร็จ)"}>
      <div className="space-y-4">
        {mismatchConfirm ? (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">ยอดก่อน VAT ไม่ตรงกับยอดคงเหลือ</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-amber-700">ยอดก่อน VAT คงเหลือ</span>
                  <span className="font-medium text-amber-900">฿{formatCurrency(baseRemaining)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-700">ยอดก่อน VAT ของงวดนี้</span>
                  <span className="font-medium text-amber-900">฿{formatCurrency(preview?.preTax || 0)}</span>
                </div>
                <div className="border-t border-amber-200 pt-1.5 flex justify-between">
                  <span className="text-amber-700">ส่วนต่าง</span>
                  <span className="font-bold text-amber-900">
                    {(preview?.preTax || 0) > baseRemaining ? "+" : ""}฿{formatCurrency((preview?.preTax || 0) - baseRemaining)}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-amber-700">
                {(preview?.preTax || 0) < baseRemaining
                  ? "คุณกำลังบันทึกชำระบางส่วน ยอดคงเหลือจะแสดงในรายงานลูกหนี้จนกว่าจะชำระครบ"
                  : "ยอดก่อน VAT เกินยอดคงเหลือ ระบบจะไม่บันทึกยอดส่วนเกิน"}
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setMismatchConfirm(false)}>กลับไปแก้ไข</Button>
              <Button variant="primary" onClick={() => void handleSaveDraft()} loading={!!paying}>{isEditingDraft ? "บันทึกการแก้ไข" : "บันทึกใบเสร็จ (ร่าง)"}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-stone-50 border border-card-border px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">ยอดก่อน VAT คงเหลือ</span>
                <span className="font-semibold">฿{formatCurrency(baseRemaining)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-500">ยอดก่อน VAT ของงวดนี้</span>
                <span className="font-medium text-gray-700">฿{formatCurrency(preview?.preTax || 0)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-500">ยอดรวมก่อนหักภาษี ณ ที่จ่าย</span>
                <span className="font-medium text-gray-700">฿{formatCurrency(preview?.grossAmount || 0)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-500">หัก ณ ที่จ่าย</span>
                <span className="font-medium text-gray-700">฿{formatCurrency(preview?.whtAmount || 0)}</span>
              </div>
              <div className="mt-3 border-t border-card-border pt-2 flex items-center justify-between">
                <span className="font-medium text-gray-700">ยอดโอนจริงหลังหักภาษี ณ ที่จ่าย</span>
                <span className="text-base font-semibold">฿{formatCurrency(preview?.netAmount || 0)}</span>
              </div>
            </div>

            <FieldGuidance
              title="กรอกยอดโดยอ้างอิงจาก"
              items={[
                { label: "ยอดชำระก่อน VAT", description: "ใช้เมื่อกำหนดงวดผ่อนก่อนคิด VAT เช่น งวดละ 200,000 บาท" },
                { label: "ยอดรวมก่อนหักภาษี ณ ที่จ่าย", description: "ใช้เมื่อลูกค้าตกลงจ่ายยอดรวมรวม VAT ก่อนหักภาษี ณ ที่จ่าย เช่น 214,000 บาท" },
                { label: "ยอดโอนจริงหลังหักภาษี ณ ที่จ่าย", description: "ใช้เมื่ออ้างอิงจากยอดโอนเข้าบัญชีจริงหลังหักภาษี ณ ที่จ่าย เช่น 208,000 บาท" },
              ]}
              tip="ไม่แน่ใจ? เลือก “ยอดชำระก่อน VAT” ตามตารางงวด ระบบคำนวณ VAT, หัก ณ ที่จ่าย และยอดโอนจริงให้อัตโนมัติ"
            />
            <select
              className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white"
              value={inputBasis}
              onChange={(e) => {
                const nextBasis = e.target.value as ReceiptInputBasis;
                setBaseAmount(
                  convertReceiptInputAmount({
                    amount: baseAmount,
                    from: inputBasis,
                    to: nextBasis,
                    vatRate: sourceDoc.vat_rate,
                    vatRegistered: sourceDoc.vat_registered,
                    whtRate: sourceDoc.wht_rate,
                  }),
                );
                setInputBasis(nextBasis);
                setReceiptInputBasisPreference(nextBasis);
              }}
            >
              <option value="pre_tax">ยอดชำระก่อน VAT</option>
              <option value="gross">ยอดรวมก่อนหักภาษี ณ ที่จ่าย</option>
              <option value="net_cash">ยอดโอนจริงหลังหักภาษี ณ ที่จ่าย</option>
            </select>

            <Input
              label={
                inputBasis === "pre_tax"
                  ? "ยอดชำระก่อน VAT"
                  : inputBasis === "gross"
                    ? "ยอดรวมก่อนหักภาษี ณ ที่จ่าย"
                    : "ยอดโอนจริงหลังหักภาษี ณ ที่จ่าย"
              }
              type="number"
              step="0.01"
              value={baseAmount || ""}
              onChange={(e) => setBaseAmount(parseFloat(e.target.value) || 0)}
            />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">วิธีชำระเงิน</label>
              <select
                className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {method === "cheque" && (
              <div className="space-y-3 rounded-xl border border-card-border bg-paper-soft p-3">
                <p className="text-[11px] leading-4 text-gray-500">
                  รายละเอียดเช็คจะแสดงบนใบเสร็จและใช้ตรวจสอบยอดเข้าบัญชีก่อนยืนยัน
                </p>
                <Input
                  label="เลขที่เช็ค *"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  placeholder="เช่น 0098765"
                />
                <Input
                  label="ธนาคารที่สั่งจ่าย"
                  value={chequeBank}
                  onChange={(e) => setChequeBank(e.target.value)}
                  placeholder="เช่น ธ.กสิไทย สาขา..."
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">วันที่ลงเช็ค</label>
                  <DateInput
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {method === "bank_transfer" && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">รับเข้าบัญชี</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white"
                  value={bankAccountId ?? ""}
                  onChange={(e) => setBankAccountId(e.target.value || null)}
                >
                  {bankLoading ? (
                    <option value="" disabled>กำลังโหลดบัญชี...</option>
                  ) : bankAccounts.length === 0 ? (
                    <option value="" disabled>ยังไม่มีบัญชีธนาคาร ไปเพิ่มในตั้งค่า</option>
                  ) : !bankAccountId ? (
                    <option value="" disabled>เลือกบัญชีที่รับโอนเงิน</option>
                  ) : (
                    bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.bank_name} · {account.account_number}
                        {account.account_holder_name ? ` · ${account.account_holder_name}` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            <Input
              label="เลขที่ใบหักภาษี ณ ที่จ่าย"
              value={whtCert}
              onChange={(e) => setWhtCert(e.target.value)}
              placeholder="กรอกถ้ามี"
            />

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">วันที่รับเงิน</label>
              <DateInput
                value={payDate}
                max={businessToday}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>

            {isPastDate(payDate, businessToday) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-medium text-amber-900">กำลังออกใบเสร็จย้อนหลัง</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  วันที่บนใบเสร็จจะใช้วันที่รับเงินจริง และระบบจะเก็บเวลาที่เข้ามาบันทึกไว้แยกกันเพื่อใช้ตรวจสอบย้อนหลัง
                </p>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-amber-900">เหตุผลในการออกย้อนหลัง</label>
                  <select
                    value={backdateReason}
                    onChange={(e) => setBackdateReason(e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                  >
                    <option value="">เลือกเหตุผล</option>
                    {RECEIPT_BACKDATE_REASON_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-amber-900">หมายเหตุเพิ่มเติม (ถ้ามี)</label>
                  <textarea
                    value={backdateNote}
                    onChange={(e) => setBackdateNote(e.target.value)}
                    rows={3}
                    placeholder="รายละเอียดเพิ่มเติม เช่น วันที่ได้รับสลิป หรือข้อมูลที่ต้องการให้ทีมบัญชีเห็น"
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={onClose}>
                ปิด
              </Button>
              <Button onClick={handleAttemptSave} disabled={paying !== null || baseAmount <= 0}>
                {paying ? "กำลังบันทึก..." : isEditingDraft ? "บันทึกการแก้ไข" : "บันทึกใบเสร็จ (ร่าง)"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
