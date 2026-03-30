/**
 * OQ 五階指紋分析器
 * 從 ~/.claude/ 的 JSONL 提取 AI 使用行為指紋
 * 只讀計量欄位（token 數、工具名、時間戳），不讀對話內容
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const HOME = process.env.HOME || "";
const PROJECTS_DIR = join(HOME, ".claude/projects");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const now = Date.now();
const cutoff = now - THIRTY_DAYS_MS;

// ============ 資料收集 ============

type DayData = { tokens: number; sessions: number; turns: number };
type ToolCall = { name: string; ts: number; };
type BashResult = { success: boolean; ts: number };

const dailyData: Record<string, DayData> = {};
const toolCalls: ToolCall[] = [];
const bashResults: BashResult[] = [];
const projectSet = new Set<string>();
const sessionTimestamps: number[] = [];
let totalInput = 0, totalOutput = 0, totalCacheWrite = 0, totalCacheRead = 0;
let totalTurns = 0;

// 掃描所有 JSONL
const dirs = readdirSync(PROJECTS_DIR);
for (const dir of dirs) {
  const dirPath = join(PROJECTS_DIR, dir);
  let files: string[];
  try { files = readdirSync(dirPath).filter(f => f.endsWith(".jsonl")); } catch { continue; }

  for (const file of files) {
    const lines = readFileSync(join(dirPath, file), "utf-8").split("\n").filter(Boolean);
    let sessionHasRecent = false;

    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        if (d.type !== "assistant") continue;
        const u = d.message?.usage;
        if (!u) continue;
        const ts = d.timestamp ? new Date(d.timestamp).getTime() : 0;
        if (ts < cutoff) continue;

        sessionHasRecent = true;
        const inp = u.input_tokens || 0;
        const out = u.output_tokens || 0;
        const cw = u.cache_creation_input_tokens || 0;
        const cr = u.cache_read_input_tokens || 0;
        totalInput += inp; totalOutput += out; totalCacheWrite += cw; totalCacheRead += cr;
        totalTurns++;
        sessionTimestamps.push(ts);

        const day = new Date(ts).toISOString().slice(0, 10);
        if (!dailyData[day]) dailyData[day] = { tokens: 0, sessions: 0, turns: 0 };
        dailyData[day].tokens += inp + out + cw + cr;
        dailyData[day].turns++;

        // 工具統計
        const content = d.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use") {
              toolCalls.push({ name: block.name || "unknown", ts });
              // Bash 成功/失敗
              if (block.name === "Bash") {
                // 下一行如果是 tool_result 且有 error → 失敗
                // 簡化：有 tool_use 就記一次，成功率後面用 exit code 概估
              }
            }
            if (block.type === "tool_result" && block.tool_use_id) {
              // 追蹤 Bash 結果
              if (block.is_error) {
                bashResults.push({ success: false, ts });
              } else {
                bashResults.push({ success: true, ts });
              }
            }
          }
        }
      } catch {}
    }
    if (sessionHasRecent) {
      projectSet.add(dir);
      const day = Object.keys(dailyData).sort().pop() || "";
      if (day && dailyData[day]) dailyData[day].sessions++;
    }
  }
}

const totalTokens = totalInput + totalOutput + totalCacheWrite + totalCacheRead;
const days = Object.keys(dailyData).sort();
const activeDays = days.length;

// ============ L1 量 ============

const dailyAvg = totalTokens / 30;
function getLevel(daily: number): number {
  if (daily <= 1_000_000) return 1;
  if (daily <= 10_000_000) return 2;
  if (daily <= 50_000_000) return 3;
  if (daily <= 200_000_000) return 4;
  if (daily <= 1_000_000_000) return 5;
  return 6;
}
const level = getLevel(dailyAvg);
const levelTitles: Record<number, string> = {
  1: "實習生 Intern", 2: "獨立開發者 Solo Dev", 3: "資深工程師 Senior Engineer",
  4: "一人公司 One-Person Co.", 5: "一人科技公司 Solo Tech Co.", 6: "矽谷新創規格 SV Startup Tier",
};
const apiCost = totalInput * 5 / 1e6 + totalOutput * 25 / 1e6 + totalCacheWrite * 10 / 1e6 + totalCacheRead * 0.5 / 1e6;
const peakDay = Math.max(...Object.values(dailyData).map(d => d.tokens));

// ============ L2 效 ============

const cacheHitRate = totalTokens > 0 ? totalCacheRead / totalTokens * 100 : 0;
const inputRatio = totalTokens > 0 ? totalInput / totalTokens * 100 : 0;
const bashSuccessCount = bashResults.filter(b => b.success).length;
const bashTotal = bashResults.length;
const bashSuccessRate = bashTotal > 0 ? bashSuccessCount / bashTotal * 100 : 0;

// 效率等級
function efficiencyGrade(cache: number, input: number): string {
  if (cache > 85 && input < 1) return "S — 極致效率";
  if (cache > 70 && input < 3) return "A — 高效";
  if (cache > 50 && input < 5) return "B — 中等";
  if (cache > 30) return "C — 待改善";
  return "D — 初學者模式";
}

// ============ L3 廣 ============

const toolCountMap: Record<string, number> = {};
for (const tc of toolCalls) {
  toolCountMap[tc.name] = (toolCountMap[tc.name] || 0) + 1;
}
const uniqueTools = Object.keys(toolCountMap).length;
const totalToolCalls = Object.values(toolCountMap).reduce((a, b) => a + b, 0);
const hasGemini = existsSync(join(HOME, ".gemini"));

// 時段分布
const hourBuckets = [0, 0, 0, 0]; // 早6-12, 午12-18, 晚18-24, 深夜0-6
for (const ts of sessionTimestamps) {
  const h = new Date(ts).getHours();
  if (h >= 6 && h < 12) hourBuckets[0]++;
  else if (h >= 12 && h < 18) hourBuckets[1]++;
  else if (h >= 18) hourBuckets[2]++;
  else hourBuckets[3]++;
}
const periodNames = ["早間(6-12)", "午間(12-18)", "晚間(18-24)", "深夜(0-6)"];
const primaryPeriod = periodNames[hourBuckets.indexOf(Math.max(...hourBuckets))];
const hourTotal = hourBuckets.reduce((a, b) => a + b, 0);

// ============ L4 深 ============

// 連續天數
let maxStreak = 0, currentStreak = 0;
const daySet = new Set(days);
const startDate = new Date(cutoff);
for (let i = 0; i <= 30; i++) {
  const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
  const ds = d.toISOString().slice(0, 10);
  if (daySet.has(ds)) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
  else { currentStreak = 0; }
}

// 平均 session token（概估：total / session count）
const sessionFiles = dirs.reduce((acc, dir) => {
  try { return acc + readdirSync(join(PROJECTS_DIR, dir)).filter(f => f.endsWith(".jsonl")).length; } catch { return acc; }
}, 0);
const avgSessionTokens = sessionFiles > 0 ? totalTokens / sessionFiles : 0;

// Bash 錯誤恢復：連續失敗後成功的比率
let errorRecoveries = 0, errorStreaks = 0, inErrorStreak = false;
for (const br of bashResults) {
  if (!br.success) {
    if (!inErrorStreak) { inErrorStreak = true; errorStreaks++; }
  } else {
    if (inErrorStreak) { errorRecoveries++; inErrorStreak = false; }
  }
}
const recoveryRate = errorStreaks > 0 ? errorRecoveries / errorStreaks * 100 : 100;

// ============ L5 智 ============

const agentCalls = toolCountMap["Agent"] || 0;
const bashCalls = toolCountMap["Bash"] || 0;
const readCalls = toolCountMap["Read"] || 0;
const grepCalls = toolCountMap["Grep"] || 0;
const editCalls = (toolCountMap["Edit"] || 0) + (toolCountMap["Write"] || 0);
const webCalls = (toolCountMap["WebSearch"] || 0) + (toolCountMap["WebFetch"] || 0);

const agentRatio = totalToolCalls > 0 ? agentCalls / totalToolCalls * 100 : 0;
const bashRatio = totalToolCalls > 0 ? bashCalls / totalToolCalls * 100 : 0;

// 工作風格判定
function getWorkStyle(agentR: number, bashR: number): string {
  if (agentR > 20) return "指揮官型 🎯 — 大量派 Agent，善於委派";
  if (agentR > 10) return "混合型 ⚡ — 自己做 + 派 Agent 並行";
  if (bashR > 50) return "手做型 🔧 — 親力親為，掌控細節";
  if (bashR > 30) return "平衡型 ⚖️ — 各工具均衡使用";
  return "閱讀型 📖 — 以 Read/Grep 分析為主";
}

// 工具鏈模式（Read→Grep→Edit = 系統化；隨機 = 沒系統）
// 簡化分析：看 Read 和 Grep 是否常出現在 Edit 之前
const toolSequence = toolCalls.map(t => t.name);
let systematicChains = 0, totalEdits = 0;
for (let i = 2; i < toolSequence.length; i++) {
  if (toolSequence[i] === "Edit" || toolSequence[i] === "Write") {
    totalEdits++;
    if ((toolSequence[i-1] === "Read" || toolSequence[i-1] === "Grep") ||
        (toolSequence[i-2] === "Read" || toolSequence[i-2] === "Grep")) {
      systematicChains++;
    }
  }
}
const systematicRate = totalEdits > 0 ? systematicChains / totalEdits * 100 : 0;

// 綜合 OQ 智慧分數（滿分 99）
function calcOqIQ(): number {
  let score = 0;
  // L1 量（20 分）
  score += Math.min(20, level * 3.3);
  // L2 效（25 分）
  score += Math.min(10, cacheHitRate / 10);
  score += Math.min(10, (5 - Math.min(inputRatio, 5)) * 2);
  score += Math.min(5, bashSuccessRate / 20);
  // L3 廣（15 分）
  score += Math.min(5, uniqueTools / 2);
  score += Math.min(5, projectSet.size / 2);
  score += hasGemini ? 5 : 0;
  // L4 深（20 分）
  score += Math.min(10, maxStreak / 3);
  score += Math.min(5, recoveryRate / 20);
  score += Math.min(5, activeDays / 6);
  // L5 智（19 分）
  score += Math.min(7, systematicRate / 10);
  score += Math.min(7, agentRatio > 0 ? Math.min(agentRatio, 20) / 3 : 0);
  score += Math.min(5, uniqueTools > 5 ? 5 : uniqueTools);
  return Math.min(99, Math.round(score));
}

// ============ 輸出報告 ============

const fmt = (n: number) => n.toLocaleString();
const fmtM = (n: number) => (n / 1e6).toFixed(0) + "M";
const fmtB = (n: number) => (n / 1e9).toFixed(1) + "B";
const fmtPct = (n: number) => n.toFixed(1) + "%";
const fmtUSD = (n: number) => "$" + n.toLocaleString("en", { maximumFractionDigits: 0 });

console.log(`
╔══════════════════════════════════════════════════════════════╗
║               OQ 五階指紋分析報告                             ║
╚══════════════════════════════════════════════════════════════╝

OQ 綜合智慧分數: ${calcOqIQ()} / 99

━━━ L1 量（用多少）━━━━━━━━━━━━━━━━━━━━━━━━
  月 Token 總量:    ${totalTokens > 1e9 ? fmtB(totalTokens) : fmtM(totalTokens)}
  日均:            ${totalTokens > 1e9 ? fmtM(dailyAvg) : fmt(Math.round(dailyAvg))}
  等級:            Lv.${level} ${levelTitles[level]}
  API 等值費用:     ${fmtUSD(apiCost)}/月
  黃仁勳月薪:      ${fmtUSD(apiCost * 2)}
  尖峰日:          ${peakDay > 1e9 ? fmtB(peakDay) : fmtM(peakDay)}

━━━ L2 效（用得聰明嗎）━━━━━━━━━━━━━━━━━━━━━
  快取命中率:       ${fmtPct(cacheHitRate)}
  指令佔比:         ${fmtPct(inputRatio)}（越低越精準）
  Bash 成功率:      ${fmtPct(bashSuccessRate)}
  效率等級:         ${efficiencyGrade(cacheHitRate, inputRatio)}

━━━ L3 廣（用多寬）━━━━━━━━━━━━━━━━━━━━━━━━
  同時專案數:       ${projectSet.size}
  工具種類:         ${uniqueTools} 種
  多模型:           ${hasGemini ? "✅ Claude + Gemini" : "❌ 單模型"}
  工具呼叫總計:     ${fmt(totalToolCalls)} 次
  主要時段:         ${primaryPeriod}
  時段分布:         早 ${fmtPct(hourBuckets[0]/hourTotal*100)} | 午 ${fmtPct(hourBuckets[1]/hourTotal*100)} | 晚 ${fmtPct(hourBuckets[2]/hourTotal*100)} | 深夜 ${fmtPct(hourBuckets[3]/hourTotal*100)}

  Top 工具:
${Object.entries(toolCountMap).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([name, count]) =>
  `    ${name.padEnd(15)} ${fmt(count).padStart(7)} 次  ${fmtPct(count/totalToolCalls*100).padStart(6)}`
).join("\n")}

━━━ L4 深（撞牆怎麼辦）━━━━━━━━━━━━━━━━━━━━━
  連續使用天數:     ${maxStreak} 天
  活躍天數:         ${activeDays}/30
  Session 數:       ${fmt(sessionFiles)}
  平均 Session:     ${avgSessionTokens > 1e6 ? fmtM(avgSessionTokens) : fmt(Math.round(avgSessionTokens))} token
  錯誤恢復率:       ${fmtPct(recoveryRate)}（Bash 失敗後恢復）
  總 turns:         ${fmt(totalTurns)}

━━━ L5 智（怎麼調度 AI）━━━━━━━━━━━━━━━━━━━━━
  工作風格:         ${getWorkStyle(agentRatio, bashRatio)}
  Agent 佔比:       ${fmtPct(agentRatio)}
  系統化操作率:     ${fmtPct(systematicRate)}（Edit 前有 Read/Grep）
  Bash 佔比:        ${fmtPct(bashRatio)}
  搜尋研究:         ${fmt(webCalls)} 次

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
資料來源: ~/.claude/projects/ (${fmt(sessionFiles)} sessions)
掃描範圍: 最近 30 天
不讀對話內容，只讀 token 計量 + 工具名 + 時間戳
`);
