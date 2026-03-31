// 等級稱號對照表（SPEC-05）
export const LEVEL_TITLES: Record<number, string> = {
  1: "實習生 Intern",
  2: "獨立開發者 Solo Dev",
  3: "資深工程師 Senior Engineer",
  4: "一人公司 One-Person Co.",
  5: "一人科技公司 Solo Tech Co.",
  6: "矽谷新創規格 SV Startup Tier",
};

// HTML tag 檢測（不用 /g flag，避免 lastIndex 狀態問題）
export const HTML_TAG_PATTERN = /<[^>]*>/;

// OQ 類型（12 維指紋分類）
export const OQ_TYPES = ["統御型", "放大型", "防守型", "全能型", "混合型"] as const;
export type OqType = (typeof OQ_TYPES)[number];

// 正整數驗證（路由 param 用，嚴格：'1abc' → null）
export function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number.parseInt(value, 10);
  return n < 1 || !Number.isSafeInteger(n) ? null : n;
}

// 通用 hasField 檢查（取代冗長的 Object.prototype.hasOwnProperty.call）
export function hasField<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
