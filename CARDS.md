# 卡片清單: OQ 平台後端

## 複雜度評估
- **等級**: M（中）
- **理由**: 6 條 REQ, 預估新增 ~800 行, 6 個模組, 全新專案（greenfield）
- **卡數**: 8 張（AFK: 7, HITL: 1）

---

## CARD-01: 專案骨架 + DB 初始化

**Status:** todo
**Traces:** SPEC-09 → 跨功能基礎
**Module:** db, app
**Slice Type:** AFK
**Mode:** standard
**Executor:** codex
**Why:** 所有卡的基礎，沒有骨架其他卡不能開始
**Dependencies:** 無

### Scope
- 只改: `package.json`, `tsconfig.json`, `src/index.ts`, `src/db.ts`, `.env.example`
- 只做: Hono app 骨架 + SQLite DB 初始化 + /health endpoint
- 層級: schema + API + test

### Non-scope
- 不碰: 現有 index.html / tkman.html / prompt.md
- 不做: 任何業務 API（auth / oq / leaderboard）

### Environment
- Runtime: bun
- 工作目錄: /Users/tkman/Projects/oq-washinmura
- 需要: bun, typescript

### WORKORDER
1. `bun init -y` 初始化專案（如果 package.json 不存在）
2. 安裝依賴: `bun add hono @hono/node-server` + `bun add -d typescript @types/bun`
3. 建立 `tsconfig.json`（target: ESNext, module: ESNext, moduleResolution: bundler, strict: true）
4. 建立 `src/db.ts`:
   - export function `getDb(path?: string)` — 回傳 SQLite Database 實例
   - 使用 `bun:sqlite`
   - CREATE TABLE IF NOT EXISTS: users, oq_profiles, auth_codes, contacts（完整 schema 見 SPEC-09）
   - 所有 DEFAULT 值照 SPEC-09（datetime('now') 等）
   - 建立 4 個 INDEX（見 SPEC-09）
   - PRAGMA journal_mode=WAL, foreign_keys=ON
   - 支援傳入 ':memory:' 做測試用
5. 建立 `src/index.ts`:
   - Hono app
   - GET /health → `200 { "status": "ok", "timestamp": "..." }`
   - 啟動 port 從環境變數 `PORT` 讀取，預設 3100
   - 呼叫 getDb() 確保 DB 初始化
6. 建立 `.env.example`: PORT=3100, JWT_SECRET=change-me, DB_PATH=./data/oq.db, OQ_SES_REGION=, OQ_AWS_ACCESS_KEY_ID=, OQ_AWS_SECRET_ACCESS_KEY=
7. 建立 `src/db.test.ts`:
   - 測試 getDb(':memory:') 不報錯
   - 測試四張表都存在（SELECT name FROM sqlite_master WHERE type='table'）
   - 測試 PRAGMA foreign_keys = ON
   - 測試 PRAGMA journal_mode = wal
   - 測試 INSERT users 只帶 email → created_at 有預設值
   - 測試 foreign key 約束生效（INSERT oq_profiles 帶不存在 user_id → 報錯）

### Implementation Constraints
- 用 bun:sqlite（不用 better-sqlite3）
- DB 檔案路徑從 .env DB_PATH 讀取
- 遵循磐石決定: DD-07（Bun + Hono + SQLite）

### ACCEPTANCE
- [ ] `bun run src/index.ts` 啟動無報錯
- [ ] `curl http://localhost:3100/health` → 200 `{ "status": "ok" }`
- [ ] `bun test src/db.test.ts` 全部 PASS
- [ ] DB 檔案自動建立在 DB_PATH
- [ ] 四張表 + 四個索引都存在

### Acceptance Evidence
- `bun test` → 全 PASS
- `curl localhost:3100/health` → 200

### Required Checks
- [ ] **測試**: bun test 全部通過
- [ ] **錯誤處理**: index.ts 啟動失敗有 try/catch + 錯誤訊息

### Done Definition
ACCEPTANCE 全勾 + Required Checks 全過 + Commit 帶 CARD-01 = DONE

---

## CARD-02: Auth 驗證碼登入

**Status:** todo
**Traces:** SPEC-01 + SPEC-02 + SPEC-08 → REQ-02
**Module:** auth, email
**Slice Type:** AFK
**Mode:** tdd
**Executor:** codex
**Why:** 登入是所有需登入功能的前提
**Dependencies:** CARD-01

### Scope
- 只改: `src/routes/auth.ts`, `src/modules/auth.ts`, `src/modules/email.ts`, `src/middleware/auth-guard.ts`, `src/index.ts`（掛路由）
- 只做: send-code + verify + JWT 簽發 + auth middleware
- 層級: API + test

### Non-scope
- 不碰: DB schema（CARD-01 已建）
- 不做: 真正的 SES 發信（用 mock / console.log）
- 不做: OQ 相關功能

### Environment
- Runtime: bun
- 工作目錄: /Users/tkman/Projects/oq-washinmura
- 需要: bun, jose（JWT 庫: `bun add jose`）

### WORKORDER (TDD Mode)

**測試哲學：**
- 測試驗證行為（public interface），不測實作細節
- 一個 RED-GREEN 循環只做一件事

**循環 1: 發送驗證碼 — 正常路徑**
- RED: 寫測試 `POST /api/auth/send-code { "email": "test@example.com" }` → 200 + auth_codes 有碼
- GREEN: 實作 src/modules/auth.ts `sendCode()` + src/routes/auth.ts POST 路由 + src/modules/email.ts（mock: console.log）
- 驗證: bun test

**循環 2: 發送驗證碼 — email 正規化**
- RED: 寫測試 `{ "email": "  TEST@Example.COM  " }` → auth_codes.email = "test@example.com"
- GREEN: 加 trim + toLowerCase
- 驗證: bun test

**循環 3: 發送驗證碼 — 錯誤 email 格式**
- RED: 寫測試 `{ "email": "not-email" }` → 400
- GREEN: 加 email 格式驗證
- 驗證: bun test

**循環 4: 發送驗證碼 — 60 秒限速**
- RED: 寫測試 連續兩次 send-code → 第二次 429
- GREEN: 查 auth_codes.created_at 做限速
- 驗證: bun test

**循環 5: 驗證碼登入 — 正常路徑（新用戶）**
- RED: 寫測試 `POST /api/auth/verify { "email": "new@test.com", "code": "正確碼" }` → 200 + token + user 自動建立
- GREEN: 實作 verifyCode() + JWT 簽發（用 jose 庫, HS256, 30 天過期）
- 驗證: bun test

**循環 6: 驗證碼登入 — 錯誤碼 + 過期碼**
- RED: 寫測試 錯誤碼 → 401 / 過期碼 → 401
- GREEN: 加驗證邏輯
- 驗證: bun test

**循環 7: Auth middleware**
- RED: 寫測試 有效 JWT → req 拿到 user_id / 無效 JWT → 401 / 無 header → 401
- GREEN: 實作 src/middleware/auth-guard.ts
- 驗證: bun test

**REFACTOR:**
- 提取共用工具函數
- 確認所有測試仍 PASS

### Implementation Constraints
- JWT 用 jose 庫（輕量、無 native dependency）
- JWT_SECRET 從環境變數讀取
- 驗證碼 6 位數字，用 crypto.getRandomValues
- email mock: src/modules/email.ts export sendEmail() → 目前只 console.log（CARD-06 才接 SES）
- 401 回應不區分「碼錯」「過期」「格式錯」（SPEC-08: 不洩漏原因）— 等等，SPEC-02 有區分 invalid_code 和 code_expired，照 SPEC 走
- 遵循磐石決定: DD-02（Email 驗證碼登入）

### ACCEPTANCE
- [ ] TC-0101 ~ TC-0106 全 PASS（send-code 6 個 TC）
- [ ] TC-0201 ~ TC-0206 全 PASS（verify 6 個 TC）
- [ ] TC-0801 ~ TC-0805 全 PASS（session token 5 個 TC）
- [ ] Auth middleware 可被其他路由使用

### Acceptance Evidence
- `bun test src/modules/auth.test.ts` → 全 PASS
- `bun test src/routes/auth.test.ts` → 全 PASS
- `bun test src/middleware/auth-guard.test.ts` → 全 PASS

### Required Checks
- [ ] **測試**: bun test 全部通過（含所有 TC）
- [ ] **錯誤處理**: 每個 route handler 都有 try/catch

### Done Definition
ACCEPTANCE 全勾 + Required Checks 全過 + Commit 帶 CARD-02 = DONE

---

## CARD-03: OQ 提交 + 等級計算

**Status:** todo
**Traces:** SPEC-03 → REQ-01
**Module:** oq
**Slice Type:** AFK
**Mode:** tdd
**Executor:** codex
**Why:** OQ 的核心功能 — 提交後才有排行榜數據
**Dependencies:** CARD-02

### Scope
- 只改: `src/routes/oq.ts`, `src/modules/oq.ts`, `src/index.ts`（掛路由）
- 只做: POST /api/oq/submit + 等級計算 + oq_token 產生
- 層級: API + test

### Non-scope
- 不碰: auth 模組
- 不做: update / settings（CARD-05）

### Environment
- Runtime: bun
- 工作目錄: /Users/tkman/Projects/oq-washinmura

### WORKORDER (TDD Mode)

**循環 1: 等級計算純函數**
- RED: 寫測試 `calculateLevel(tokens_monthly)` 邊界值 — 0 → Lv.1 / 30M → Lv.1 / 30000001 → Lv.2 / 300M → Lv.2 / 300000001 → Lv.3 / 1.5B → Lv.3 / 1500000001 → Lv.4 / 6B → Lv.4 / 6000000001 → Lv.5 / 30B → Lv.5 / 30000000001 → Lv.6
- GREEN: 實作 calculateLevel() in src/modules/oq.ts
- 驗證: bun test

**循環 2: OQ 提交 — 正常路徑**
- RED: 寫測試 POST /api/oq/submit 完整 body → 201 + oq_token 格式 oq_ 開頭 + profile 正確
- GREEN: 實作 submit 路由 + oq_token 產生（crypto.randomUUID → `oq_${uuid前12字}`）
- 驗證: bun test

**循環 3: OQ 提交 — 重複提交**
- RED: 寫測試 同一 user 再次 POST → 409
- GREEN: 加 user_id 查重
- 驗證: bun test

**循環 4: OQ 提交 — 驗證 + 未登入**
- RED: 寫測試 oq_value ≤ 0 → 400 / 未登入 → 401 / 缺欄位 → 400
- GREEN: 加驗證邏輯 + auth middleware 掛上
- 驗證: bun test

**循環 5: OQ 提交 — battle_record 可 null**
- RED: 寫測試 無 battle_record → 201 + battle_record = null
- GREEN: 讓 battle_record 為選填
- 驗證: bun test

**REFACTOR:**
- 等級計算抽成獨立函數
- 確認所有測試仍 PASS

### Implementation Constraints
- oq_token 格式: `oq_` + crypto.randomUUID() 前 12 字元
- 等級計算用日均 = tokens_monthly / 30（DD-12）
- battle_record 存 JSON 字串
- 遵循磐石決定: DD-06（oq_token 綁 email）

### ACCEPTANCE
- [ ] TC-0301 ~ TC-0306 全 PASS
- [ ] calculateLevel() 邊界值全正確（TC-0304）
- [ ] oq_token 格式正確（oq_ 開頭）

### Acceptance Evidence
- `bun test src/modules/oq.test.ts` → 全 PASS
- `bun test src/routes/oq.test.ts` → 全 PASS

### Required Checks
- [ ] **測試**: bun test 全部通過
- [ ] **錯誤處理**: route handler 有 try/catch

### Done Definition
ACCEPTANCE 全勾 + Required Checks 全過 + Commit 帶 CARD-03 = DONE

---

## CARD-04: 排行榜

**Status:** todo
**Traces:** SPEC-05 → REQ-04
**Module:** leaderboard
**Slice Type:** AFK
**Mode:** tdd
**Executor:** codex
**Why:** 公開展示 OQ 持有人，吸引找人方
**Dependencies:** CARD-03

### Scope
- 只改: `src/routes/leaderboard.ts`, `src/index.ts`（掛路由）
- 只做: GET /api/leaderboard（篩選 + 分頁 + 排序）
- 層級: API + test

### Non-scope
- 不碰: oq / auth 模組
- 不做: 前端頁面

### Environment
- Runtime: bun
- 工作目錄: /Users/tkman/Projects/oq-washinmura

### WORKORDER (TDD Mode)

**循環 1: 基本排行榜（無篩選）**
- RED: 寫測試 GET /api/leaderboard → 200 + 按 oq_value DESC + 有 pagination
- GREEN: 實作查詢 JOIN users + oq_profiles
- 驗證: bun test

**循環 2: 篩選 — level + min/max**
- RED: 寫測試 `?level=5,6&min=80000` → 只回符合條件的
- GREEN: 加 WHERE 條件（prepared statement）
- 驗證: bun test

**循環 3: 分頁**
- RED: 寫測試 `?page=2&limit=2` → 第二頁 + pagination.total 正確
- GREEN: 加 LIMIT/OFFSET
- 驗證: bun test

**循環 4: 邊界 — 空結果 + limit 超過 100 + display_name null → Anonymous**
- RED: 寫測試 無符合條件 → 空陣列 / limit=999 → 降為 100 / null name → "Anonymous"
- GREEN: 加邊界處理
- 驗證: bun test

**循環 5: 安全 — 不洩漏 email + level_title 對照**
- RED: 寫測試 回傳 JSON stringify 不含 @ / 有 level_title 欄位
- GREEN: SELECT 不選 email + 加 level_title 映射
- 驗證: bun test

**REFACTOR:**
- 確認所有測試仍 PASS

### Implementation Constraints
- 不需登入（公開 API）
- 不回傳 email（安全）
- level_title 映射照 SPEC-05 等級稱號對照表
- SQL 全用 prepared statement
- 遵循磐石決定: DD-03（顯示名自訂）

### ACCEPTANCE
- [ ] TC-0501 ~ TC-0506 全 PASS
- [ ] 不登入可存取
- [ ] 回傳無 email

### Acceptance Evidence
- `bun test src/routes/leaderboard.test.ts` → 全 PASS

### Required Checks
- [ ] **測試**: bun test 全部通過
- [ ] **錯誤處理**: route handler 有 try/catch

### Done Definition
ACCEPTANCE 全勾 + Required Checks 全過 + Commit 帶 CARD-04 = DONE

---

## CARD-05: OQ 更新 + 個人設定

**Status:** todo
**Traces:** SPEC-04 + SPEC-06 → REQ-03 + REQ-05
**Module:** oq
**Slice Type:** AFK
**Mode:** tdd
**Executor:** codex
**Why:** 讓 OQ 持有人管理自己的資料
**Dependencies:** CARD-03

### Scope
- 只改: `src/routes/oq.ts`（加 update + settings 路由）, `src/modules/oq.ts`（加 update + settings 邏輯）
- 只做: PUT /api/oq/update + PUT /api/oq/settings
- 層級: API + test

### Non-scope
- 不碰: submit 邏輯（CARD-03 已做）
- 不碰: leaderboard / contact

### Environment
- Runtime: bun
- 工作目錄: /Users/tkman/Projects/oq-washinmura

### WORKORDER (TDD Mode)

**循環 1: OQ 更新 — oq_token 認證**
- RED: 寫測試 PUT /api/oq/update `{ "oq_token": "oq_xxx", "oq_value": 92000 }` → 200 + 值更新
- GREEN: 實作 update 路由 + oq_token 查詢
- 驗證: bun test

**循環 2: OQ 更新 — session token 認證 + 優先順序**
- RED: 寫測試 用 Authorization header 更新 → 200 / 同時傳兩種 → session 優先
- GREEN: 加 session token 路徑
- 驗證: bun test

**循環 3: OQ 更新 — 部分更新 + 錯誤路徑**
- RED: 寫測試 只傳 oq_value → 其他不變 / oq_token 不存在 → 404 / 無認證 → 401
- GREEN: 加部分更新 + 錯誤處理
- 驗證: bun test

**循環 4: 個人設定 — display_name + contactable**
- RED: 寫測試 PUT /api/oq/settings `{ "display_name": "tkman" }` → 200 / `{ "contactable": false }` → 200
- GREEN: 實作 settings 路由
- 驗證: bun test

**循環 5: 個人設定 — 驗證 + XSS 防護**
- RED: 寫測試 display_name > 30 字 → 400 / 含 `<script>` → 400 / body 空 → 400
- GREEN: 加驗證 + strip HTML
- 驗證: bun test

**REFACTOR:**
- 確認所有測試仍 PASS

### Implementation Constraints
- 等級重算用同一個 calculateLevel()（CARD-03 已有）
- display_name 限 1~30 字，允許中日英數 + 空白 + 底線
- XSS: strip HTML tags（用正則 `/<[^>]*>/g` 移除）
- 遵循磐石決定: DD-03（顯示名自訂）, DD-06（oq_token）

### ACCEPTANCE
- [ ] TC-0401 ~ TC-0406 全 PASS（OQ 更新）
- [ ] TC-0601 ~ TC-0606 全 PASS（個人設定）
- [ ] 等級重算正確
- [ ] XSS 被擋

### Acceptance Evidence
- `bun test src/routes/oq.test.ts` → 全 PASS（含更新 + 設定的測試）

### Required Checks
- [ ] **測試**: bun test 全部通過
- [ ] **錯誤處理**: 每個 route handler 有 try/catch

### Done Definition
ACCEPTANCE 全勾 + Required Checks 全過 + Commit 帶 CARD-05 = DONE

---

## CARD-06: 媒合聯絡 + Email 發送

**Status:** todo
**Traces:** SPEC-07 + SPEC-10 → REQ-06
**Module:** contact, email
**Slice Type:** AFK
**Mode:** tdd
**Executor:** codex
**Why:** 平台的商業價值 — 讓找人方聯絡 OQ 持有人
**Dependencies:** CARD-05（需要 contactable 設定）

### Scope
- 只改: `src/routes/contact.ts`, `src/modules/email.ts`（從 mock 升級為 SES）, `src/index.ts`（掛路由）
- 只做: POST /api/contact/{oq_id} + SES 發信
- 層級: API + test

### Non-scope
- 不碰: auth / oq / leaderboard
- 不做: 站內信

### Environment
- Runtime: bun
- 工作目錄: /Users/tkman/Projects/oq-washinmura
- 需要: `bun add @aws-sdk/client-ses`

### WORKORDER (TDD Mode)

**循環 1: 聯絡 — 正常路徑**
- RED: 寫測試 POST /api/contact/3 `{ "message": "想合作" }` → 200 + contacts 表新增 + email mock 呼叫
- GREEN: 實作 contact 路由 + email.sendEmail()
- 驗證: bun test

**循環 2: 聯絡 — 權限檢查**
- RED: 寫測試 對方 contactable=0 → 403 / oq_id 不存在 → 404 / 自己聯絡自己 → 400 / 未登入 → 401
- GREEN: 加權限檢查
- 驗證: bun test

**循環 3: 聯絡 — 訊息驗證**
- RED: 寫測試 message 空 → 400 / > 2000 字 → 400 / 含 HTML → strip 後存
- GREEN: 加驗證 + strip tags
- 驗證: bun test

**循環 4: 聯絡 — 24h 限速**
- RED: 寫測試 同一對 24h 內第 4 次 → 429
- GREEN: 查 contacts 表 count
- 驗證: bun test

**循環 5: Email 模組 — SES 實作 + retry**
- RED: 寫測試 sendEmail() 第一次失敗 → 自動重試 → 成功 / 連續失敗 → throw
- GREEN: 實作 SES client（可 mock）+ retry 邏輯
- 驗證: bun test

**REFACTOR:**
- 確認所有測試仍 PASS

### Implementation Constraints
- email.ts 設計: 環境變數有 SES credentials → 用 SES，沒有 → console.log（開發模式）
- 寄件人: noreply@oq.washinmura.jp（DD-13 獨立）
- contacts.status: 'sent' / 'failed' 追蹤發送狀態
- 遵循磐石決定: DD-05（系統代發 email）, DD-13（獨立 SES）

### ACCEPTANCE
- [ ] TC-0701 ~ TC-0707 全 PASS（媒合聯絡）
- [ ] TC-1001 ~ TC-1005 全 PASS（Email 發送）
- [ ] email mock 模式可切換
- [ ] contacts 表正確記錄

### Acceptance Evidence
- `bun test src/routes/contact.test.ts` → 全 PASS
- `bun test src/modules/email.test.ts` → 全 PASS

### Required Checks
- [ ] **測試**: bun test 全部通過
- [ ] **錯誤處理**: route handler + email retry 都有 try/catch

### Done Definition
ACCEPTANCE 全勾 + Required Checks 全過 + Commit 帶 CARD-06 = DONE

---

## CARD-07: 安全中間件（CORS + 限速）

**Status:** todo
**Traces:** SPEC-11 → 跨功能
**Module:** middleware
**Slice Type:** AFK
**Mode:** standard
**Executor:** codex
**Why:** 上線前必要的安全防護
**Dependencies:** CARD-01

### Scope
- 只改: `src/middleware/cors.ts`, `src/middleware/rate-limit.ts`, `src/index.ts`（掛 middleware）
- 只做: CORS 設定 + 各端點限速
- 層級: middleware + test

### Non-scope
- 不碰: 業務邏輯
- 不做: WAF / DDoS 防護

### Environment
- Runtime: bun
- 工作目錄: /Users/tkman/Projects/oq-washinmura

### WORKORDER
1. 建立 `src/middleware/cors.ts`:
   - 允許 origin: `https://oq.washinmura.jp`
   - 開發環境（NODE_ENV !== 'production'）允許 `localhost:*`
   - 設定 allowed methods: GET, POST, PUT, OPTIONS
   - 設定 allowed headers: Content-Type, Authorization
2. 建立 `src/middleware/rate-limit.ts`:
   - 用 Map 做 in-memory rate limit（不需 Redis，單機夠用）
   - 設定: auth/send-code 同 email 60s 一次 / auth/verify 同 email 10min 5 次 / leaderboard IP 60 次/min / 其他 user 120 次/min
   - 過期 entry 定期清理（每 60 秒 sweep）
3. 在 `src/index.ts` 掛上 CORS + rate-limit middleware
4. 寫測試 `src/middleware/cors.test.ts`:
   - TC-1101: 允許 oq.washinmura.jp
   - TC-1102: 拒絕 evil.com
5. 寫測試 `src/middleware/rate-limit.test.ts`:
   - TC-1104: 超過限制 → 429
   - 限速 counter 過期後重置

### Implementation Constraints
- in-memory rate limit（重啟歸零，可接受）
- CORS 用 Hono 內建 cors middleware 或自己寫
- 遵循磐石決定: DD-08（oq.washinmura.jp 域名）

### ACCEPTANCE
- [ ] TC-1101 ~ TC-1106 全 PASS
- [ ] CORS 正確設定
- [ ] rate limit 各端點生效

### Acceptance Evidence
- `bun test src/middleware/` → 全 PASS

### Required Checks
- [ ] **測試**: bun test 全部通過
- [ ] **錯誤處理**: rate limit 429 回傳正確格式

### Done Definition
ACCEPTANCE 全勾 + Required Checks 全過 + Commit 帶 CARD-07 = DONE

---

## CARD-08: Docker + 部署設定

**Status:** todo
**Traces:** DD-08 → 部署架構
**Module:** infra
**Slice Type:** HITL
**Mode:** standard
**Executor:** codex
**Why:** 讓服務能跑在 VPS 上
**Dependencies:** CARD-01 ~ CARD-07 全部完成

### Scope
- 只改: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `Caddyfile.example`
- 只做: Docker 打包 + compose 設定 + Caddy reverse proxy 範例
- 層級: infra

### Non-scope
- 不做: 實際部署到 VPS（需 tkman 授權）
- 不做: DNS 設定（手動）
- 不做: SES 域名驗證（手動）

### Environment
- Runtime: docker
- 工作目錄: /Users/tkman/Projects/oq-washinmura

### WORKORDER
1. 建立 `.dockerignore`: node_modules, .env, data/, *.db
2. 建立 `Dockerfile`:
   - FROM oven/bun:1 AS base
   - WORKDIR /app
   - COPY package.json bun.lockb ./
   - RUN bun install --frozen-lockfile --production
   - COPY src/ ./src/
   - RUN mkdir -p /app/data
   - EXPOSE 3100
   - CMD ["bun", "run", "src/index.ts"]
3. 建立 `docker-compose.yml`:
   - service: oq-api
   - build: .
   - ports: "3100:3100"
   - volumes: ./data:/app/data（SQLite 持久化）
   - env_file: .env
   - restart: unless-stopped
4. 建立 `Caddyfile.example`:
   - oq.washinmura.jp → reverse_proxy localhost:3100
   - 自動 HTTPS
5. 建立 `scripts/deploy.sh`:
   - git pull
   - docker compose build --no-cache
   - docker compose up -d
   - curl localhost:3100/health（驗證）

### Implementation Constraints
- 獨立 compose，不加進 washin-api（DD-13）
- data/ 目錄掛 volume，DB 不進 container
- .env 不進版控

### ACCEPTANCE
- [ ] `docker compose build` 成功
- [ ] `docker compose up -d` 啟動 + /health 回 200
- [ ] 停掉容器 → 重啟 → DB 資料還在（volume 持久化）
- [ ] Caddyfile.example 語法正確

### Acceptance Evidence
- `docker compose build` → 成功
- `curl localhost:3100/health` → 200

### Required Checks
- [ ] **測試**: docker build 不報錯
- [ ] **錯誤處理**: deploy.sh 有 set -e + health check

### HITL 需人工處理
- [ ] DNS: 新增 oq.washinmura.jp A record 指向 VPS
- [ ] Caddy: 在 VPS 的 Caddyfile 加入 oq.washinmura.jp 段落
- [ ] SES: 設定 oq.washinmura.jp 寄件域名驗證
- [ ] .env: 在 VPS 建立 .env 填入真實 credentials

### Done Definition
ACCEPTANCE 全勾 + Required Checks 全過 + Commit 帶 CARD-08 = DONE

---

## 追溯總表

| REQ | SPEC | CARD | Executor |
|-----|------|------|----------|
| — | SPEC-09 DB 初始化 | CARD-01 | codex |
| REQ-02 | SPEC-01 + SPEC-02 + SPEC-08 | CARD-02 | codex |
| REQ-01 | SPEC-03 | CARD-03 | codex |
| REQ-04 | SPEC-05 | CARD-04 | codex |
| REQ-03 + REQ-05 | SPEC-04 + SPEC-06 | CARD-05 | codex |
| REQ-06 | SPEC-07 + SPEC-10 | CARD-06 | codex |
| — | SPEC-11 | CARD-07 | codex |
| — | DD-08 部署 | CARD-08 | codex + HITL |
