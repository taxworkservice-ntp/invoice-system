import { useMemo, useState } from "react";
import { Building2, Plus, Search, Star } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { Customer } from "../../types";

interface CustomerPickerModalProps {
  open: boolean;
  customers: Customer[];
  selectedCustomerId?: string | null;
  taxSensitive?: boolean;
  onSelect: (customer: Customer) => void;
  onClose: () => void;
  onCreate?: (customer: Pick<Customer, "name" | "code" | "tax_id" | "address">) => Promise<Customer>;
}

function customerSearchText(customer: Customer) {
  return [
    customer.name,
    customer.code || "",
    customer.tax_id || "",
    customer.contact_name || "",
    customer.phone || "",
    customer.address || "",
  ].join(" ").toLowerCase();
}

export function CustomerPickerModal({
  open,
  customers,
  selectedCustomerId,
  taxSensitive = false,
  onSelect,
  onClose,
  onCreate,
}: CustomerPickerModalProps) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", code: "", tax_id: "", address: "" });

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name, "th")),
    [customers],
  );

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedCustomers;
    return sortedCustomers.filter((customer) => customerSearchText(customer).includes(query));
  }, [search, sortedCustomers]);

  const handleCreate = async () => {
    if (!onCreate || !newCustomer.name.trim()) return;
    setSaving(true);
    try {
      const customer = await onCreate({
        name: newCustomer.name.trim(),
        code: newCustomer.code.trim() || null,
        tax_id: newCustomer.tax_id.trim() || null,
        address: newCustomer.address.trim() || null,
      });
      setNewCustomer({ name: "", code: "", tax_id: "", address: "" });
      setAdding(false);
      setSearch("");
      onSelect(customer);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="เลือกลูกค้า" className="md:max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="ค้นหาชื่อ รหัส เลขผู้เสียภาษี เบอร์โทร หรือที่อยู่"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </div>

        {adding ? (
          <div className="rounded-xl border border-card-border bg-[#FAF8F3] p-3">
            <div className="mb-3 text-sm font-medium text-[#1A1A18]">เพิ่มลูกค้าใหม่</div>
            <div className="space-y-2">
              <Input label="ชื่อลูกค้า" value={newCustomer.name} onChange={(event) => setNewCustomer((prev) => ({ ...prev, name: event.target.value }))} />
              <Input label="รหัสลูกค้า" value={newCustomer.code} onChange={(event) => setNewCustomer((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} placeholder="เช่น JMK-001" />
              <Input label="เลขผู้เสียภาษี" value={newCustomer.tax_id} onChange={(event) => setNewCustomer((prev) => ({ ...prev, tax_id: event.target.value }))} />
              <Input label="ที่อยู่" value={newCustomer.address} onChange={(event) => setNewCustomer((prev) => ({ ...prev, address: event.target.value }))} />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>ยกเลิก</Button>
                <Button size="sm" disabled={!newCustomer.name.trim() || saving} loading={saving} onClick={handleCreate}>บันทึกและเลือก</Button>
              </div>
            </div>
          </div>
        ) : onCreate ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setNewCustomer((prev) => ({ ...prev, name: search.trim() || prev.name }));
              setAdding(true);
            }}
          >
            <Plus className="h-4 w-4" />
            เพิ่มลูกค้าใหม่
          </Button>
        ) : null}

        <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-card-border">
          {filteredCustomers.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">ไม่พบลูกค้าที่ตรงกับคำค้น</div>
          ) : (
            <div className="divide-y divide-card-border">
              {filteredCustomers.map((customer) => {
                const selected = customer.id === selectedCustomerId;
                const missingTaxInfo = taxSensitive && (!customer.tax_id || !customer.address);
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => {
                      onSelect(customer);
                      onClose();
                    }}
                    className={`w-full px-3 py-3 text-left transition-colors hover:bg-gray-50 ${selected ? "bg-blue-50" : "bg-white"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F3F0E8] text-[#5F5A52]">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-words text-sm font-semibold text-[#1A1A18]">{customer.name}</span>
                          {customer.code && <span className="text-xs font-mono text-primary font-medium">{customer.code}</span>}
                          {customer.is_favorite && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                          {customer.tax_id && <span>เลขผู้เสียภาษี: {customer.tax_id}</span>}
                          {customer.phone && <span>{customer.phone}</span>}
                        </div>
                        {customer.address && <div className="mt-1 line-clamp-2 text-xs text-gray-500">{customer.address}</div>}
                        {missingTaxInfo && <div className="mt-1 text-xs text-amber-600">ข้อมูลลูกค้ายังไม่ครบสำหรับเอกสารภาษี</div>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
