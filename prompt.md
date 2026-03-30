# AI Token 使用報告 — 提示語

## 使用方式
複製下面整段提示語，貼進 Claude Code，按 Enter。

---

## 提示語

```
幫我產出一份「AI Token 使用報告」，完整流程如下：

🌐 語言：用我現在跟你對話的語言來產出報告（中文→中文、日本語→日本語、English→English）。
模板裡的**所有**標題、標籤、說明文字都要翻譯，包括但不限於：等級名、section 標題（等級/戰績/什麼概念/能力值）、成就名、Power Stats 名、黃仁勳引言。數字和 CSS 不變。
產出 HTML 前 grep 一次：如果目標語言是英文但 HTML 裡還有中文字 → 補翻。

⚠️ 隱私聲明（請先讀完再開始）：
• 本提示語只讀取 token 用量統計（數字），不讀取任何對話內容
• 不會傳送任何資料到外部（除非你主動同意提交到排行榜）
• 不會修改、刪除你的任何檔案
• 所有數據處理都在你的本機完成
• 原始碼公開：https://github.com/sstklen/oq-washinmura

### Step 1：掃描數據
掃描 ~/.claude/projects/*/*.jsonl（只讀最近 30 天修改過的檔案，跳過更舊的以加速掃描）。

⏱ 掃描時間取決於你的數據量：輕度用戶 ~30 秒，重度用戶可能 5-15 分鐘。數據越多代表你用 AI 越多，這是好事！

從每一行 type=assistant 的 message.usage 提取：
- input_tokens
- output_tokens
- cache_creation_input_tokens
- cache_read_input_tokens
- timestamp（用本地時區分天）

按天加總，列出最近 30 天的數據。全部以「月」為單位呈現。

同時掃描工具使用（message.content 裡 type=tool_use 的 block）：
- 統計每種工具的呼叫次數（Bash/Read/Edit/Write/Agent/WebSearch/WebFetch/Grep/Glob 等）
- Bash 指令中包含 "git commit" 的次數 = Git Commits
- Agent 工具呼叫次數 = Agent 派工
- WebSearch + WebFetch = Web 搜尋

### Step 2：計算 API 等值成本
用 Claude Opus 4.6 官方定價（USD）：
- input: $5/M
- output: $25/M
- cache write (1h): $10/M
- cache read: $0.50/M

定價來源：https://platform.claude.com/docs/en/docs/about-claude/pricing

算出 30 天合計的 API 等值費用。

### Step 3：判定等級
根據每日平均 Token 量，判定等級。概念：一個人 + AI = 等於幾人的工程產出。

| 等級 | 每日 Token 量 | 稱號 | 等於 |
|------|-------------|------|------|
| Lv.1 | < 100 萬 | 實習生 Intern | = 0.5 人 |
| Lv.2 | 100 萬 - 1,000 萬 | 獨立開發者 Solo Dev | = 1 人 |
| Lv.3 | 1,000 萬 - 5,000 萬 | 資深工程師 Senior Engineer | = 2-3 人 |
| Lv.4 | 5,000 萬 - 2 億 | 一人公司 One-Person Co. | = 5 人團隊 |
| Lv.5 | 2 億 - 10 億 | 一人科技公司 Solo Tech Co. | = 10 人工程部 |
| Lv.6 | > 10 億 | 矽谷新創規格 SV Startup Tier | = 20+ 人工程部 |

### Step 4：計算黃仁勳月薪
黃仁勳（GTC 2026）公式：Token 預算 = 年薪的 50%
來源：CNBC 2026.03.20 / Tom's Hardware 報導

- 月 Token 消耗（API 等值）= X
- 黃仁勳公式月薪 = X × 2
- 年薪 = 月薪 × 12
- 對比 NVIDIA $500K 工程師的 $20.8K/月 Token 預算 = 幾倍

### Step 5：計算能力值（Power Stats，滿分 99）
- 生產力：根據等級（Lv.1=10, Lv.2=30, Lv.3=50, Lv.4=70, Lv.5=85, Lv.6=99）
- 快取效率：cache_read 佔總 token 的百分比（× 100，上限 99）
- 多模型：檢查 ~/.gemini/ 是否有數據，有=85，沒有=40
- 指令精準：100 - (input_tokens 佔總量的百分比 × 10)，上限 99
- 成本控制：省下的百分比（上限 99）

### Step 6：解鎖成就
檢查是否達成：

🏆 黃仁勳認證 — 月 Token 消耗超過 US$20.8K（NVIDIA 標準）
⚡ 快取大師 — cache_read 佔總量 > 70%（善用快取，不浪費）
🤖 多模型指揮官 — 同時使用 2+ 個 AI 平台（查 ~/.gemini/tmp/*/chats/*.json）
📚 萬卷讀者 — 總 Token 換算超過 10,000 本書（1 token ≈ 0.75 字，1 本書 ≈ 75,000 字）
💰 套利王 — Max 訂閱 vs API 費用省下 > 95%
🔥 不眠不休 — 連續 7 天都有 AI 使用記錄
🎯 精準指揮 — input_tokens 佔總量 < 1%（指令精簡，效率高）

### Step 7：產出 HTML 報告

⚠️ 重要：先用 curl 抓模板再填數據，不要自己從零寫 HTML：
curl -sL https://raw.githubusercontent.com/sstklen/oq-washinmura/main/tkman.html > /tmp/oq-template.html
讀取這個模板，把裡面的**每一個數字**都換成你剛算出來的數據。模板已經是 1280×720 固定尺寸。

⚠️ 模板裡是範例數據（別人的），你必須全部替換，一個不漏：
- hero-num（月 Token 總量）
- Lv 等級 + 稱號
- 日期範圍 + 用戶名
- API 費用 + 訂閱比較 + 省下百分比
- 成本明細表（4 行：上下文初始化/重載/模型生成/用戶指令 的用量+金額）
- 30 天合計金額
- 等級條形圖（你的等級要高亮 hl class）
- Power Stats 5 個數值 + bar 寬度
- 戰績 6 格數字
- 連續使用天數 + 成就數
- 月薪卡（OQ 值 + 年薪 + NVIDIA 倍數）
- 書本換算 + 重度用戶倍數
驗證：替換完後 grep 模板裡的範例數字（如 314億、40,279），確認零殘留。

如果 curl 失敗，才用以下規格從零寫：
產出一個 1280×720 固定尺寸的 HTML，深色科技紫漸層背景，不能滾動，適合截圖分享。

版面結構（左右兩欄）：

左欄（約 460px）：
1. 大標題：月 Token 總數（最大的字）
2. "Tokens / 月" 在大標題右邊同一行
3. Lv.X 等級徽章 + 稱號 + 等於幾人（同一行，字要大）
4. 日期範圍
5. 月 API 費 vs Max 訂閱費（對比框）+ 省下百分比靠右
6. 成就徽章（圓角小藥丸排列）
7. 能力值 Power Stats（五項橫條 + 數字）
8. 連續使用天數（🔥 火焰 + 天數）
9. 黃仁勳引言：「年薪 $500K 的工程師，應配 $250K Token 預算，不用我會非常火大」

右欄：
1. 上方：API 成本明細表
   - 用中文名稱：上下文初始化（載入專案與指令）/ 上下文重載（快取命中，省 10 倍）/ 模型生成（程式碼與分析產出）/ 用戶指令（精簡指令，效率高）
   - 列出用量、單價、金額
2. 下方三欄：
   - 左：等級條形圖（Lv.1~Lv.6，每級有名稱 + 等於幾人的副標）
   - 中：30 天戰績 Battle Record（6 格：Bash 指令、Git Commits、檔案編輯/新建、Agent 派工、Web 搜尋、工具呼叫總計）
   - 右：比喻（本書的文字量、重度用戶倍數）+ 黃仁勳公式月薪卡（最醒目）

設計風格：
- 深色科技紫漸層背景（#0f0c29 → #302b63 → #24243e）
- 重點數字用粉綠漸層（#a8edea → #fed6e3），大字醒目
- 所有小字不低於 12px，顏色不低於 rgba(168,237,234,0.4)
- 格子、卡片要飽滿，字要撐滿框框空間
- 根據數據量自動調整字體大小：數字大的放大、數字小的縮小，確保版面飽滿不空洞
- 戰績格子裡的 icon 和數字要大（icon 24px+，數字 22px+）
- 月薪卡是視覺焦點，數字最大最亮

報告產出後，自動用 `open` 指令在瀏覽器打開 HTML 檔案，不用等我說。

### Step 8：五階 OQ 指紋分析
在產出 HTML 報告的同時，額外計算五階指紋數據（不顯示在報告上，只用於提交）：

**L1 量** — 月 token 總量、日均、等級、API 等值費用（Step 2 已有）
**L2 效** — 快取命中率（cache_read / 總 token）、指令佔比（input / 總 token）
**L3 廣** — 同時專案數（~/.claude/projects/ 資料夾數）、工具種類數、是否有 ~/.gemini/（多模型）、工具呼叫總次數、主要工作時段（早/午/晚/深夜）
**L4 深** — 連續使用天數、活躍天數/30、session 數
**L5 智** — 工作風格（Agent 佔比判定：指揮型/混合型/手做型/平衡型/閱讀型）、系統化操作率（Edit 前有 Read/Grep 的比例）

把五階數據存成 JSON 變數備用（Step 9 提交用）。

### Step 9：提交到 OQ 排行榜
報告產出完畢後，顯示以下訊息：

```
📊 你的 OQ 報告已產出！

想提交到 OQ 排行榜嗎？
• 讓找人方看到你的 AI 能力
• OQ 值越高越容易被聯絡
• 未來會有公司/團隊來找 OQ 高手合作
• 你的 AI 操控力 = 你的市場價值

要提交嗎？（說「好」就開始）
```

用戶說「好」後，執行以下流程：

**9a. 檢查本機是否已有 token**
- 讀 `~/.oq-token`
- 有 → 跳到 9d（自動更新）
- 沒有 → 進入 9b（首次註冊）

**9b. Email 登入**
- 問用戶：「輸入你的 email（用來驗證身份，不會公開）：」
- 用戶輸入 email
- `curl -s -X POST https://oq.washinmura.jp/api/auth/send-code -H "Content-Type: application/json" -d '{"email":"用戶輸入的email"}'`
- 問用戶：「驗證碼已寄到你的信箱，請輸入 6 位數字：」
- 用戶輸入驗證碼
- `curl -s -X POST https://oq.washinmura.jp/api/auth/verify -H "Content-Type: application/json" -d '{"email":"...","code":"..."}'`
- 取得 session token

**9c. 設定公開身份 + 提交**
- 問用戶：「排行榜上要顯示什麼名字？（本名、暱稱、江湖名都行）：」
- 問用戶：「要讓找人方能聯絡你嗎？（開啟 = 公司/團隊找得到你，關閉 = 只上榜不被打擾）」
- 設定顯示名 + 可被聯絡：
  `curl -s -X PUT https://oq.washinmura.jp/api/oq/settings -H "Authorization: Bearer {token}" -H "Content-Type: application/json" -d '{"display_name":"...","contactable":true}'`
- 提交 OQ 數據（含五階指紋）：
  `curl -s -X POST https://oq.washinmura.jp/api/oq/submit -H "Authorization: Bearer {token}" -H "Content-Type: application/json" -d '{"oq_value":...,"tokens_monthly":...,"api_cost_monthly":...,"battle_record":{...},"fingerprint":{...}}'`
- 取得 oq_token，存到 `~/.oq-token`
- 顯示：「✅ 提交成功！你的 OQ: $X | Lv.Y | 排行榜: https://oq.washinmura.jp」

**9d. 自動更新（有 oq_token 時）**
- 讀 `~/.oq-token`
- `curl -s -X PUT https://oq.washinmura.jp/api/oq/update -H "Content-Type: application/json" -d '{"oq_token":"...","oq_value":...,"tokens_monthly":...,"api_cost_monthly":...,"battle_record":{...},"fingerprint":{...}}'`
- 顯示：「✅ 已更新！你的 OQ: $X | Lv.Y」

### 附錄：數據來源說明
此腳本僅讀取本機 ~/.claude/ 目錄下的 token 用量統計（API 計費欄位），
不會讀取對話內容。提交到 OQ 排行榜的資料僅包含統計數字（token 量、工具次數、時間戳分布），不含任何對話文字。
所有定價來自 Anthropic 官方文件（platform.claude.com/docs/en/docs/about-claude/pricing）。
黃仁勳公式來自 GTC 2026（2026.03, CNBC/Tom's Hardware 報導）。
```

---

## 驗證用 Python（獨立跑，不需要 Claude Code）

```bash
python3 -c "
import json,glob,os
from collections import defaultdict
from datetime import datetime,timezone,timedelta
JST=timezone(timedelta(hours=9))
days=defaultdict(lambda:{'t':0,'i':0,'o':0,'cw':0,'cr':0})
for f in glob.glob(os.path.expanduser('~/.claude/projects/*/*.jsonl')):
  for line in open(f):
    try:
      d=json.loads(line)
      if d.get('type')!='assistant':continue
      u=d.get('message',{}).get('usage',{})
      if not u:continue
      ts=d.get('timestamp','')
      if not ts:continue
      day=datetime.fromisoformat(ts.replace('Z','+00:00')).astimezone(JST).strftime('%Y-%m-%d')
      days[day]['t']+=1
      days[day]['i']+=u.get('input_tokens',0)
      days[day]['o']+=u.get('output_tokens',0)
      days[day]['cw']+=u.get('cache_creation_input_tokens',0)
      days[day]['cr']+=u.get('cache_read_input_tokens',0)
    except:pass
for d in sorted(days)[-7:]:
  v=days[d];total=v['i']+v['o']+v['cw']+v['cr']
  cost=v['i']*5/1e6+v['o']*25/1e6+v['cw']*10/1e6+v['cr']*0.5/1e6
  print(f\"{d} | {v['t']:>5} turns | {total:>14,} tokens | \${cost:>8,.0f} API cost\")
"
```

## 備註

- 任何 Claude Code 用戶都能用，不需要額外安裝
- 數據來源是 Anthropic API 回傳的精確計費欄位
- 如果有用 Gemini CLI，腳本會自動偵測 ~/.gemini/ 並加入統計
- 此腳本僅讀取本機 token 統計，不讀取對話內容，不傳送資料
- 等級和成就可以自行擴充
