import { useNavigate } from "react-router-dom";
import { AppShell } from "../../../components/layout/AppShell";
import { CatalogList } from "../../../components/catalog/CatalogList";
import { useItems } from "../../../hooks/useItems";
import { useAuth } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import type { Item } from "../../../types";

export default function CatalogPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const { items, loading, updateItemLocal } = useItems(profile?.id);

  async function handleToggleFavorite(item: Item, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const next = !item.is_favorite;
    updateItemLocal(item.id, { is_favorite: next });
    const { error } = await supabase
      .from("items")
      .update({ is_favorite: next })
      .eq("id", item.id);
    if (error) {
      updateItemLocal(item.id, { is_favorite: !next });
      toast.error(error.message);
    }
  }

  return (
    <AppShell title="สินค้า / บริการ">
      <CatalogList
        items={items}
        loading={loading}
        onAdd={() => navigate("/catalog/new")}
        userId={profile?.id}
        onToggleFavorite={handleToggleFavorite}
      />
    </AppShell>
  );
}
