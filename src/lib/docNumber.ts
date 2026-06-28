import { supabase } from "./supabase";
import type { DocumentType } from "../types";

export const DOC_NUMBER_SETUP_ERROR = "ยังไม่ได้ตั้งค่าเลขเอกสาร กรุณาติดต่อผู้ดูแลระบบ";

export function getDocNumberErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (
    message.includes("doc_number_sequences") ||
    message.includes("No sequence config") ||
    message.includes("ไม่พบการตั้งค่าเลขเอกสาร")
  ) {
    return DOC_NUMBER_SETUP_ERROR;
  }
  return error instanceof Error ? error.message : "สร้างเลขเอกสารไม่สำเร็จ";
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
