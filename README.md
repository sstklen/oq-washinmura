# OQ — AI 時代的競爭力指標

**[🌐 oq.washinmura.jp](https://oq.washinmura.jp)**

> 你操控 AI 的能力，就是你在新時代的價值。

[中文](#中文) · [English](#english) · [日本語](#日本語)

---

## 中文

### OQ 是什麼？

**OQ（Operational Quotient）** 衡量你操控 AI 的能力。

公式：`OQ = 月 Token 費 × 2`（黃仁勳 GTC 2026）

### 怎麼算？

1. 複製[提示語](https://oq.washinmura.jp)
2. 貼進 Claude Code
3. AI 自動掃描你的 token 使用紀錄，產出報告
4. 你決定要不要提交到排行榜

### OQ 等級

| 等級 | 每日 Token | 稱號 | 等於 |
|------|-----------|------|------|
| Lv.1 | < 100 萬 | 實習生 | 0.5 人 |
| Lv.2 | 100 萬 ~ 1,000 萬 | 獨立開發者 | 1 人 |
| Lv.3 | 1,000 萬 ~ 5,000 萬 | 資深工程師 | 2-3 人 |
| Lv.4 | 5,000 萬 ~ 2 億 | 一人公司 | 5 人團隊 |
| Lv.5 | 2 億 ~ 10 億 | 一人科技公司 | 10 人工程部 |
| Lv.6 | > 10 億 | 矽谷新創規格 | 20+ 人工程部 |

### 隱私

- 只讀取 token 用量統計（數字），不讀取對話內容
- 不傳送資料到外部（除非你主動同意提交排行榜）
- 不修改、不刪除你的任何檔案
- 原始碼公開在這個 repo

---

## English

### What is OQ?

**OQ (Operational Quotient)** measures your ability to operate AI.

Formula: `OQ = Monthly Token Cost × 2` (Jensen Huang, GTC 2026)

### How to measure yours?

1. Copy the [prompt](https://oq.washinmura.jp)
2. Paste into Claude Code
3. AI scans your token usage and generates a report
4. You decide whether to submit to the leaderboard

### OQ Levels

| Level | Daily Tokens | Title | Equivalent |
|-------|-------------|-------|------------|
| Lv.1 | < 1M | Intern | 0.5 person |
| Lv.2 | 1M ~ 10M | Solo Dev | 1 person |
| Lv.3 | 10M ~ 50M | Senior Engineer | 2-3 people |
| Lv.4 | 50M ~ 200M | One-Person Co. | 5-person team |
| Lv.5 | 200M ~ 1B | Solo Tech Co. | 10-person dept |
| Lv.6 | > 1B | SV Startup Tier | 20+ engineers |

### Privacy

- Only reads token usage stats (numbers), never reads conversation content
- No data sent externally unless you explicitly agree to submit to leaderboard
- Does not modify or delete any of your files
- Source code is open in this repo

---

## 日本語

### OQ とは？

**OQ（Operational Quotient）** はAIを操る能力を測る指標です。

公式：`OQ = 月間Token費 × 2`（ジェンセン・ファン GTC 2026）

### 測定方法

1. [プロンプト](https://oq.washinmura.jp)をコピー
2. Claude Codeに貼り付け
3. AIが自動的にトークン使用量をスキャンしてレポートを作成
4. ランキングに提出するかはあなた次第

### OQ レベル

| レベル | 日次Token量 | 称号 | 相当 |
|--------|-----------|------|------|
| Lv.1 | < 100万 | インターン | 0.5人分 |
| Lv.2 | 100万 ~ 1,000万 | ソロ開発者 | 1人分 |
| Lv.3 | 1,000万 ~ 5,000万 | シニアエンジニア | 2-3人分 |
| Lv.4 | 5,000万 ~ 2億 | 一人会社 | 5人チーム |
| Lv.5 | 2億 ~ 10億 | 一人テック企業 | 10人エンジニア部 |
| Lv.6 | > 10億 | シリコンバレー級 | 20人以上 |

### プライバシー

- トークン使用量の統計（数値）のみ読み取り、会話内容は読みません
- 明示的に同意しない限り、外部にデータを送信しません
- ファイルの変更・削除は一切行いません
- ソースコードはこのリポジトリで公開

---

## Tech Stack

Bun + Hono + SQLite · Docker + Caddy · 84 tests / 0 fail

## License

MIT
