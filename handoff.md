# 交接文件
> 日期：2026-03-31 | 摘要：OQ 平台從零到上線 — 後端 API + 網站 + 報告模板 + Email + 病毒分享

## 已完成
- [x] 後端 API 8 張卡全部完成 — 84 tests / 0 fail，部署到 oq.washinmura.jp
- [x] Auth（email 驗證碼登入 + JWT）、OQ 提交/更新、排行榜、個人設定、媒合聯絡
- [x] 兩輪 Code Review — 修了 11 個問題（含 Critical IDOR 漏洞）
- [x] Resend Email 整合 — 驗證碼能寄到信箱（寄件人暫用 onboarding@resend.dev）
- [x] 五階指紋分析器 — scripts/oq-fingerprint.ts，跑你的資料出完整報告
- [x] DB 加 fingerprint 欄位 — submit/update 都能收五階指紋
- [x] 網站首頁（白底 B 版）— 三語切換（中/英/日）、完整提示語可捲動
- [x] 報告模板 tkman.html — 內建上傳流程（email→驗證碼→暱稱→打勾→提交）
- [x] 報告自動彈出上傳/更新確認（有 token 自動更新，沒有走首次流程）
- [x] 病毒分享 — X/LinkedIn/複製挑戰，先分享再上傳，每頁都有分享入口
- [x] OQ 起源故事頁 /story — 完整文章 + 第二則提示語 + #MyOQStory 分享
- [x] GitHub README 三語 + repo 描述 + 首頁連結

## 進行中
- [ ] Resend 域名驗證 — 要在 resend.com 加 oq.washinmura.jp 域名，設 DNS，改 .env 寄件人
- [ ] 提示語 v3（12 維 OQ 指紋）— 派工單在 ~/Projects/tkoq/docs/WORKORDER-OQ-PLATFORM.md
- [ ] OQ 從 Operational Quotient 進化到 Orchestration Quotient（統御商數）— 網站文案要統一

## 已知問題
- 報告模板用你的真實數據當範例，AI 如果沒替換完會跟你一樣（提示語已加 grep 驗證）
- rate limit 的 too_many_attempts vs rate_limit 錯誤碼不一致（SPEC 寫 too_many_attempts，實作回 rate_limit）
- defaultLimiter 寫了但沒掛到任何路由（登入後的端點沒有 per-user 限速）
- tsc --noEmit 不通過（tsconfig 型別設定問題，runtime 正常）
- 首頁語言切換只切了有 data-i18n 的元素，等級表內容沒翻

## 下一步（按優先順序）
1. Resend 域名驗證：到 resend.com/domains 加 oq.washinmura.jp → 拿 DNS 記錄 → 加到 Cloudflare → 驗證後改 VPS .env 的 OQ_RESEND_FROM
2. 讀派工單 `cat ~/Projects/tkoq/docs/WORKORDER-OQ-PLATFORM.md` — 12 維 OQ 指紋 + 匹配 API
3. 讀 session log `cat ~/Projects/tkoq/memory/session-log.md` — 完整決策記錄
4. opus-loop 從 Phase R.5 開始（派工單已有 REQ-01~04）

## 關鍵檔案位置
- 後端代碼：~/Projects/oq-washinmura/src/
- 網站靜態檔（VPS）：/srv/oq/
- Docker：~/Projects/oq-washinmura/docker-compose.yml（port 3300）
- Caddy：在 washin-api_default network，用容器名 oq-api
- 派工單：~/Projects/tkoq/docs/WORKORDER-OQ-PLATFORM.md
- OQ 提示語 v3：~/Desktop/OQ-analysis-tool.txt
