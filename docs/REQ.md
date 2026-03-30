# 需求書: OQ 平台後端

## Decision Log
| ID | 問題 | 決定 | 原因 |
|----|------|------|------|
| D-01 | 掛 washin-api 還是獨立？ | 獨立微服務 | 乾淨、不影響主站 |
| D-02 | 登入方式？ | Email 登入（兩邊都要） | 簡單、不用 OAuth |
| D-03 | OQ 持有人顯示名？ | 自訂（本名/暱稱/江湖名都行） | 自由度最高 |
| D-04 | 收費？ | 不收，先養平台 | tkman 決定 |
| D-05 | 媒合流程？ | 找人方登入後點聯絡 → 系統發 email | 最簡單的 MVP |
| D-06 | OQ Token 怎麼綁？ | Email 登入後自動綁定 | 一人一 token |
| D-07 | 技術棧？ | Bun + Hono + SQLite | 跟現有專案一致 |
| D-08 | 部署？ | Docker + Caddy reverse proxy | 跟現有架構一致 |

## REQ-01: OQ 提交
- 背景: 用戶跑完提示語拿到 OQ 值，需要地方提交
- 使用者: Claude Code 用戶
- 情境: 跑完提示語 → 到 oq.washinmura.jp 提交 → 或用 API curl 提交
- 成功條件: 提交後排行榜即時出現、拿到 oq_token
- 非目標: 不驗證 OQ 值真假（信任制）
- 驗收標準: POST /api/submit → 201 + oq_token 回傳 + 排行榜可見

## REQ-02: Email 登入
- 背景: 兩種角色都需要登入
- 使用者: OQ 持有人 + 找人方
- 情境: 輸入 email → 收驗證碼 → 登入
- 成功條件: 登入後拿到 session token
- 非目標: 不做 OAuth、不做密碼
- 驗收標準: POST /api/auth/send-code → 200 + email 收到碼 / POST /api/auth/verify → 200 + session token

## REQ-03: OQ 更新
- 背景: 用戶的 OQ 會隨時間變動（滾動 30 天）
- 使用者: OQ 持有人
- 情境: 重跑提示語 → 用 oq_token 或登入後更新
- 成功條件: 排行榜即時更新
- 非目標: 不做自動排程更新
- 驗收標準: PUT /api/oq/update → 200 + 排行榜新值

## REQ-04: 排行榜
- 背景: 公開展示所有 OQ 持有人，吸引找人方
- 使用者: 所有人（不用登入就能看）
- 情境: 打開 oq.washinmura.jp → 看到排行榜
- 成功條件: 按 OQ 值降序、顯示自訂名 + 等級 + OQ 值
- 非目標: 不顯示 email
- 篩選: OQ 範圍（min-max）、等級（Lv.1-6）
- 驗收標準: GET /api/leaderboard?min=50000&level=5 → 200 + 正確篩選結果

## REQ-05: 個人設定
- 背景: OQ 持有人控制自己的公開資訊
- 使用者: OQ 持有人（登入後）
- 設定項:
  - 顯示名（自訂，本名/暱稱/江湖名）
  - 可被聯絡（開/關）
- 成功條件: 改設定後排行榜即時反映
- 驗收標準: PUT /api/oq/settings → 200 + 排行榜更新

## REQ-06: 媒合聯絡
- 背景: 找人方看到 OQ 高的人想聯絡
- 使用者: 找人方（必須登入）
- 情境: 登入 → 排行榜 → 點「聯絡」→ 寫訊息 → 系統發 email 給 OQ 持有人
- 前提: OQ 持有人的「可被聯絡」= 開
- 成功條件: OQ 持有人收到 email（含找人方的訊息 + email）
- 非目標: 不做站內信、不做即時聊天
- 驗收標準: POST /api/contact/{oq_id} → 200 + OQ 持有人收到 email

## API 端點總表
```
POST /api/auth/send-code    — 發送驗證碼
POST /api/auth/verify       — 驗證碼登入 → session token
GET  /api/leaderboard       — 排行榜（公開，可篩選）
POST /api/oq/submit         — 提交 OQ（登入後）→ oq_token
PUT  /api/oq/update         — 更新 OQ（oq_token 或登入）
PUT  /api/oq/settings       — 個人設定（登入後）
POST /api/contact/{oq_id}   — 聯絡 OQ 持有人（登入後）
```

## DB Schema（草案）
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,          -- 自訂顯示名
  role TEXT DEFAULT 'oq',     -- 'oq' | 'seeker' | 'both'
  created_at TEXT,
  last_login_at TEXT
);

CREATE TABLE oq_profiles (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  oq_value INTEGER NOT NULL,  -- OQ 值（美元）
  oq_token TEXT UNIQUE,       -- 更新密鑰
  level INTEGER,              -- 1-6
  contactable INTEGER DEFAULT 1,  -- 可被聯絡
  tokens_monthly INTEGER,     -- 月 token 數
  api_cost_monthly REAL,      -- 月 API 費
  battle_record TEXT,         -- JSON: {bash, commits, edits, agents, web, total}
  updated_at TEXT
);

CREATE TABLE auth_codes (
  email TEXT, code TEXT, expires_at TEXT
);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  from_user_id INTEGER REFERENCES users(id),
  to_oq_id INTEGER REFERENCES oq_profiles(id),
  message TEXT,
  sent_at TEXT
);
```
