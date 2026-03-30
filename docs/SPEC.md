# 規格書: OQ 平台後端

## 磐石決定（從 REQ Decision Log 帶入）
> 以下決定在本專案中不會變，所有規格基於這些前提。

| ID | 決定 | 來源 |
|----|------|------|
| DD-01 | 獨立微服務，不掛 washin-api | REQ D-01 |
| DD-02 | Email 驗證碼登入，不做 OAuth/密碼 | REQ D-02 |
| DD-03 | 顯示名自訂（本名/暱稱/江湖名皆可） | REQ D-03 |
| DD-04 | 免費，先養平台 | REQ D-04 |
| DD-05 | 媒合 = 系統代發 email，不做站內信 | REQ D-05 |
| DD-06 | oq_token 綁定 email（一人一 token） | REQ D-06 |
| DD-07 | Bun + Hono + SQLite | REQ D-07 |
| DD-08 | Docker + Caddy reverse proxy，域名 oq.washinmura.jp | REQ D-08 |

---

## 模組設計（Deep Module Principle）
> 原則：小介面藏大實作。每個模組對外暴露最少的 API，內部封裝最多的複雜度。

| 模組名 | 公開介面 | 隱藏複雜度 | 可測試性 |
|--------|---------|-----------|---------|
| auth | `sendCode(email)`, `verifyCode(email, code)` | 驗證碼產生/過期/重試限制/session token 簽發 | ✅ 可 mock email，測 code 流程 |
| oq | `submit(data)`, `update(data)`, `updateSettings(data)` | oq_token 產生/等級計算/資料驗證/重複提交防護 | ✅ 可從 API 端對端測 |
| leaderboard | `query(filters)` | 分頁/篩選/排序/隱藏 email/快取 | ✅ 塞測試資料後查 API |
| contact | `send(fromUser, toOqId, message)` | 權限檢查/contactable 檢查/email 組裝/發送 | ✅ 可 mock email 發送 |
| db | `getDb()` | SQLite 初始化/migrate/連線管理 | ✅ 用 :memory: 測 |
| email | `sendEmail(to, subject, body)` | SMTP/SES 切換/retry/模板 | ✅ 可 mock transport |

---

## SPEC-01（→ REQ-02）: 發送驗證碼

- **輸入**: `POST /api/auth/send-code` body: `{ "email": "user@example.com" }`
- **行為**:
  1. 驗證 email 格式（RFC 5322 基本檢查）
  2. 產生 6 位數字驗證碼（crypto random）
  3. 寫入 `auth_codes` 表（email, code, expires_at = now + 10 分鐘）
  4. 同一 email 的舊驗證碼全部刪除（一次只有一個有效碼）
  5. 發 email（主旨：「OQ 驗證碼」，內容含驗證碼）
  6. 如果 `users` 表沒有此 email → 不做任何事（登入時才建 user）
- **輸出**: `200 { "ok": true }`（不論 email 是否存在，都回 200，防止探測）
- **異常**:
  - email 格式不合法 → `400 { "error": "invalid_email" }`
  - 同一 email 60 秒內重複請求 → `429 { "error": "rate_limit", "retry_after": N }`
  - email 發送失敗 → `500 { "error": "email_send_failed" }`（log 詳細錯誤，不回傳細節）
- **邊界**:
  - email 大小寫 → 全部轉 lowercase 存
  - email 前後空白 → trim
  - 極長 email（>254 字元）→ 400
- **所屬模組**: auth
- **範例**:
  - 正常: `POST { "email": "tkman@example.com" }` → `200 { "ok": true }` + email 收到 `482917`
  - 錯誤: `POST { "email": "not-email" }` → `400 { "error": "invalid_email" }`
  - 邊界: `POST { "email": "  TkMan@Example.COM  " }` → 正規化為 `tkman@example.com` → 200

---

## SPEC-02（→ REQ-02）: 驗證碼登入

- **輸入**: `POST /api/auth/verify` body: `{ "email": "user@example.com", "code": "482917" }`
- **行為**:
  1. email 正規化（lowercase + trim）
  2. 查 `auth_codes` 表：email + code 匹配 + 未過期
  3. 匹配成功 → 刪除該驗證碼（一次性）
  4. `users` 表若無此 email → 自動建立 user（role='oq', display_name=null）
  5. 更新 `users.last_login_at`
  6. 簽發 session token（JWT, HS256, payload: `{ user_id, email }`, 過期: 30 天）
- **輸出**: `200 { "token": "eyJ...", "user": { "id": 1, "email": "...", "display_name": null, "role": "oq" } }`
- **異常**:
  - 驗證碼錯誤 → `401 { "error": "invalid_code" }`
  - 驗證碼過期 → `401 { "error": "code_expired" }`
  - 同一 email 連續 5 次錯誤（10 分鐘內）→ `429 { "error": "too_many_attempts", "retry_after": 600 }`
  - 缺少 email 或 code → `400 { "error": "missing_fields" }`
- **邊界**:
  - code 帶空白 → trim
  - code 非 6 位數字 → 直接回 401（不查 DB）
- **所屬模組**: auth
- **範例**:
  - 正常（新用戶）: `POST { "email": "new@test.com", "code": "123456" }` → `200 { "token": "eyJ...", "user": { "id": 5, "email": "new@test.com", "display_name": null, "role": "oq" } }`
  - 正常（舊用戶）: `POST { "email": "old@test.com", "code": "654321" }` → `200 { "token": "eyJ...", "user": { "id": 1, ... } }`
  - 錯誤: `POST { "email": "x@test.com", "code": "000000" }` → `401 { "error": "invalid_code" }`

---

## SPEC-03（→ REQ-01）: OQ 提交

- **輸入**: `POST /api/oq/submit` + Authorization header
  ```json
  {
    "oq_value": 85200,
    "tokens_monthly": 892000000,
    "api_cost_monthly": 3550.00,
    "battle_record": {
      "bash": 12450,
      "commits": 340,
      "edits": 5600,
      "agents": 890,
      "web": 320,
      "total": 19600
    }
  }
  ```
- **行為**:
  1. 驗證 session token（JWT 解碼 → user_id）
  2. 檢查此 user 是否已有 `oq_profiles` 記錄 → 有 = 拒絕（用 update 端點）
  3. 驗證欄位：oq_value > 0 整數、tokens_monthly ≥ 0 整數、api_cost_monthly ≥ 0 數字
  4. 計算等級（依 tokens_monthly 日均）：
     - 日均 = tokens_monthly / 30
     - < 100 萬 → Lv.1
     - 100 萬 ~ 1,000 萬 → Lv.2
     - 1,000 萬 ~ 5,000 萬 → Lv.3
     - 5,000 萬 ~ 2 億 → Lv.4
     - 2 億 ~ 10 億 → Lv.5
     - > 10 億 → Lv.6
  5. 產生 oq_token（crypto randomUUID, 格式: `oq_xxxxxxxxxxxx`）
  6. 寫入 `oq_profiles`
  7. 回傳 oq_token + profile 摘要
- **輸出**: `201 { "oq_token": "oq_a1b2c3d4e5f6", "profile": { "oq_value": 85200, "level": 5, "display_name": null } }`
- **異常**:
  - 未登入 → `401 { "error": "unauthorized" }`
  - 已有 OQ 記錄 → `409 { "error": "already_submitted", "hint": "use PUT /api/oq/update" }`
  - oq_value ≤ 0 → `400 { "error": "invalid_oq_value" }`
  - 缺少必填欄位 → `400 { "error": "missing_fields", "fields": ["oq_value"] }`
- **邊界**:
  - oq_value 極大值（> 100 億）→ 允許（信任制，DD-04 精神）
  - battle_record 為 null → 允許，存 null
  - tokens_monthly = 0 → Lv.1
- **所屬模組**: oq
- **範例**:
  - 正常: 完整 body → `201 { "oq_token": "oq_...", "profile": { ... } }`
  - 錯誤: 重複提交 → `409 { "error": "already_submitted" }`
  - 邊界: `{ "oq_value": 500, "tokens_monthly": 0 }` → `201`, level = 1

---

## SPEC-04（→ REQ-03）: OQ 更新

- **輸入**: `PUT /api/oq/update`
  - 認證方式二擇一：
    - Authorization header（session token）
    - body 含 `oq_token`
  ```json
  {
    "oq_token": "oq_a1b2c3d4e5f6",
    "oq_value": 92000,
    "tokens_monthly": 1200000000,
    "api_cost_monthly": 4800.00,
    "battle_record": { "bash": 15000, "commits": 420, "edits": 7200, "agents": 1100, "web": 450, "total": 24170 }
  }
  ```
- **行為**:
  1. 認證：session token → 用 user_id 查 oq_profiles；或 oq_token 查 oq_profiles
  2. 驗證欄位（同 SPEC-03）
  3. 重算等級
  4. 更新 `oq_profiles`（oq_value, level, tokens_monthly, api_cost_monthly, battle_record, updated_at）
  5. oq_token 不變
- **輸出**: `200 { "profile": { "oq_value": 92000, "level": 5, "updated_at": "2026-03-30T..." } }`
- **異常**:
  - 無認證 → `401 { "error": "unauthorized" }`
  - oq_token 不存在 → `404 { "error": "oq_not_found" }`
  - 無 oq_profiles 記錄 → `404 { "error": "oq_not_found", "hint": "use POST /api/oq/submit first" }`
- **邊界**:
  - 同時傳 session token + oq_token → session token 優先
  - 部分更新（只傳 oq_value）→ 允許，其他欄位不動
- **所屬模組**: oq
- **範例**:
  - 用 oq_token: `PUT { "oq_token": "oq_...", "oq_value": 92000, ... }` → `200 { "profile": { ... } }`
  - 用 session: `PUT (Authorization: Bearer eyJ...) { "oq_value": 92000 }` → `200`
  - 錯誤: `PUT { "oq_token": "oq_nonexistent" }` → `404`

---

## SPEC-05（→ REQ-04）: 排行榜

- **輸入**: `GET /api/leaderboard?min=50000&max=200000&level=5&page=1&limit=50`
  - 所有 query 參數都是選填
- **行為**:
  1. 不需登入（公開 API）
  2. 查 `oq_profiles` JOIN `users`
  3. 篩選：
     - `min`: oq_value >= min
     - `max`: oq_value <= max
     - `level`: level = level（可多選，逗號分隔: `level=4,5,6`）
  4. 排序：oq_value DESC
  5. 分頁：page 從 1 開始，limit 預設 50，上限 100
  6. 回傳欄位：oq_id, display_name, oq_value, level, tokens_monthly, battle_record, updated_at
  7. **不回傳 email**（DD-03 精神 + REQ-04 非目標）
  8. display_name 為 null → 顯示 `"Anonymous"`
- **輸出**:
  ```json
  {
    "leaderboard": [
      {
        "oq_id": 3,
        "display_name": "tkman",
        "oq_value": 92000,
        "level": 5,
        "level_title": "一人科技公司 Solo Tech Co.",
        "tokens_monthly": 1200000000,
        "battle_record": { ... },
        "updated_at": "2026-03-30T..."
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 128, "pages": 3 }
  }
  ```
- **異常**:
  - page < 1 或 limit < 1 → `400 { "error": "invalid_pagination" }`
  - limit > 100 → 強制設為 100（不報錯）
  - min > max → `400 { "error": "invalid_range" }`
  - level 不在 1~6 → 忽略該值
- **邊界**:
  - 無資料 → `200 { "leaderboard": [], "pagination": { "total": 0, ... } }`
  - 無篩選條件 → 回傳全部（分頁）
- **所屬模組**: leaderboard
- **等級稱號對照**:
  | Level | 稱號 | 等於 |
  |-------|------|------|
  | 1 | 實習生 Intern | 0.5 人 |
  | 2 | 獨立開發者 Solo Dev | 1 人 |
  | 3 | 資深工程師 Senior Engineer | 2-3 人 |
  | 4 | 一人公司 One-Person Co. | 5 人團隊 |
  | 5 | 一人科技公司 Solo Tech Co. | 10 人工程部 |
  | 6 | 矽谷新創規格 SV Startup Tier | 20+ 人工程部 |
- **範例**:
  - 正常: `GET /api/leaderboard` → `200 { "leaderboard": [...], "pagination": { ... } }`
  - 篩選: `GET /api/leaderboard?level=5,6&min=80000` → 只回 Lv.5/6 且 OQ ≥ 80000
  - 空: `GET /api/leaderboard?min=999999999` → `200 { "leaderboard": [], ... }`

---

## SPEC-12（→ REQ-04 延伸）: 單人 OQ 查詢

- **輸入**: `GET /api/oq/profile/{oq_id}`
- **行為**:
  1. 不需登入（公開 API）
  2. 查 `oq_profiles` JOIN `users` WHERE oq_profiles.id = oq_id
  3. 回傳欄位同排行榜：oq_id, display_name, oq_value, level, level_title, tokens_monthly, battle_record, updated_at
  4. **不回傳 email**
  5. display_name 為 null → 顯示 `"Anonymous"`
- **輸出**:
  ```json
  {
    "profile": {
      "oq_id": 3,
      "display_name": "tkman",
      "oq_value": 92000,
      "level": 5,
      "level_title": "一人科技公司 Solo Tech Co.",
      "tokens_monthly": 1200000000,
      "battle_record": { "bash": 15000, "commits": 420, "edits": 7200, "agents": 1100, "web": 450, "total": 24170 },
      "updated_at": "2026-03-30T..."
    }
  }
  ```
- **異常**:
  - oq_id 不存在 → `404 { "error": "oq_not_found" }`
  - oq_id 非整數 → `400 { "error": "invalid_oq_id" }`
- **邊界**:
  - oq_id = 0 或負數 → 404
- **所屬模組**: leaderboard
- **用途**: 讓外部系統（MCP / A2A / CLI）查詢單人 OQ 能力值
- **範例**:
  - 正常: `GET /api/oq/profile/3` → `200 { "profile": { ... } }`
  - 錯誤: `GET /api/oq/profile/999` → `404 { "error": "oq_not_found" }`
  - 邊界: `GET /api/oq/profile/abc` → `400 { "error": "invalid_oq_id" }`

---

## SPEC-06（→ REQ-05）: 個人設定

- **輸入**: `PUT /api/oq/settings` + Authorization header
  ```json
  {
    "display_name": "tkman",
    "contactable": true
  }
  ```
- **行為**:
  1. 驗證 session token → user_id
  2. 確認有 oq_profiles 記錄
  3. 更新欄位（部分更新，只傳的欄位才改）：
     - `display_name` → 更新 `users.display_name`（1~30 字元，允許中日英數 + 空白 + 底線）
     - `contactable` → 更新 `oq_profiles.contactable`（boolean → 存 0/1）
  4. 更新 `oq_profiles.updated_at`
- **輸出**: `200 { "settings": { "display_name": "tkman", "contactable": true } }`
- **異常**:
  - 未登入 → `401 { "error": "unauthorized" }`
  - 無 OQ 記錄 → `404 { "error": "oq_not_found" }`
  - display_name 太長（>30 字）→ `400 { "error": "display_name_too_long", "max": 30 }`
  - display_name 空字串 → `400 { "error": "display_name_empty" }`
  - display_name 含特殊字元（<script> 等）→ `400 { "error": "display_name_invalid" }`
- **邊界**:
  - 只傳 contactable → display_name 不動
  - 只傳 display_name → contactable 不動
  - body 為空 → `400 { "error": "no_fields" }`
- **所屬模組**: oq
- **範例**:
  - 正常: `PUT { "display_name": "和心村CTO" }` → `200 { "settings": { "display_name": "和心村CTO", "contactable": true } }`
  - 部分: `PUT { "contactable": false }` → `200`（display_name 不動）
  - 錯誤: `PUT { "display_name": "<script>alert(1)</script>" }` → `400`

---

## SPEC-07（→ REQ-06）: 媒合聯絡

- **輸入**: `POST /api/contact/{oq_id}` + Authorization header
  ```json
  {
    "message": "你好，我是某某公司，想聊聊合作機會。"
  }
  ```
- **行為**:
  1. 驗證 session token → from_user_id
  2. 查 `oq_profiles` WHERE id = oq_id
  3. 檢查 `contactable = 1`（不可聯絡 → 拒絕）
  4. 查 OQ 持有人的 email（JOIN users）
  5. 記錄到 `contacts` 表
  6. 發 email 給 OQ 持有人：
     - 寄件人：noreply@washinmura.jp
     - 主旨：「[OQ] 有人想聯絡你」
     - 內容：找人方的 message + 找人方的 email（讓 OQ 持有人自行回覆）
  7. 不能自己聯絡自己
- **輸出**: `200 { "ok": true, "message": "已發送聯絡信" }`
- **異常**:
  - 未登入 → `401 { "error": "unauthorized" }`
  - oq_id 不存在 → `404 { "error": "oq_not_found" }`
  - 對方 contactable = 0 → `403 { "error": "not_contactable" }`
  - 自己聯絡自己 → `400 { "error": "cannot_contact_self" }`
  - message 為空 → `400 { "error": "message_required" }`
  - message > 2000 字 → `400 { "error": "message_too_long", "max": 2000 }`
  - 同一人對同一人 24 小時內限 3 次 → `429 { "error": "contact_rate_limit" }`
  - email 發送失敗 → `500 { "error": "email_send_failed" }`（已記錄到 contacts，標記 failed）
- **邊界**:
  - message 含 HTML → 純文字化（strip tags）
  - oq_id 非整數 → `400 { "error": "invalid_oq_id" }`
- **所屬模組**: contact
- **範例**:
  - 正常: `POST /api/contact/3 { "message": "想合作" }` → `200 { "ok": true, ... }`
  - 錯誤: 對方關閉聯絡 → `403 { "error": "not_contactable" }`
  - 邊界: 24h 內第 4 次 → `429 { "error": "contact_rate_limit" }`

---

## SPEC-08（跨功能）: Session Token 規格

- **格式**: JWT (HS256)
- **Payload**: `{ "user_id": 1, "email": "...", "iat": ..., "exp": ... }`
- **過期**: 30 天
- **Secret**: 環境變數 `JWT_SECRET`（.env，不進版控）
- **傳遞方式**: `Authorization: Bearer {token}`
- **驗證失敗統一回**: `401 { "error": "unauthorized" }`（token 過期/格式錯/簽名不對都同一個回覆，不洩漏原因）
- **所屬模組**: auth

---

## SPEC-09（跨功能）: DB 初始化

- **行為**: 應用啟動時 `getDb()` 自動建表（IF NOT EXISTS）
- **Schema**: 依 REQ DB Schema 草案，加上以下調整：
  - `users.created_at` DEFAULT `datetime('now')`
  - `users.last_login_at` DEFAULT `datetime('now')`
  - `oq_profiles.updated_at` DEFAULT `datetime('now')`
  - `auth_codes` 加 `created_at` DEFAULT `datetime('now')`，用於 rate limit 計算
  - `contacts` 加 `status` TEXT DEFAULT `'sent'`（sent/failed，追蹤 email 發送狀態）
- **索引**:
  - `CREATE INDEX idx_oq_profiles_level ON oq_profiles(level)`
  - `CREATE INDEX idx_oq_profiles_oq_value ON oq_profiles(oq_value DESC)`
  - `CREATE INDEX idx_auth_codes_email ON auth_codes(email)`
  - `CREATE INDEX idx_contacts_from_to ON contacts(from_user_id, to_oq_id)`
- **PRAGMA**: `journal_mode=WAL`, `foreign_keys=ON`
- **所屬模組**: db

---

## SPEC-10（跨功能）: Email 發送

- **服務**: Amazon SES（OQ 獨立設定，不與 washin-api 共用）
- **獨立原則**: OQ 有自己的 SES credentials + 自己的寄件域名設定，未來新服務也各自獨立
- **寄件人**: `noreply@oq.washinmura.jp`（OQ 專用子域名）
- **用途**:
  1. 驗證碼（SPEC-01）：純文字，主旨「OQ 驗證碼」
  2. 聯絡通知（SPEC-07）：純文字，主旨「[OQ] 有人想聯絡你」
- **Retry**: 失敗重試 1 次，仍失敗 → log + 回 500
- **環境變數**（OQ 自己的 .env）: `OQ_SES_REGION`, `OQ_AWS_ACCESS_KEY_ID`, `OQ_AWS_SECRET_ACCESS_KEY`
- **所屬模組**: email

---

## SPEC-11（跨功能）: 安全與限速

| 端點 | 限速 | 說明 |
|------|------|------|
| POST /api/auth/send-code | 同 email 60s 一次 | 防濫發驗證碼 |
| POST /api/auth/verify | 同 email 10 分鐘 5 次 | 防暴力破解 |
| POST /api/contact/{id} | 同一對 24h 3 次 | 防騷擾 |
| GET /api/leaderboard | IP 60 次/分鐘 | 防爬蟲 |
| 其他需登入端點 | user 120 次/分鐘 | 一般防護 |

- **CORS**: 允許 `oq.washinmura.jp`，開發環境允許 `localhost:*`
- **XSS 防護**: display_name + message 入庫前 strip HTML tags
- **SQL Injection**: 全部用 prepared statement（Bun SQLite 原生支援）
- **所屬模組**: 中間件（Hono middleware）

---

## Assumptions

| ID | 假設 | 驗證方式 | 狀態 |
|----|------|---------|------|
| A-01 | OQ 用獨立 SES credentials，不共用 washin-api | tkman 決定 2026-03-30 | ✅ |
| A-02 | oq.washinmura.jp 獨立 DNS + Caddy | tkman 決定 2026-03-30 | ✅ 部署時設定 |
| A-03 | 獨立 docker-compose，不加進 washin-api | tkman 決定 2026-03-30 | ✅ |
| A-04 | OQ 值信任制，不需驗證真假 | REQ-01 明確寫「信任制」 | ✅ |
| A-05 | 不需要前端 SSR，純 API + 靜態 HTML | REQ 未提 SSR 需求 | ✅ |

---

## Open Questions

| ID | 問題 | 影響範圍 | 狀態 |
|----|------|---------|------|
| Q-01 | SES 有設好 washinmura.jp 嗎？還是用其他 email 服務？ | SPEC-10 | ✅ 已決：OQ 獨立 SES |
| Q-02 | oq.washinmura.jp 的 DNS 和 Caddy 設定要新增嗎？ | SPEC-09, 部署 | ✅ 已決：獨立 |
| Q-03 | Docker 要獨立 compose 還是加進現有 washin-api 的 compose？ | 部署 | ✅ 已決：獨立 compose |

---

## Decision Log（從 REQ 帶入 + 新增）

| ID | 決定 | 原因 | 放棄方案 | 日期 |
|----|------|------|---------|------|
| D-01 | 獨立微服務 | 乾淨、不影響主站 | 掛 washin-api 子路由 | REQ |
| D-02 | Email 驗證碼登入 | 簡單、不用 OAuth | OAuth / 密碼 | REQ |
| D-03 | 自訂顯示名 | 自由度最高 | 強制本名 | REQ |
| D-04 | 免費 | 先養平台 | 收費 | REQ |
| D-05 | 系統代發 email 媒合 | 最簡 MVP | 站內信 / 即時聊天 | REQ |
| D-06 | oq_token 綁 email | 一人一 token | 多 token | REQ |
| D-07 | Bun + Hono + SQLite | 跟現有專案一致 | Node + Express | REQ |
| D-08 | Docker + Caddy | 跟現有架構一致 | 裸機部署 | REQ |
| D-09 | JWT HS256 30 天過期 | 簡單安全、前端好存 | Session cookie | SPEC 新增 |
| D-10 | display_name 上限 30 字 | 防亂填、排行榜排版 | 無限制 | SPEC 新增 |
| D-11 | 聯絡訊息上限 2000 字 | 夠用且防濫用 | 無限制 | SPEC 新增 |
| D-12 | 等級計算用日均 token（月量/30） | 跟 prompt.md 一致 | 用月總量 | SPEC 新增 |
| D-13 | SES/DB/Docker 全部獨立，不與 washin-api 共用 | 未來新服務也各自獨立，不會記錯地方 | 共用 washin-api 資源 | 2026-03-30 |

---

## Traceability

| REQ | SPEC | Module | Status |
|-----|------|--------|--------|
| REQ-01 OQ 提交 | SPEC-03 | oq | ✅ |
| REQ-02 Email 登入 | SPEC-01, SPEC-02 | auth | ✅ |
| REQ-03 OQ 更新 | SPEC-04 | oq | ✅ |
| REQ-04 排行榜 | SPEC-05, SPEC-12 | leaderboard | ✅ |
| REQ-05 個人設定 | SPEC-06 | oq | ✅ |
| REQ-06 媒合聯絡 | SPEC-07 | contact | ✅ |
| — | SPEC-08 Session Token | auth | ✅ 跨功能 |
| — | SPEC-09 DB 初始化 | db | ✅ 跨功能 |
| — | SPEC-10 Email 發送 | email | ✅ 跨功能 |
| — | SPEC-11 安全與限速 | middleware | ✅ 跨功能 |
