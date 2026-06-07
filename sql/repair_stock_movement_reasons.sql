update stock_movements sm
set reason = case
  when sm.movement_type = 'manual_in' then 'สต็อกเริ่มต้น'
  when sm.movement_type = 'manual_out' then 'ตัดสต็อกด้วยตนเอง'
  when sm.movement_type = 'return_in' then
    'คืนสต็อกจากการยกเลิกเอกสาร ' ||
    coalesce(
      (select d.doc_number from documents d where d.id = sm.document_id),
      left(sm.document_id::text, 8)
    )
  when sm.movement_type = 'auto_out' then
    'ตัดสต็อกจาก' ||
    coalesce(
      (
        select
          case
            when d.doc_type = 'delivery_note' then 'ใบส่งของ '
            when d.doc_type = 'tax_invoice_receipt' then 'ใบกำกับภาษี/ใบเสร็จรับเงิน '
            else 'ใบแจ้งหนี้ '
          end || d.doc_number
        from documents d
        where d.id = sm.document_id
      ),
      ''
    )
  else sm.reason
end
where sm.reason like '%เธ%'
   or sm.reason like '%เน€%';
