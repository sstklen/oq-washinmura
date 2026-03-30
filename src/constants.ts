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

// 通用 hasField 檢查（取代冗長的 Object.prototype.hasOwnProperty.call）
export function hasField<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
