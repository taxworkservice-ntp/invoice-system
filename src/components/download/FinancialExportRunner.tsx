import { useEffect, useRef } from "react";
import { useFinancialReport } from "../../hooks/useReports";
import { downloadBlob, datedFilename } from "../../lib/download/download";
import { financialTransactionsCsvBlob } from "../../lib/download/csvReports";
import { logDownload } from "../../lib/download/audit";
import type { DownloadJobContext, DownloadJobResult } from "../../hooks/useDownloadJob";

interface FinancialExportRunnerProps {
  userId: string;
  workspaceUserId: string;
  actorUserId?: string;
  from: string;
  to: string;
  periodLabel: string;
  format: "xlsx" | "csv";
  companyName?: string;
  vatRegistered: boolean;
  run: (task: (ctx: DownloadJobContext) => Promise<DownloadJobResult | void>) => Promise<DownloadJobResult | null>;
  onDone: () => void;
}

/**
 * Mounted only while a financial report export is requested, so the heavy
 * useFinancialReport hook does NOT run on page load (lazy report loading).
 */
export function FinancialExportRunner({
  userId,
  workspaceUserId,
  actorUserId,
  from,
  to,
  periodLabel,
  format,
  companyName,
  vatRegistered,
  run,
  onDone,
}: FinancialExportRunnerProps) {
  const report = useFinancialReport(userId, from, to);
  const started = useRef(false);

  useEffect(() => {
    if (report.loading || started.current) return;
    started.current = true;

    void run(async () => {
      if (report.error) throw new Error(report.error);
      if (!report.summary) throw new Error("ยังไม่มีข้อมูล");

      if (format === "csv") {
        downloadBlob(financialTransactionsCsvBlob(report.transactions), datedFilename("financial", "csv"));
      } else {
        const { buildFinancialReportXlsx } = await import("../../lib/financialReportXlsx");
        const buffer = await buildFinancialReportXlsx({
          summary: report.summary,
          transactions: report.transactions,
          whtTransactions: report.whtTransactions,
          arByCustomer: report.arByCustomer,
          arDetails: report.arDetails,
          arAging: report.arAging,
          topCustomers: report.topCustomers,
          monthly: report.monthly,
          byType: report.byType,
          lineItems: report.lineItems,
          dealNotes: report.dealNotes,
          cogs: report.cogs,
          collectionRate: report.collectionRate,
          periodLabel,
          companyName,
          vatRegistered,
          generatedAt: new Date(),
        });
        downloadBlob(
          new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          `financial_${from}_${to}.xlsx`,
        );
      }

      await logDownload({
        workspaceUserId,
        actorUserId,
        kind: "report_financial",
        format,
        params: { from, to, period: periodLabel },
        status: "success",
      });
      return { total: 1, succeeded: 1, failed: 0 };
    }).finally(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.loading, report.error]);

  return null;
}
