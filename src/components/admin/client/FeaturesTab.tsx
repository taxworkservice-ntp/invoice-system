import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useToast } from "../../../hooks/useToast";
import { CLIENT_FEATURES } from "../../../lib/features";
import {
  payrollVisibilityToRows,
  resolvePayrollTabsVisibility,
  type PayrollTabVisibility,
} from "../../../lib/payroll/visibility";
import { Card } from "../../ui/Card";
import type { ClientFeature, ClientFeatureKey } from "../../../types";
import { SectionHeader } from "./shared";

interface FeaturesTabProps {
  clientId: string | undefined;
  features: ClientFeature[];
  setFeatures: React.Dispatch<React.SetStateAction<ClientFeature[]>>;
}

export function FeaturesTab({ clientId: id, features, setFeatures }: FeaturesTabProps) {
  const toast = useToast();
  const [togglingFeature, setTogglingFeature] = useState<ClientFeatureKey | null>(null);
  const [savingPayrollVisibility, setSavingPayrollVisibility] = useState(false);

  const enabledFeatureKeys = new Set(
    features.filter((feature) => feature.enabled).map((feature) => feature.feature_key),
  );
  // Admin sees all rows (incl. disabled) — the resolver treats "no rows" as
  // both tabs, matching the client fail-open default.
  const payrollVisibility = resolvePayrollTabsVisibility(
    features.filter(
      (feature) =>
        feature.feature_key === "payroll_runs" || feature.feature_key === "payroll_employees",
    ),
  );

  async function handleToggleFeature(featureKey: ClientFeatureKey) {
    if (!id) return;
    const current = features.find((feature) => feature.feature_key === featureKey);
    const nextEnabled = !current?.enabled;
    setTogglingFeature(featureKey);

    try {
      const { data, error } = await supabase
        .from("client_features")
        .upsert(
          {
            user_id: id,
            feature_key: featureKey,
            enabled: nextEnabled,
          },
          { onConflict: "user_id,feature_key" },
        )
        .select("*")
        .single();

      if (error) throw error;

      setFeatures((prev) => {
        const next = prev.filter((feature) => feature.feature_key !== featureKey);
        return [...next, data as ClientFeature];
      });
      toast.success(nextEnabled ? "เปิด Business Feature แล้ว" : "ปิด Business Feature แล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to toggle business feature");
    } finally {
      setTogglingFeature(null);
    }
  }

  async function handleSetPayrollVisibility(mode: PayrollTabVisibility) {
    if (!id) return;
    if (payrollVisibility.mode === mode || savingPayrollVisibility) return;
    setSavingPayrollVisibility(true);
    try {
      const rows = payrollVisibilityToRows(mode);
      const saved: ClientFeature[] = [];
      for (const row of rows) {
        const { data, error } = await supabase
          .from("client_features")
          .upsert(
            { user_id: id, feature_key: row.key, enabled: row.enabled },
            { onConflict: "user_id,feature_key" },
          )
          .select("*")
          .single();
        if (error) throw error;
        saved.push(data as ClientFeature);
      }
      setFeatures((prev) => {
        const next = prev.filter(
          (feature) =>
            feature.feature_key !== "payroll_runs" && feature.feature_key !== "payroll_employees",
        );
        return [...next, ...saved];
      });
      toast.success("บันทึกการแสดงผลเงินเดือนแล้ว");
    } catch (error: any) {
      toast.error(error.message || "Unable to save payroll visibility");
    } finally {
      setSavingPayrollVisibility(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>Business Features</SectionHeader>
        <Card>
          <div className="space-y-3">
            {CLIENT_FEATURES.map((feature) => {
              const enabled = enabledFeatureKeys.has(feature.key);
              return (
                <div
                  key={feature.key}
                  className="rounded-control border border-card-border bg-paper-tint p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-body font-medium text-ink-900">{feature.label}</div>
                      <p className="mt-1 text-label leading-5 text-ink-300">
                        {feature.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(feature.key)}
                      disabled={togglingFeature === feature.key}
                      className={`shrink-0 rounded-full px-3 py-1 text-label font-medium transition-colors ${enabled ? "bg-success-border text-success-text hover:bg-success-border" : "bg-line-faint text-ink-600 hover:bg-line"} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {togglingFeature === feature.key ? "..." : enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader>Payroll visibility</SectionHeader>
        <Card>
          <div className="text-body font-medium text-ink-900">ส่วนเงินเดือนที่ลูกค้าเห็น</div>
          <p className="mt-1 text-label leading-5 text-ink-300">
            เลือกว่าหน้าเงินเดือนของลูกค้ารายนี้แสดงรอบเงินเดือน พนักงาน หรือทั้งสองส่วน
            {enabledFeatureKeys.has("payroll") ? "" : " (มีผลเมื่อเปิด Payroll ด้านบน)"}
          </p>
          <div
            className="mt-3 inline-flex rounded-control border border-card-border bg-paper-field p-0.5"
            role="radiogroup"
            aria-label="ส่วนเงินเดือนที่ลูกค้าเห็น"
          >
            {(
              [
                { value: "both", label: "ทั้งสองส่วน" },
                { value: "runs", label: "รอบเงินเดือนเท่านั้น" },
                { value: "employees", label: "พนักงานเท่านั้น" },
              ] as { value: PayrollTabVisibility; label: string }[]
            ).map((option) => {
              const selected = payrollVisibility.mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={savingPayrollVisibility}
                  onClick={() => handleSetPayrollVisibility(option.value)}
                  className={`px-3 py-1.5 text-label font-medium rounded-control transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "bg-white text-ink-900" : "text-ink-500 hover:text-ink-700"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {savingPayrollVisibility && <p className="mt-2 text-label text-ink-300">กำลังบันทึก…</p>}
        </Card>
      </div>
    </div>
  );
}
