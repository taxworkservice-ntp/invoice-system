export function defaultTerms(companyName: string): string[] {
  return [
    "ได้รับสินค้าตามรายการข้างบนนี้ไว้ในสภาพดีและถูกต้องเรียบร้อยแล้ว",
    "สินค้าตามรายการข้างบนนี้ หากมีการเสียหายหรือชำรุด โปรดแจ้งกลับให้ทราบภายใน 3 วัน",
    "สินค้าซื้อแล้ว จะไม่รับคืน ยกเว้นแต่จะตกลงเป็นอย่างอื่น",
    `โปรดสั่งจ่ายเช็คขีดคร่อมในนาม "${companyName}"`,
  ];
}

export function splitTerms(value: string | null | undefined, companyName: string): string[] {
  const custom = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return custom && custom.length > 0 ? custom : defaultTerms(companyName);
}
