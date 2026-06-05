import { useNavigate } from "react-router-dom";
import { AppShell } from "../../../components/layout/AppShell";
import { ItemForm } from "../../../components/catalog/ItemForm";

export default function CatalogNewPage() {
  const navigate = useNavigate();

  return (
    <AppShell title="เพิ่มสินค้า/บริการ" showBack>
      <ItemForm
        onSave={(itemId) => {
          if (itemId) {
            navigate(`/catalog/${itemId}`, { replace: true });
          } else {
            navigate("/catalog", { replace: true });
          }
        }}
        onCancel={() => navigate(-1)}
      />
    </AppShell>
  );
}
