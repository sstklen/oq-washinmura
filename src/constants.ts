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

// 取得等級稱號（找不到則回傳 null）
export function getLevelTitle(level: number): string | null {
  return LEVEL_TITLES[level] ?? null;
}

// BattleRecord 必要欄位（不含 total，total 由其餘欄位加總驗證）
const BATTLE_RECORD_COMPONENT_KEYS = ["bash", "commits", "edits", "agents", "web"] as const;

// 嚴格驗證 BattleRecord：六欄位皆須為非負整數，total 必須等於其餘五欄位之和
export function validateBattleRecord(value: unknown): { valid: true } | { valid: false; reason: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { valid: false, reason: "battle_record_not_object" };
  }

  const record = value as Record<string, unknown>;

  // 檢查所有必要欄位存在且為非負整數
  for (const key of BATTLE_RECORD_COMPONENT_KEYS) {
    const v = record[key];
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
      return { valid: false, reason: `battle_record_invalid_${key}` };
    }
  }

  // total 也必須為非負整數
  if (typeof record.total !== "number" || !Number.isSafeInteger(record.total) || record.total < 0) {
    return { valid: false, reason: "battle_record_invalid_total" };
  }

  // total 必須等於其餘欄位之和
  const expectedTotal = BATTLE_RECORD_COMPONENT_KEYS.reduce(
    (sum, key) => sum + (record[key] as number),
    0,
  );

  if (record.total !== expectedTotal) {
    return { valid: false, reason: "battle_record_total_mismatch" };
  }

  return { valid: true };
}

// OQ 分數格式化輸出，保留 1 位小數並加上單位
export function formatOqScore(score: number): string {
  return `${Number.isFinite(score) ? score.toFixed(1) : "NaN"} OQ`;
}
