# 測試規格書: OQ 平台後端

## 追溯表

| REQ | SPEC | TC 數量 | 覆蓋狀態 |
|-----|------|---------|---------|
| REQ-02 | SPEC-01 發送驗證碼 | 6 | ✅ 5 類都有 |
| REQ-02 | SPEC-02 驗證碼登入 | 6 | ✅ 5 類都有 |
| REQ-01 | SPEC-03 OQ 提交 | 6 | ✅ 5 類都有 |
| REQ-03 | SPEC-04 OQ 更新 | 6 | ✅ 5 類都有 |
| REQ-04 | SPEC-05 排行榜 | 6 | ✅ 5 類都有 |
| REQ-05 | SPEC-06 個人設定 | 6 | ✅ 5 類都有 |
| REQ-06 | SPEC-07 媒合聯絡 | 7 | ✅ 5 類都有 |
| — | SPEC-08 Session Token | 5 | ✅ 5 類都有 |
| — | SPEC-09 DB 初始化 | 5 | ✅ 5 類都有 |
| — | SPEC-10 Email 發送 | 5 | ✅ 5 類都有 |
| — | SPEC-11 安全與限速 | 6 | ✅ 5 類都有 |

---

## SPEC-01: 發送驗證碼

### TC-0101: 正常路徑 — 有效 email 發送驗證碼
- 前置條件: DB 空，email 服務正常（mock）
- 操作: `POST /api/auth/send-code { "email": "test@example.com" }`
- 預期結果: 200 `{ "ok": true }` + auth_codes 表有一筆 email=test@example.com + code 為 6 位數字 + expires_at = now + 10 分鐘 + email mock 被呼叫一次
- 優先級: P1

### TC-0102: 錯誤路徑 — email 格式不合法
- 前置條件: 無
- 操作: `POST /api/auth/send-code { "email": "not-an-email" }`
- 預期結果: 400 `{ "error": "invalid_email" }` + auth_codes 表無新增 + email mock 未被呼叫
- 優先級: P1

### TC-0103: 邊界案例 — email 大小寫 + 前後空白正規化
- 前置條件: DB 空
- 操作: `POST /api/auth/send-code { "email": "  TkMan@Example.COM  " }`
- 預期結果: 200 + auth_codes.email = `tkman@example.com`（lowercase + trim）
- 優先級: P2

### TC-0104: 邊界案例 — 舊驗證碼被覆蓋
- 前置條件: auth_codes 已有 email=test@example.com 的舊碼 `111111`
- 操作: `POST /api/auth/send-code { "email": "test@example.com" }`
- 預期結果: 200 + auth_codes 只剩一筆新碼（舊碼 111111 已刪）
- 優先級: P1

### TC-0105: 壓力情境 — 60 秒內重複請求被限速
- 前置條件: 剛成功發送一次驗證碼
- 操作: 立刻再 `POST /api/auth/send-code { "email": "test@example.com" }`
- 預期結果: 429 `{ "error": "rate_limit", "retry_after": N }` + N > 0 + 不發新碼
- 優先級: P1

### TC-0106: 安全情境 — 不存在的 email 也回 200
- 前置條件: users 表無 never@exist.com
- 操作: `POST /api/auth/send-code { "email": "never@exist.com" }`
- 預期結果: 200 `{ "ok": true }`（不洩漏此 email 是否已註冊）+ auth_codes 有新碼 + email mock 被呼叫
- 優先級: P1

---

## SPEC-02: 驗證碼登入

### TC-0201: 正常路徑 — 新用戶驗證碼正確 → 自動建 user
- 前置條件: auth_codes 有 email=new@test.com, code=123456, 未過期 + users 表無此 email
- 操作: `POST /api/auth/verify { "email": "new@test.com", "code": "123456" }`
- 預期結果: 200 + body 含 token（JWT 格式）+ user.id > 0 + user.role = "oq" + users 表新增一筆 + auth_codes 該碼已刪
- 優先級: P1

### TC-0202: 正常路徑 — 舊用戶登入更新 last_login_at
- 前置條件: users 有 email=old@test.com（last_login_at = 昨天）+ auth_codes 有正確碼
- 操作: `POST /api/auth/verify { "email": "old@test.com", "code": "654321" }`
- 預期結果: 200 + token + users.last_login_at 更新為今天
- 優先級: P1

### TC-0203: 錯誤路徑 — 驗證碼錯誤
- 前置條件: auth_codes 有 email=test@x.com, code=111111
- 操作: `POST /api/auth/verify { "email": "test@x.com", "code": "000000" }`
- 預期結果: 401 `{ "error": "invalid_code" }` + 不建 user + 不發 token
- 優先級: P1

### TC-0204: 錯誤路徑 — 驗證碼過期
- 前置條件: auth_codes 有 email=test@x.com, code=111111, expires_at = 11 分鐘前
- 操作: `POST /api/auth/verify { "email": "test@x.com", "code": "111111" }`
- 預期結果: 401 `{ "error": "code_expired" }`
- 優先級: P1

### TC-0205: 壓力情境 — 10 分鐘內連錯 5 次 → 鎖定
- 前置條件: auth_codes 有正確碼
- 操作: 連續 5 次送錯碼，第 6 次送正確碼
- 預期結果: 前 5 次 401 + 第 6 次 429 `{ "error": "too_many_attempts", "retry_after": 600 }` + 正確碼也不放行
- 優先級: P1

### TC-0206: 安全情境 — code 非 6 位數字直接拒絕
- 前置條件: 無
- 操作: `POST /api/auth/verify { "email": "test@x.com", "code": "abc" }`
- 預期結果: 401（不查 DB）
- 優先級: P2

---

## SPEC-03: OQ 提交

### TC-0301: 正常路徑 — 完整資料提交成功
- 前置條件: 已登入用戶（有 token）+ 無 oq_profiles 記錄
- 操作: `POST /api/oq/submit` + Authorization header + body: `{ "oq_value": 85200, "tokens_monthly": 892000000, "api_cost_monthly": 3550.00, "battle_record": { "bash": 12450, "commits": 340, "edits": 5600, "agents": 890, "web": 320, "total": 19600 } }`
- 預期結果: 201 + body 含 oq_token（格式 `oq_` 開頭）+ profile.level = 5（日均 892M/30 ≈ 29.7M → Lv.3…等等，892000000/30 ≈ 29,733,333 → Lv.3）+ oq_profiles 表新增一筆
- 優先級: P1

### TC-0302: 錯誤路徑 — 重複提交
- 前置條件: 已登入 + oq_profiles 已有此 user 的記錄
- 操作: `POST /api/oq/submit` + 完整 body
- 預期結果: 409 `{ "error": "already_submitted", "hint": "use PUT /api/oq/update" }`
- 優先級: P1

### TC-0303: 錯誤路徑 — 未登入
- 前置條件: 無 Authorization header
- 操作: `POST /api/oq/submit { "oq_value": 1000 }`
- 預期結果: 401 `{ "error": "unauthorized" }`
- 優先級: P1

### TC-0304: 邊界案例 — 等級計算邊界值
- 前置條件: 已登入 + 無 oq_profiles
- 操作: 分別提交 tokens_monthly = 0 / 29,999,999 / 30,000,000 / 149,999,999 / 150,000,000 / 1,500,000,000 / 5,999,999,999 / 6,000,000,000 / 30,000,000,000 / 30,000,000,001
- 預期結果: 對照等級表 — 日均 < 1M → Lv.1 / 1M~10M → Lv.2 / 10M~50M → Lv.3 / 50M~200M → Lv.4 / 200M~1B → Lv.5 / > 1B → Lv.6
- 優先級: P1

### TC-0305: 壓力情境 — battle_record 為 null
- 前置條件: 已登入 + 無 oq_profiles
- 操作: `POST /api/oq/submit { "oq_value": 500, "tokens_monthly": 0 }`（無 battle_record）
- 預期結果: 201 + level = 1 + battle_record = null
- 優先級: P2

### TC-0306: 安全情境 — oq_value 注入嘗試
- 前置條件: 已登入
- 操作: `POST /api/oq/submit { "oq_value": "DROP TABLE users", "tokens_monthly": 0 }`
- 預期結果: 400 `{ "error": "invalid_oq_value" }` + DB 無變動
- 優先級: P1

---

## SPEC-04: OQ 更新

### TC-0401: 正常路徑 — 用 oq_token 更新
- 前置條件: oq_profiles 有 oq_token = "oq_abc123", oq_value = 50000
- 操作: `PUT /api/oq/update { "oq_token": "oq_abc123", "oq_value": 92000, "tokens_monthly": 1200000000 }`
- 預期結果: 200 + profile.oq_value = 92000 + level 重算 + updated_at 更新
- 優先級: P1

### TC-0402: 正常路徑 — 用 session token 更新
- 前置條件: 已登入 + 有 oq_profiles
- 操作: `PUT /api/oq/update` + Authorization header + `{ "oq_value": 92000 }`
- 預期結果: 200 + oq_value 更新
- 優先級: P1

### TC-0403: 錯誤路徑 — oq_token 不存在
- 前置條件: 無
- 操作: `PUT /api/oq/update { "oq_token": "oq_nonexistent", "oq_value": 1000 }`
- 預期結果: 404 `{ "error": "oq_not_found" }`
- 優先級: P1

### TC-0404: 邊界案例 — 部分更新（只傳 oq_value）
- 前置條件: oq_profiles 有完整記錄（tokens_monthly = 500M, battle_record = {...}）
- 操作: `PUT /api/oq/update { "oq_token": "oq_abc123", "oq_value": 60000 }`
- 預期結果: 200 + oq_value = 60000 + tokens_monthly 不變 = 500M + battle_record 不變
- 優先級: P2

### TC-0405: 壓力情境 — 同時傳 session token + oq_token
- 前置條件: 已登入 user_id=1 + body 含 oq_token 屬於 user_id=2
- 操作: `PUT /api/oq/update` + Authorization（user 1）+ `{ "oq_token": "oq_user2", "oq_value": 999 }`
- 預期結果: 200 + 更新的是 user 1 的 profile（session token 優先）
- 優先級: P2

### TC-0406: 安全情境 — 無任何認證
- 前置條件: 無
- 操作: `PUT /api/oq/update { "oq_value": 99999 }`
- 預期結果: 401 `{ "error": "unauthorized" }`
- 優先級: P1

---

## SPEC-05: 排行榜

### TC-0501: 正常路徑 — 無篩選取全部
- 前置條件: oq_profiles 有 3 筆資料（oq_value = 90000, 50000, 30000）
- 操作: `GET /api/leaderboard`
- 預期結果: 200 + leaderboard 陣列長度 3 + 按 oq_value DESC 排序（90000, 50000, 30000）+ 每筆有 oq_id, display_name, oq_value, level, level_title + 無 email 欄位 + pagination.total = 3
- 優先級: P1

### TC-0502: 正常路徑 — 篩選 level + min
- 前置條件: oq_profiles 有 Lv.3/4/5/6 各一筆
- 操作: `GET /api/leaderboard?level=5,6&min=80000`
- 預期結果: 200 + 只回 Lv.5 和 Lv.6 且 oq_value ≥ 80000 的筆數
- 優先級: P1

### TC-0503: 錯誤路徑 — min > max
- 前置條件: 無
- 操作: `GET /api/leaderboard?min=100000&max=50000`
- 預期結果: 400 `{ "error": "invalid_range" }`
- 優先級: P2

### TC-0504: 邊界案例 — 空結果
- 前置條件: oq_profiles 全部 oq_value < 10000
- 操作: `GET /api/leaderboard?min=999999999`
- 預期結果: 200 `{ "leaderboard": [], "pagination": { "total": 0, "page": 1, ... } }`
- 優先級: P2

### TC-0505: 邊界案例 — display_name 為 null 顯示 Anonymous
- 前置條件: oq_profiles 有一筆，user.display_name = null
- 操作: `GET /api/leaderboard`
- 預期結果: 200 + 該筆 display_name = "Anonymous"
- 優先級: P2

### TC-0506: 安全情境 — 不洩漏 email
- 前置條件: oq_profiles + users 有資料
- 操作: `GET /api/leaderboard`
- 預期結果: 200 + 回傳 JSON 整體（stringify）不含任何 `@` 符號（確保 email 沒混進去）
- 優先級: P1

---

## SPEC-06: 個人設定

### TC-0601: 正常路徑 — 更新 display_name
- 前置條件: 已登入 + 有 oq_profiles
- 操作: `PUT /api/oq/settings { "display_name": "和心村CTO" }`
- 預期結果: 200 + settings.display_name = "和心村CTO" + 排行榜查回來也是 "和心村CTO"
- 優先級: P1

### TC-0602: 正常路徑 — 關閉可被聯絡
- 前置條件: 已登入 + oq_profiles.contactable = 1
- 操作: `PUT /api/oq/settings { "contactable": false }`
- 預期結果: 200 + contactable = false + display_name 不變
- 優先級: P1

### TC-0603: 錯誤路徑 — display_name 太長
- 前置條件: 已登入
- 操作: `PUT /api/oq/settings { "display_name": "a]重複31次以上" }`（>30 字）
- 預期結果: 400 `{ "error": "display_name_too_long", "max": 30 }`
- 優先級: P1

### TC-0604: 邊界案例 — body 為空
- 前置條件: 已登入
- 操作: `PUT /api/oq/settings {}`
- 預期結果: 400 `{ "error": "no_fields" }`
- 優先級: P2

### TC-0605: 壓力情境 — 快速連續更新 10 次
- 前置條件: 已登入
- 操作: 連續 10 次 `PUT /api/oq/settings { "display_name": "name_1" }` ... `{ "display_name": "name_10" }`
- 預期結果: 全部 200 + 最終值 = "name_10" + DB 一致
- 優先級: P2

### TC-0606: 安全情境 — XSS 注入 display_name
- 前置條件: 已登入
- 操作: `PUT /api/oq/settings { "display_name": "<script>alert(1)</script>" }`
- 預期結果: 400 `{ "error": "display_name_invalid" }` + DB 無變動
- 優先級: P1

---

## SPEC-07: 媒合聯絡

### TC-0701: 正常路徑 — 成功發送聯絡
- 前置條件: 已登入（user A）+ oq_profiles id=3 的 contactable=1 + email mock 正常
- 操作: `POST /api/contact/3 { "message": "想合作" }`
- 預期結果: 200 `{ "ok": true, "message": "已發送聯絡信" }` + contacts 表新增一筆（from_user_id = A, to_oq_id = 3）+ email mock 被呼叫，收件人 = oq_id=3 的 user email，內容含 "想合作" + user A 的 email
- 優先級: P1

### TC-0702: 錯誤路徑 — 對方關閉聯絡
- 前置條件: 已登入 + oq_profiles id=3 的 contactable=0
- 操作: `POST /api/contact/3 { "message": "想合作" }`
- 預期結果: 403 `{ "error": "not_contactable" }` + contacts 無新增 + email 未發
- 優先級: P1

### TC-0703: 錯誤路徑 — oq_id 不存在
- 前置條件: 已登入 + 無 oq_profiles id=999
- 操作: `POST /api/contact/999 { "message": "hello" }`
- 預期結果: 404 `{ "error": "oq_not_found" }`
- 優先級: P1

### TC-0704: 錯誤路徑 — 自己聯絡自己
- 前置條件: 已登入（user A）+ user A 有 oq_profiles id=1
- 操作: `POST /api/contact/1 { "message": "自言自語" }`
- 預期結果: 400 `{ "error": "cannot_contact_self" }`
- 優先級: P2

### TC-0705: 邊界案例 — 訊息超過 2000 字
- 前置條件: 已登入 + 對方 contactable=1
- 操作: `POST /api/contact/3 { "message": "a重複2001次" }`
- 預期結果: 400 `{ "error": "message_too_long", "max": 2000 }`
- 優先級: P2

### TC-0706: 壓力情境 — 24 小時內第 4 次聯絡同一人
- 前置條件: 已登入 + contacts 表已有 3 筆（同一 from → to，24h 內）
- 操作: `POST /api/contact/3 { "message": "第四次" }`
- 預期結果: 429 `{ "error": "contact_rate_limit" }`
- 優先級: P1

### TC-0707: 安全情境 — message 含 HTML 被純文字化
- 前置條件: 已登入 + 對方 contactable=1
- 操作: `POST /api/contact/3 { "message": "<b>粗體</b><script>evil()</script>正常文字" }`
- 預期結果: 200 + contacts.message = "粗體正常文字"（HTML 被 strip）+ email 內容也是純文字
- 優先級: P1

---

## SPEC-08: Session Token

### TC-0801: 正常路徑 — 有效 token 通過驗證
- 前置條件: 用 SPEC-02 取得的 token
- 操作: 任意需登入 API + `Authorization: Bearer {token}`
- 預期結果: 不回 401，正常進入業務邏輯
- 優先級: P1

### TC-0802: 錯誤路徑 — 過期 token
- 前置條件: 簽發一個 exp = 過去時間的 JWT
- 操作: `PUT /api/oq/settings` + 過期 token
- 預期結果: 401 `{ "error": "unauthorized" }`（不洩漏「是過期」還是「格式錯」）
- 優先級: P1

### TC-0803: 錯誤路徑 — 簽名錯誤的 JWT
- 前置條件: 用錯誤 secret 簽的 JWT
- 操作: 任意需登入 API + 偽造 token
- 預期結果: 401 `{ "error": "unauthorized" }`
- 優先級: P1

### TC-0804: 邊界案例 — Authorization header 格式錯誤
- 前置條件: 無
- 操作: 帶 `Authorization: Basic xxx` 或 `Authorization: Bearer`（空 token）
- 預期結果: 401
- 優先級: P2

### TC-0805: 安全情境 — JWT payload 竄改
- 前置條件: 有效 JWT，手動改 payload 的 user_id
- 操作: 用竄改後的 JWT 呼叫 API
- 預期結果: 401（簽名驗證失敗）
- 優先級: P1

---

## SPEC-09: DB 初始化

### TC-0901: 正常路徑 — 從零建庫
- 前置條件: 無 SQLite 檔案
- 操作: 呼叫 `getDb()`
- 預期結果: 建立 users / oq_profiles / auth_codes / contacts 四張表 + 所有索引 + PRAGMA journal_mode=WAL + PRAGMA foreign_keys=ON
- 優先級: P1

### TC-0902: 正常路徑 — 重複呼叫不 crash
- 前置條件: 已建好 DB
- 操作: 再次呼叫 `getDb()`
- 預期結果: 不報錯（CREATE TABLE IF NOT EXISTS）+ 資料完好
- 優先級: P1

### TC-0903: 邊界案例 — 所有 DEFAULT 值正確
- 前置條件: 新建 DB
- 操作: INSERT users 只帶 email → 讀回
- 預期結果: created_at 有值 + last_login_at 有值 + role = 'oq'
- 優先級: P2

### TC-0904: 壓力情境 — 用 :memory: 跑完整流程
- 前置條件: getDb(':memory:')
- 操作: 走完 auth → submit → update → leaderboard → contact 全流程
- 預期結果: 全部成功，無 foreign key 錯誤
- 優先級: P1

### TC-0905: 安全情境 — foreign key 約束生效
- 前置條件: 新 DB + PRAGMA foreign_keys=ON
- 操作: INSERT oq_profiles 帶不存在的 user_id
- 預期結果: 報 foreign key constraint 錯誤
- 優先級: P1

---

## SPEC-10: Email 發送

### TC-1001: 正常路徑 — 驗證碼 email 格式正確
- 前置條件: email mock
- 操作: 觸發 sendCode("test@example.com")
- 預期結果: mock 收到 to=test@example.com + subject 含「OQ 驗證碼」+ body 含 6 位數字
- 優先級: P1

### TC-1002: 正常路徑 — 聯絡通知 email 格式正確
- 前置條件: email mock + 聯絡訊息 "想合作" + 寄件人 email "seeker@test.com"
- 操作: 觸發聯絡 email
- 預期結果: mock 收到 subject 含「[OQ] 有人想聯絡你」+ body 含 "想合作" + 含 "seeker@test.com"
- 優先級: P1

### TC-1003: 錯誤路徑 — SES 發送失敗 retry
- 前置條件: email mock 第一次 throw Error, 第二次成功
- 操作: 觸發 sendEmail
- 預期結果: 自動重試一次 → 成功 → mock 被呼叫 2 次
- 優先級: P2

### TC-1004: 錯誤路徑 — SES 連續失敗
- 前置條件: email mock 全部 throw Error
- 操作: 觸發 sendEmail
- 預期結果: 重試 1 次後放棄 → log 有錯誤記錄 → 上層收到 error
- 優先級: P2

### TC-1005: 安全情境 — email 內容不含敏感資訊
- 前置條件: email mock
- 操作: 觸發驗證碼 email
- 預期結果: body 不含 JWT secret / DB 路徑 / 其他系統資訊，只有驗證碼
- 優先級: P1

---

## SPEC-11: 安全與限速

### TC-1101: 正常路徑 — CORS 允許 oq.washinmura.jp
- 前置條件: 伺服器啟動
- 操作: 帶 `Origin: https://oq.washinmura.jp` 的 OPTIONS 請求
- 預期結果: 回傳 Access-Control-Allow-Origin: https://oq.washinmura.jp
- 優先級: P1

### TC-1102: 錯誤路徑 — CORS 拒絕未知 origin
- 前置條件: 伺服器啟動
- 操作: 帶 `Origin: https://evil.com` 的請求
- 預期結果: 不回傳 Access-Control-Allow-Origin 或回傳限制值
- 優先級: P1

### TC-1103: 邊界案例 — limit 超過 100 自動降為 100
- 前置條件: 伺服器啟動
- 操作: `GET /api/leaderboard?limit=999`
- 預期結果: 200 + pagination.limit = 100（不報錯，靜默修正）
- 優先級: P2

### TC-1104: 壓力情境 — 排行榜 IP 限速 60 次/分鐘
- 前置條件: 同一 IP
- 操作: 連續 61 次 `GET /api/leaderboard`
- 預期結果: 前 60 次 200 + 第 61 次 429
- 優先級: P2

### TC-1105: 安全情境 — SQL injection 在 prepared statement 下無效
- 前置條件: 伺服器啟動
- 操作: `GET /api/leaderboard?min=1;DROP TABLE users;--`
- 預期結果: 400 或正常回應（min 解析失敗 → 忽略）+ users 表完好
- 優先級: P1

### TC-1106: 安全情境 — XSS payload 在 display_name 被擋
- 前置條件: 已登入
- 操作: `PUT /api/oq/settings { "display_name": "\"onmouseover=\"alert(1)\"" }`
- 預期結果: 400 `{ "error": "display_name_invalid" }` + DB 無變動
- 優先級: P1
