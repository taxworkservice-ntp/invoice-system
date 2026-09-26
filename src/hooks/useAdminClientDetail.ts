import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "./useToast";
import {
  getAdminClientUser,
  listAdminClientActivities,
  listAdminClientAudit,
  listAdminClientMembers,
  listAdminClientRoles,
  listAdminResetBackups,
  updateAdminClientStatus,
  type AdminAuditEntry,
  type AdminClientMember,
  type AdminResetBackup,
} from "../lib/adminApi";
import type { MonitorActivity, MonitorDealLike } from "../lib/monitoring";
import type { WorkspaceCustomRole } from "../lib/permissions";
import type { ClientFeature, ClientProfile, Document } from "../types";

export interface AdminClientDetail {
  id: string | undefined;
  clientProfile: ClientProfile | null;
  email: string;
  isActive: boolean;
  accountError: string;
  documents: Document[];
  features: ClientFeature[];
  members: AdminClientMember[];
  customRoles: WorkspaceCustomRole[];
  dealCount: number;
  activeCustomerCount: number;
  activeItemCount: number;
  activeDealCount: number;
  loading: boolean;
  auditEntries: AdminAuditEntry[];
  resetBackups: AdminResetBackup[];
  activities: MonitorActivity[];
  activityDeals: MonitorDealLike[];
  toggling: boolean;
  setClientProfile: React.Dispatch<React.SetStateAction<ClientProfile | null>>;
  setMembers: React.Dispatch<React.SetStateAction<AdminClientMember[]>>;
  setFeatures: React.Dispatch<React.SetStateAction<ClientFeature[]>>;
  setAuditEntries: React.Dispatch<React.SetStateAction<AdminAuditEntry[]>>;
  setResetBackups: React.Dispatch<React.SetStateAction<AdminResetBackup[]>>;
  fetchData: () => Promise<void>;
  handleToggleActive: () => Promise<void>;
}

/**
 * Data layer for the admin client control center. Owns every fetched
 * collection plus the account on/off switch; tab components own their own
 * modal/busy states and mutation handlers.
 */
export function useAdminClientDetail(): AdminClientDetail {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [accountError, setAccountError] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [features, setFeatures] = useState<ClientFeature[]>([]);
  const [members, setMembers] = useState<AdminClientMember[]>([]);
  const [customRoles, setCustomRoles] = useState<WorkspaceCustomRole[]>([]);
  const [dealCount, setDealCount] = useState(0);
  const [activeCustomerCount, setActiveCustomerCount] = useState(0);
  const [activeItemCount, setActiveItemCount] = useState(0);
  const [activeDealCount, setActiveDealCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [resetBackups, setResetBackups] = useState<AdminResetBackup[]>([]);
  const [activities, setActivities] = useState<MonitorActivity[]>([]);
  const [activityDeals, setActivityDeals] = useState<MonitorDealLike[]>([]);
  const [toggling, setToggling] = useState(false);

  async function fetchData() {
    if (!id) return;

    setLoading(true);
    setAccountError("");

    // The auth-user lookup is the only request here that rejects (apiFetch
    // throws on non-2xx). Guard it like members/roles/audit below so one
    // failing call can never blank the whole page — the rest renders
    // partially with an inline notice instead.
    let accountFailure = "";
    const [
      cpRes,
      docRes,
      dealRes,
      userRes,
      activeCustomerRes,
      activeItemRes,
      activeDealRes,
      featureRes,
      memberRes,
      roleRes,
      auditRes,
      backupRes,
      activityRes,
    ] = await Promise.all([
      supabase.from("client_profiles").select("*").eq("user_id", id).single(),
      supabase
        .from("documents")
        .select("*, customer:customer_id(name)")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("deals").select("*", { count: "exact", head: true }).eq("user_id", id),
      getAdminClientUser(id).catch((error: unknown) => {
        accountFailure =
          error instanceof Error && error.message ? error.message : "โหลดข้อมูลบัญชีไม่สำเร็จ";
        return null;
      }),
      supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("user_id", id)
        .eq("is_active", true),
      supabase
        .from("items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", id)
        .eq("is_active", true),
      supabase
        .from("deals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", id)
        .eq("is_active", true),
      supabase.from("client_features").select("*").eq("user_id", id),
      listAdminClientMembers(id).catch(() => []),
      listAdminClientRoles(id).catch(() => []),
      listAdminClientAudit(id).catch(() => []),
      listAdminResetBackups(id).catch(() => []),
      listAdminClientActivities(id).catch(() => ({ activities: [], deals: [] })),
    ]);

    if (!cpRes.error && cpRes.data) {
      setClientProfile(cpRes.data as ClientProfile);
    }
    if (!docRes.error && docRes.data) {
      setDocuments(docRes.data as unknown as Document[]);
    }
    if (!dealRes.error) {
      setDealCount(dealRes.count || 0);
    }
    if (!activeCustomerRes.error) {
      setActiveCustomerCount(activeCustomerRes.count || 0);
    }
    if (!activeItemRes.error) {
      setActiveItemCount(activeItemRes.count || 0);
    }
    if (!activeDealRes.error) {
      setActiveDealCount(activeDealRes.count || 0);
    }
    if (!featureRes.error && featureRes.data) {
      setFeatures(featureRes.data as ClientFeature[]);
    }
    setMembers(memberRes);
    setCustomRoles(roleRes);
    setAuditEntries(auditRes);
    setResetBackups(backupRes);
    setActivities(activityRes.activities || []);
    setActivityDeals(activityRes.deals || []);

    if (userRes) {
      setEmail(userRes.email || "");
      setIsActive(userRes.isActive);
    } else {
      setAccountError(accountFailure || "โหลดข้อมูลบัญชีไม่สำเร็จ");
      toast.error(accountFailure || "โหลดข้อมูลบัญชีไม่สำเร็จ");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!id) return;
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleToggleActive() {
    if (!id) return;

    const confirmMsg = isActive
      ? `ปิดการใช้งานบัญชีของ ${clientProfile?.company_name_th || email}? ลูกค้าจะไม่สามารถเข้าสู่ระบบได้`
      : `เปิดใช้งานบัญชีของ ${clientProfile?.company_name_th || email}?`;

    if (!window.confirm(confirmMsg)) return;

    setToggling(true);

    try {
      await updateAdminClientStatus(id, !isActive);
      setIsActive(!isActive);
      toast.success(isActive ? "ปิดการใช้งานบัญชีแล้ว" : "เปิดใช้งานบัญชีแล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to update account status");
    } finally {
      setToggling(false);
    }
  }

  return {
    id,
    clientProfile,
    email,
    isActive,
    accountError,
    documents,
    features,
    members,
    customRoles,
    dealCount,
    activeCustomerCount,
    activeItemCount,
    activeDealCount,
    loading,
    auditEntries,
    resetBackups,
    activities,
    activityDeals,
    toggling,
    setClientProfile,
    setMembers,
    setFeatures,
    setAuditEntries,
    setResetBackups,
    fetchData,
    handleToggleActive,
  };
}
