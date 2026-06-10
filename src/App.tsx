import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Spinner } from "./components/ui/Spinner";
import { useRole } from "./hooks/useAuth";
import { supabase } from "./lib/supabase";

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
const DocumentDetailPage = lazy(() => import("./app/(client)/documents/[id]"));
const DocumentPrintPreviewPage = lazy(() => import("./app/(client)/documents/print"));
const CatalogPage = lazy(() => import("./app/(client)/catalog/index"));
const CatalogItemPage = lazy(() => import("./app/(client)/catalog/[id]"));
const CatalogEditPage = lazy(() => import("./app/(client)/catalog/edit"));
const CatalogNewPage = lazy(() => import("./app/(client)/catalog/new"));
const SettingsPage = lazy(() => import("./app/(client)/settings/index"));
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
  const { role, isAdmin, loading } = useRole();
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && window.location.hash.includes("type=recovery")) {
        setRecovery(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
            <Route path="/documents/:id/print" element={<DocumentPrintPreviewPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/catalog/new" element={<CatalogNewPage />} />
            <Route path="/catalog/:id/edit" element={<CatalogEditPage />} />
            <Route path="/catalog/:id" element={<CatalogItemPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
