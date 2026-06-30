export function defaultTerms(companyName: string): string[] {
  return [
    "โปรดตรวจสอบสินค้า/บริการเมื่อได้รับหรือส่งมอบ",
    "หากพบข้อผิดพลาด ความเสียหาย หรือความไม่ครบถ้วน โปรดแจ้งภายใน 3 วัน",
    "สินค้า/บริการที่ส่งมอบแล้ว ไม่สามารถยกเลิก เปลี่ยน หรือคืนได้ เว้นแต่เกิดจากความผิดพลาดของผู้ขาย หรือมีข้อตกลงเป็นลายลักษณ์อักษร",
    "การชำระเงินให้เป็นไปตามเงื่อนไขที่ตกลงกัน",
    "ผู้ขายขอสงวนสิทธิ์เรียกดอกเบี้ยกรณีชำระล่าช้า ตามที่กฎหมายหรือข้อตกลงกำหนด",
  ];
}

export function splitTerms(value: string | null | undefined, companyName: string): string[] {
  const custom = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return custom && custom.length > 0 ? custom : defaultTerms(companyName);
}
