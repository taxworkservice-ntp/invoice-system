import { supabase } from "./supabase";
import type { DocumentType } from "../types";

export const DOC_NUMBER_SETUP_ERROR = "ยังไม่ได้ตั้งค่าเลขเอกสาร กรุณาติดต่อผู้ดูแลระบบ";
export const DUPLICATE_DOC_NUMBER_MESSAGE = "เลขที่เอกสารนี้ถูกใช้งานแล้ว กรุณาใช้เลขอื่น";

export function isDuplicateDocNumberError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null | undefined;
  const message = err?.message || (error instanceof Error ? error.message : String(error || ""));
  return err?.code === "23505" || message.includes("uq_documents_user_doc_number");
}

export function getDocNumberErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (isDuplicateDocNumberError(error)) return DUPLICATE_DOC_NUMBER_MESSAGE;
  if (
    message.includes("doc_number_sequences") ||
    message.includes("No sequence config") ||
    message.includes("ไม่พบการตั้งค่าเลขเอกสาร")
  ) {
    return DOC_NUMBER_SETUP_ERROR;
  }
  return error instanceof Error ? error.message : "สร้างเลขเอกสารไม่สำเร็จ";
}

export async function assertDocNumberAvailable(
  userId: string,
  docNumber: string,
  excludeDocumentId?: string,
): Promise<void> {
  const value = docNumber.trim();
  if (!value) return;

  let query = supabase
    .from("documents")
    .select("id")
    .eq("user_id", userId)
    .eq("doc_number", value)
    .limit(1);

  if (excludeDocumentId) query = query.neq("id", excludeDocumentId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if ((data || []).length > 0) throw new Error(DUPLICATE_DOC_NUMBER_MESSAGE);
}

export async function generateDocNumber(userId: string, docType: DocumentType, issueDate: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_doc_number", {
    p_user_id: userId,
    p_doc_type: docType,
    p_issue_date: issueDate,
  });
  if (error) throw new Error(getDocNumberErrorMessage(error));
  return data as string;
}

export async function generateDocNumberBE(userId: string, docType: DocumentType, issueDate: string): Promise<string> {
  return generateDocNumber(userId, docType, issueDate);
}

export async function resolveDocNumber(
  userId: string,
  docType: DocumentType,
  issueDate: string,
  override?: string,
  excludeDocumentId?: string,
): Promise<string> {
  const value = override?.trim();
  if (value) {
    await assertDocNumberAvailable(userId, value, excludeDocumentId);
    return value;
  }
  return generateDocNumberBE(userId, docType, issueDate);
}
