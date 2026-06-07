alter table document_line_items
  add column if not exists base_quantity numeric(15,3);
