import { supabase } from "./supabase";
import type { DocumentType } from "../types";

export async function generateDocNumber(userId: string, docType: DocumentType): Promise<string> {
  const { data, error } = await supabase.rpc("generate_doc_number", {
    p_user_id: userId,
    p_doc_type: docType,
  });
  if (error) throw error;
  return data as string;
}

export async function generateDocNumberBE(userId: string, docType: DocumentType): Promise<string> {
  return generateDocNumber(userId, docType);
}
