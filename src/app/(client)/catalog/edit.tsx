import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ItemForm } from "../../../components/catalog/ItemForm";
import { supabase } from "../../../lib/supabase";
import { useToast } from "../../../hooks/useToast";
import type { Item } from "../../../types";

export default function CatalogEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    supabase
      .from("items")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else if (data) setItem(data as Item);
        setLoading(false);
      });
  }, [id]);

  async function handleDelete() {
    if (!item) return;
    setDeleting(true);
    const { error: err } = await supabase
      .from("items")
      .update({ is_active: false })
      .eq("id", item.id);
    if (err) {
      toast.error(err.message);
    } else {
      toast.success("ซ่อนรายการแล้ว");
      navigate("/catalog", { replace: true });
    }
    setDeleting(false);
  }

  if (loading)
    return (
      <AppShell title="" showBack>
        <Spinner />
      </AppShell>
    );
  if (error || !item)
    return (
      <AppShell title="ไม่พบสินค้า" showBack>
        <p className="text-sm text-gray-500">ไม่พบข้อมูลสินค้า</p>
      </AppShell>
    );

  return (
    <AppShell
      title="แก้ไขสินค้า"
      showBack
      action={
        <Button
          size="sm"
          variant="danger"
          onClick={() => setDeleteConfirm(true)}
        >
          ลบ
        </Button>
      }
    >
      <ItemForm
        item={item}
        onSave={() => navigate(`/catalog/${item.id}`)}
        onCancel={() => navigate(`/catalog/${item.id}`)}
      />

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDeleteConfirm(false)}
          />
          <div className="relative bg-white rounded-t-xl md:rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-base font-semibold mb-1">
              ลบ {item.name}?
            </h3>
            <p className="text-sm text-[#888780] mb-1">
              รายการนี้จะถูกซ่อนจากแค็ตตาล็อก
            </p>
            <p className="text-sm text-[#888780] mb-4">
              เอกสารที่ใช้รายการนี้ไม่ได้รับผลกระทบ
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={deleting}
                loading={deleting}
                className="flex-1"
              >
                ลบรายการ
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDeleteConfirm(false)}
                className="flex-1"
              >
                ยกเลิก
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
