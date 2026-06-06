import { supabase } from "./supabase";
import type { DocumentType } from "../types";

export async function generateDocNumber(userId: string, docType: DocumentType, issueDate: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_doc_number", {
    p_user_id: userId,
    p_doc_type: docType,
    p_issue_date: issueDate,
  });
  if (error) throw error;
  return data as string;
}

export async function generateDocNumberBE(userId: string, docType: DocumentType, issueDate: string): Promise<string> {
  return generateDocNumber(userId, docType, issueDate);
}
