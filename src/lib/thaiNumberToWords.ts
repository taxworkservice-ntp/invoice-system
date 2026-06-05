const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TENS = ["", "สิบ", "ยี่สิบ", "สามสิบ", "สี่สิบ", "ห้าสิบ", "หกสิบ", "เจ็ดสิบ", "แปดสิบ", "เก้าสิบ"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function convertBlock(n: number): string {
  if (n === 0) return "";

  let result = "";
  const digits: number[] = [];

  let temp = n;
  while (temp > 0) {
    digits.push(temp % 10);
    temp = Math.floor(temp / 10);
  }

  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = digits[i];
    if (digit === 0) continue;

    if (i === 1 && digit === 2) {
      result += "ยี่";
    } else if (i === 1 && digit === 1) {
    } else if (i === 0 && digit === 1 && digits.length > 1) {
      result += "เอ็ด";
      continue;
    } else {
      result += DIGITS[digit];
    }

    if (i > 0) {
      result += PLACES[i];
    }
  }

  if (digits.length === 1 && digits[0] === 1 && n === 1) {
    return DIGITS[1];
  }

  return result;
}

function convertInteger(n: number): string {
  if (n === 0) return "ศูนย์";

  const millions = Math.floor(n / 1000000);
  const remainder = n % 1000000;

  let result = "";

  if (millions > 0) {
    result += convertBlock(millions) + "ล้าน";
  }
  if (remainder > 0) {
    result += convertBlock(remainder);
  }

  return result;
}

function convertBaht(baht: number): string {
  if (baht === 0) return "";
  return convertInteger(baht) + "บาท";
}

function convertSatang(satang: number): string {
  if (satang === 0) return "ถ้วน";
  return convertInteger(satang) + "สตางค์";
}

export function thaiNumberToWords(amount: number): string {
  const [bahtStr, satangStr] = amount.toFixed(2).split(".");
  const baht = parseInt(bahtStr, 10);
  const satang = parseInt(satangStr, 10);

  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";

  const bahtWords = baht > 0 ? convertBaht(baht) : "";
  const satangWords = convertSatang(satang);

  if (bahtWords && satangWords) {
    return bahtWords + satangWords;
  }
  return bahtWords || satangWords;
}
