# Code Review — OQ 平台後端 — 2026-03-31

## 審查者
- GPT-5.4: R1,R2,R4,R6,R7,R8,R9,R10,R11,R12,R13,R14,R15,R16,R17（15 輪）
- Gemini 2.5 Pro: R5,R7,R8（3 輪，額度限制）
- Opus 4.6: R1-R17（17 輪全程）

## 統計
- 總輪次：18（含 R0 simplify）
- 發現問題：63+
- 已修：63
- 殘留：0
- 104 tests / 0 fail / tsc --noEmit 零錯誤

## 交叉矩陣（最終狀態）
| 維度 | GPT | Gemini | Opus | 結論 |
|------|-----|--------|------|------|
| 1 Bug | ✅ | ✅ | ✅ | ✅ |
| 2 安全 | ✅ | ✅ | ✅ | ✅ |
| 3 架構 | ✅ | ✅ | ✅ | ✅ |
| 4 資源 | ✅ | ✅ | ✅ | ✅ |
| 5 重用 | ✅ | ✅ | ✅ | ✅ |
| 6 品質 | ✅ | ✅ | ✅ | ✅ |
| 7 效能 | ✅ | ✅ | ✅ | ✅ |
| 8 測試 | ✅ | — | ✅ | ✅ |
| 9 相容 | ✅ | ✅ | ✅ | ✅ |
| 10 觀測 | ✅ | — | ✅ | ✅ |
| 11 依賴 | ✅ | — | — | ✅ |
| 12 追溯 | ✅ | ✅ | ✅ | ✅ |

## 發現 + 修復記錄（按嚴重度排序）

| # | 問題 | 誰找到 | 輪次 | commit |
|---|------|--------|------|--------|
| 1 | IDOR — body.userId 直接用 | GPT | R1 | a6577ac |
| 2 | battle_record 回 JSON 字串不是物件 | GPT | R1 | a6577ac |
| 3 | rate limiter 只 export 沒掛 | Opus | R1 | d9a2a2d |
| 4 | auth send-code 無 try/catch | Opus | R1 | d9a2a2d |
| 5 | request logging 零 observability | Opus | R1 | d9a2a2d |
| 6 | updateSettings 不檢查 oq_profiles | GPT | R1 | a6577ac |
| 7 | cannot_contact_self 403→400 | GPT | R1 | a6577ac |
| 8 | display_name 更新不觸發 updated_at | GPT | R1 | a6577ac |
| 9 | LEVEL_TITLES 重複 | Simplify | R3 | de21f3e |
| 10 | HTML regex /g flag 狀態問題 | Simplify | R3 | de21f3e |
| 11 | SES client 每次重建 | Simplify | R3 | de21f3e |
| 12 | hasOwnProperty 重複 9 處 | Simplify | R3 | de21f3e |
| 13 | rate limit email 大小寫繞過 | GPT | R2 | d9355b9 |
| 14 | parseBattleRecord 舊格式炸 500 | GPT | R2 | d9355b9 |
| 15 | verify 缺 code → 400 not 401 | GPT | R2 | d9355b9 |
| 16 | XSS onmouseover bypass | Opus | R2 | e5afd55 |
| 17 | page=0 靜默修正 → 400 | Opus | R2 | e5afd55 |
| 18 | busy_timeout 5s | GPT+Opus | R4 | 5a3f2db |
| 19 | anonymous_id 無長度限制 | GPT+Opus | R4 | 5a3f2db |
| 20 | score 無 0-10 範圍 | GPT+Opus | R4 | 5a3f2db |
| 21 | oq_value 用 isSafeInteger | GPT | R4 | 5a3f2db |
| 22 | parseInt 嚴格驗證 '1abc' | GPT | R4 | 5a3f2db |
| 23 | migration catch 加 log | GPT | R4 | 5a3f2db |
| 24 | contact/fingerprint/oq 路由統一 parsePositiveInt | Opus | R6 | 904dfa3 |
| 25 | anonymous_id_too_long 加進 badRequestErrors | Opus | R7 | bcbb1ee |
| 26 | verify code trim | GPT | R7 | 145045c |
| 27 | oq_type 限 5 種合法值 | Opus+GPT | R8 | b3350fe |
| 28 | invalid_contactable 錯誤訊息 | Opus+Gemini | R8 | b3350fe |
| 29 | contact rate limit 算全部嘗試 | Opus | R8 | b3350fe |
| 30 | 全域 JSON error handler | GPT | R8 | a10ab19 |
| 31 | contact email 失敗 → email_send_failed | GPT | R8 | a10ab19 |
| 32 | contact rate limit 改回全部 | GPT | R9 | d7aab50 |
| 33 | display_name emoji 放行 | tkman | R9 | 9bc303f |
| 34 | defaultLimiter 掛上 oq+contact | Opus | R11 | f752e37 |
| 35 | verify 回 too_many_attempts | Opus | R11 | f752e37 |
| 36 | verifyCode 加 transaction | Opus+Gemini | R11 | d2b7962 |
| 37 | email fallback 不 log 敏感內容 | Opus | R11 | b83e053 |
| 38 | ensureFingerprintTable 移除重複 | Opus | R11 | 5320d57 |
| 39 | CF-Connecting-IP 優先 | Opus | R12 | 193c360 |
| 40 | Content-Type bypass 修 | Opus | R12 | 193c360 |
| 41 | migration 系統（只跑一次） | Opus | R12 | 193c360 |
| 42 | defaultLimiter 改 IP key | GPT | R12 | d56443d |
| 43 | email > 254 字元擋住 | GPT | R12 | 877bda5 |
| 44 | body=null TypeError → 400 | Opus | R13 | 68bedbd |
| 45 | CORS null → "null" 不是 "*" | Opus | R13 | 68bedbd |
| 46 | level=NULL → COALESCE | Opus | R13 | 68bedbd |
| 47 | contact 併發 transaction | Opus | R14 | e04928d |
| 48 | JWT_SECRET 啟動檢查 | Opus | R14 | e04928d |
| 49 | fingerprint runtime 驗證 | Opus | R14 | e04928d |
| 50 | match LIMIT 1000 | Opus | R15 | 603372c |
| 51 | oq_type alias 統一 normalizeOqType | Opus | R15 | 603372c |
| 52 | display_name trim 後判空 | Opus | R16 | bd3fb32 |
| 53 | display_name_too_long 回 max:30 | GPT | R16 | bd3fb32 |
| 54 | contact 成功回 message | GPT | R16 | bd3fb32 |
| 55 | message_too_long 回 max:2000 | GPT | R16 | bd3fb32 |
| 56 | level 過濾 1-6 | GPT | R16 | bd3fb32 |
| 57 | display_name 全用 trimmed 驗證 | Opus | R17 | 57daf9e |
| 58 | contact 移除死代碼 | Opus | R17 | 57daf9e |
| 59 | tsc --noEmit 零錯誤 | GPT | R18 | fad189f |
| 60 | oq_not_found 加 hint | GPT | R18 | fad189f |
