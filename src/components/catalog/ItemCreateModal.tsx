import { Modal } from "../ui/Modal";
import { ItemForm } from "./ItemForm";
import type { Item } from "../../types";

interface ItemCreateModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the fresh row after the item is saved — lets the host apply
   * it to a line immediately (auto-select) without waiting for a refetch. */
  onCreated: (item: Item) => void;
}

/**
 * Full catalog-item creation over any form (e.g. the deal editor): wraps the
 * same ItemForm used by /catalog/new so there is a single source of truth for
 * item fields. Mounts fresh on every open — ItemForm state resets.
 */
export function ItemCreateModal({ open, onClose, onCreated }: ItemCreateModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="สร้างสินค้า/บริการใหม่" size="xl" className="md:max-w-2xl">
      <ItemForm
        item={null}
        onSave={() => undefined}
        onCancel={onClose}
        onCreated={(item) => {
          onCreated(item);
          onClose();
        }}
      />
    </Modal>
  );
}
