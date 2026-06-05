import { useNavigate } from "react-router-dom";
import { AppShell } from "../../../components/layout/AppShell";
import { CatalogList } from "../../../components/catalog/CatalogList";
import { useItems } from "../../../hooks/useItems";
import { useAuth } from "../../../hooks/useAuth";

export default function CatalogPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { items, loading } = useItems(profile?.id);

  return (
    <AppShell title="สินค้า / บริการ">
      <CatalogList
        items={items}
        loading={loading}
        onAdd={() => navigate("/catalog/new")}
      />
    </AppShell>
  );
}
