import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Spinner } from "./components/ui/Spinner";
import { useWorkspaceRole } from "./hooks/useAuth";
import { getWorkspacePermissions } from "./lib/permissions";

const LoginPage = lazy(() => import("./app/(auth)/login"));
const SetupPage = lazy(() => import("./app/(auth)/setup"));
const ResetPasswordPage = lazy(() => import("./app/(auth)/reset-password"));
const SetPasswordPage = lazy(() => import("./app/(auth)/set-password"));
const HomePage = lazy(() => import("./app/(client)/home"));
const NewDealPage = lazy(() => import("./app/(client)/deals/new"));
const DealDetailPage = lazy(() => import("./app/(client)/deals/[id]"));
const DocumentsPage = lazy(() => import("./app/(client)/documents/index"));
const NewDocumentPage = lazy(() => import("./app/(client)/documents/new"));
const EditDocumentPage = lazy(() => import("./app/(client)/documents/edit"));
const EditUtilityBillPage = lazy(() => import("./app/(client)/documents/edit-utility"));
const DocumentDetailPage = lazy(() => import("./app/(client)/documents/[id]"));
const DocumentPrintPreviewPage = lazy(() => import("./app/(client)/documents/print"));
const CatalogPage = lazy(() => import("./app/(client)/catalog/index"));
const CatalogItemPage = lazy(() => import("./app/(client)/catalog/[id]"));
const CatalogEditPage = lazy(() => import("./app/(client)/catalog/edit"));
const CatalogNewPage = lazy(() => import("./app/(client)/catalog/new"));
const SettingsProfilePage = lazy(() => import("./app/(client)/settings/profile"));
const SettingsTaxPage = lazy(() => import("./app/(client)/settings/tax"));
const SettingsNumberingPage = lazy(() => import("./app/(client)/settings/numbering"));
const SettingsStockPage = lazy(() => import("./app/(client)/settings/stock"));
const SettingsAccountPage = lazy(() => import("./app/(client)/settings/account"));
const ReportsPage = lazy(() => import("./app/(client)/reports/index"));
const CustomersPage = lazy(() => import("./app/(client)/customers/index"));
const CustomerDetailPage = lazy(() => import("./app/(client)/customers/[id]"));
const AdminClients = lazy(() => import("./app/(admin)/clients"));
const AdminClientDetail = lazy(() => import("./app/(admin)/clients/[id]"));
const AdminClientNew = lazy(() => import("./app/(admin)/clients/new"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-page-bg flex items-center justify-center">
      <Spinner />
    </div>
  );
}

export default function App() {
  const { profile, workspaceRole, workspacePermissions, loading, recovery } = useWorkspaceRole();
  const role = profile?.role ?? null;
  const isAdmin = role === "admin";
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);

  if (recovery) {
    return <Navigate to="/reset-password" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={!role ? <LoginPage /> : <Navigate to={isAdmin ? "/admin/clients" : "/home"} replace />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />

        {role === "client" ? (
          <>
            <Route path="/home" element={<HomePage />} />
            <Route path="/deals/new" element={<NewDealPage />} />
            <Route path="/deals/:id" element={<DealDetailPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/new" element={<NewDocumentPage />} />
            <Route path="/documents/:id/edit" element={<EditDocumentPage />} />
            <Route path="/documents/:id/edit-utility" element={<EditUtilityBillPage />} />
            <Route path="/documents/:id/print" element={<DocumentPrintPreviewPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/catalog" element={permissions.canManageCatalog ? <CatalogPage /> : <Navigate to="/home" replace />} />
            <Route path="/catalog/new" element={permissions.canManageCatalog ? <CatalogNewPage /> : <Navigate to="/catalog" replace />} />
            <Route path="/catalog/:id/edit" element={permissions.canManageCatalog ? <CatalogEditPage /> : <Navigate to="/catalog" replace />} />
            <Route path="/catalog/:id" element={permissions.canManageCatalog ? <CatalogItemPage /> : <Navigate to="/home" replace />} />
            <Route path="/customers" element={permissions.canManageCustomers ? <CustomersPage /> : <Navigate to="/home" replace />} />
            <Route path="/customers/:id" element={permissions.canManageCustomers ? <CustomerDetailPage /> : <Navigate to="/home" replace />} />
            <Route path="/reports" element={permissions.canViewReports ? <ReportsPage /> : <Navigate to="/home" replace />} />
            <Route path="/settings/profile" element={permissions.canManageSettings ? <SettingsProfilePage /> : <Navigate to="/home" replace />} />
            <Route path="/settings/tax" element={permissions.canManageSettings ? <SettingsTaxPage /> : <Navigate to="/home" replace />} />
            <Route path="/settings/numbering" element={permissions.canManageSettings ? <SettingsNumberingPage /> : <Navigate to="/home" replace />} />
            <Route path="/settings/stock" element={permissions.canManageSettings ? <SettingsStockPage /> : <Navigate to="/home" replace />} />
            <Route path="/settings/account" element={permissions.canManageSettings ? <SettingsAccountPage /> : <Navigate to="/home" replace />} />
            <Route path="/settings" element={permissions.canManageSettings ? <Navigate to="/settings/profile" replace /> : <Navigate to="/home" replace />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </>
        ) : role === "admin" ? (
          <>
            <Route path="/admin/clients" element={<AdminClients />} />
            <Route path="/admin/clients/new" element={<AdminClientNew />} />
            <Route path="/admin/clients/:id" element={<AdminClientDetail />} />
            <Route path="*" element={<Navigate to="/admin/clients" replace />} />
          </>
        ) : null}

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
