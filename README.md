# 時光交易所：課堂練習版

純前端歷史行情回放練習，包含同一瀏覽器續玩、JSON備份與HTML學習報告／列印PDF。不需要應用程式伺服器、登入帳號或成績上傳API。

## 開箱即可玩的真實歷史教育版

本包已包含完整教學用真實dataset.json，不需要學生自行匯入行情。原始來源、加工方式、合理公開依據及剩餘條款不確定性見SOURCES.md與遊戲中的「資料來源與使用說明」。未宣稱所有第三方資料適用MIT/CC0或都取得個別書面許可。

## 檔案與發布方式

- dist/：唯一網站發布目錄，包含HTML/CSS/JS與真實dataset.json。
- test/：57項自動測試及必要測試資料，不發布到Pages網站。
- .github/workflows/pages.yml：手動GitHub Actions發布，不在push時自動上線。
- scripts/check-release.mjs：檢查來源說明、精確資料雜湊、網站檔案白名單及JS語法，不以全面書面授權為門檻。
- .publication/release-manifest.json：本次教育版整理說明與資料SHA-256；資料更動後應核對來源並更新雜湊。

1. 將乾淨包放入指定獨立repository，不上傳原專案.git、.openai、QA下載或學生紀錄。
2. Settings → Pages選GitHub Actions作為來源。
3. 執行Publish classroom replay to GitHub Pages，勾選confirm_public；流程會先npm run check及npm test，再只發布dist。
4. 部署使用GitHub工作流程短期GITHUB_TOKEN/OIDC，不需把PAT或API key填入程式。
5. 以Actions回傳URL為準，實測載入、重新整理續玩、JSON備份、離線報告及PDF列印。

程式採相對路徑，適合專案Pages子目錄。單純雙擊遊戲index.html不是HTTP部署，請使用npm start提供本機HTTP預覽。下載的自含HTML學習報告則可直接開啟。

## 續玩與個人資料

- 姓名、學號、決策理由、操作筆記、反思只由學生在自己的瀏覽器輸入，使用localStorage本機保存，報告／JSON也在本機產生；程式沒有登入、後端成績上傳或追蹤SDK。
- localStorage僅同裝置、同瀏覽器、同origin可用。從Sites搬至github.io不會自動帶走舊進度，須手動匯出相容JSON後在新網址載入；清除網站資料、無痕結束或瀏覽器限制可能造成遺失。舊版非版本化JSON匯出不是新續玩檔。
- GitHub同一使用者的專案Pages共用origin，不能把路徑當成資料隔離安全邊界；此工具不適合存敏感紀錄。不要在其他同origin應用重用存檔key。
- HTML報告可在瀏覽器開啟並列印另存PDF。報告內補寫文字不會回存下載檔，應立即列印保存；耐久筆記請在遊戲頁填寫並重新匯出。
- 請勿把學生的JSON、HTML、PDF、姓名學號或測試下載放進repository。公開repo及Pages均不是交作業收件匣。

## 資料與教學限制

資料為選摘公告與日線，並非完整市場新聞；來源及授權應以獲准後的資料說明為準。行情使用TWSE歷史查詢客觀數據及同類開放資料授權作合理依據；公司事件採事實數字與自寫摘要。各來源條款範圍與剩餘不確定性見SOURCES.md，沒有概括第三方授權宣稱。

完整行情會下載到前端，時間閘只供練習，不能防止偷看或作為安全考試系統。本工具無帳號、班級成績、跨裝置同步或交易憑證。含費用、配息及分割的教學模型仍有明示簡化，非投資建議。

## 驗證

本候選程式來自已通過57項單元／DOM stub／靜態測試的課堂版。完整57項測試已附test/，可執行npm test；npm run check另驗證發布檔案、署名與雜湊。測試不屬於網站artifact。新續玩與報告功能仍需真實瀏覽器及A4列印驗收。

GitHub官方工作流程說明：https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Direct PDF performance reports
The report button directly downloads a client-generated PDF with embedded Traditional Chinese text and vector charts. Assets and licensed dependencies are vendored on the same origin; first font loading is about 7 MB. The report contains all completed decisions and full notes/reflections, flows long text across A4 pages, and uses only revealed observations. Historical automatically visible news is summarized by provider; replay-period events and explicit title/ID/URL mentions receive source detail. Full visible news-ID sets remain in the JSON backup. Unsupported font glyphs are represented by Unicode code point.

`npm test` tests the actual PDF renderer, financial models and UI wiring. `node scripts/generate-pdf-samples.mjs <output-dir> [backup.json]` generates zero-decision and 120-day stress PDFs, plus an actual-backup PDF when a backup file is supplied. Generated reports and student backup files must not be committed or published.

## Blind replay and configurable indicators
New rounds hide the instrument and calendar dates, show relative trading days, and reserve 260 historical bars. The same seed, dataset SHA-256, round length and sampling settings reproduce the same interval. An explicitly supplied seed does not use random no-repeat rerolls. The default blind sampler uses all dates; previously saved explicit-date/year cases remain compatible and are marked disclosed.

Students can enable and tune SMA, EMA, Bollinger bands, Wilder RSI, MACD, KD and split-comparable volume averages. Price overlays and separate oscillator panels use completed, visible bars only. Settings changes are retained in order, including multiple changes before one decision; the last setting at that decision step is effective. Missing warmup values display as unavailable. The 260-bar default covers the maximum supported first-valid lookback (239 bars); this is not a claim of full EMA convergence.

Save format v2 adds warmup, disclosure state and indicator history. v1 saves replay and validate every original decision before migrating as already disclosed; no historical indicator settings are fabricated. Same-browser disclosure history prevents an ordinary earlier-backup import of that case from silently resetting disclosure. Clearing browser storage, editing JSON or developer tools can bypass this local honesty record. All raw market data remain downloaded, and JSON backups retain actual dates and identifiers. This is a display-level classroom blind exercise, not exam anti-cheat protection.

In-progress reports retain relative-day labeling unless the student explicitly reveals. Completed reports show the real instrument and dates. Reports include seed, data version, round settings, disclosure history, effective indicator-setting references and the complete settings history. User-authored reasons, notes and reflections remain verbatim even when they contain guesses about identity. PDF generation captures the scenario, state and drafts together before asynchronous font loading.

### Focused workspace and interactive chart

The UI now separates preparation, trading and review/report into distinct views. A new visitor starts with a short introduction; restored sessions open the trading view, or the completed report. Switching views preserves the current replay and unsent draft. The compact sticky navigation and portfolio strip keep assets, cash, holdings and the relative decision-day counter visible. Backups and identity reveal live in preparation; PDF reports, reflection and the full journal live in review. Indicator selection and parameters remain directly on the chart: new replays begin with only candles and volume, “＋ 指標” opens an available-indicator menu, and selected colored chips open a local parameter editor with apply/remove controls. Previously saved indicator choices are restored, not replaced by the new defaults.

The locally implemented SVG chart (`dist/interactive-chart.js`) receives only `visible(s,state).bars` and causal indicator series. It has shared price/volume/study time windows, visible axes and grids, drag/pointer panning, zoom buttons, keyboard navigation, Ctrl/Command-wheel zoom, and blind-safe OHLCV tooltips. Only enabled overlays, study panes, legend entries and value cards appear. Price overlays and volume averages are color keyed. Volume bars and the volume average use split-comparable units; tooltips separately disclose original volume. No chart library, CDN or new external runtime is required. Raw dates are never formatted inside the component; the app provides the appropriate relative-day or revealed-date label function.

Each decision displays an estimate using the last known close, estimated fees and resulting holdings, followed by a confirmation before advancing. The estimate is not an execution-price guarantee. Gap-related cancellation still advances the day and is explicitly reported. More than five older news items are collapsed behind an expansion control.

Validation includes the original simulation, blindness, indicator, persistence and PDF tests plus workspace-navigation and chart range/event tests. DOM-stub tests are not a substitute for actual browser visual/mobile QA; that stage must be checked against an accessible preview or deployed URL.

### Multiple moving-average instances

SMA and EMA can each have multiple independently editable lines, up to eight moving-average lines total. Each line has a stable id, type, period (2–120) and six-digit color. Add another line from “＋ 指標”, edit its own chip, or append an SMA 5/20 or 5/20/60 comparison group. These comparison presets are educational views, not trading recommendations.

New explicit `movingAverages` arrays are authoritative. Saves and histories without that property retain the older single-SMA/EMA settings; `movingAverageInstances` exposes these as stable `legacy-sma`/`legacy-ema` instances for display and conversion. Editing or adding a line preserves other instances. JSON restores validate every id, period and color and reject duplicates/over-limit arrays. Per-decision report context and PDF history include each id/type/period/color; compatibility scalar fields do not imply extra plotted lines.

Chart extents, legends, crosshair values and warmup calculations include every selected instance, using only already visible bars. Tests cover SMA crossings, causal prefix equality, independent EMA seeds, per-line edits/removals, persisted round trips and report history fidelity.

### Beginner clarity

Fresh practice defaults to hold, with the quantity disabled until a buy/sell choice is made. A saved draft's explicit side and quantity are preserved on restoration. A reason and final confirmation remain required before time advances. Historical warmup labels read “練習前 N 日”, using positive counts; raw dates and dataset content are unchanged. A compact, collapsed quick-start explanation is available in the trading view, and news/indicator terminology has optional plain-language explanations without predictive or trading recommendations. Student-facing moving-average labels use line numbers; technical identities remain in persisted data and report appendices.

### Preview regression safeguards

Invalid zero-holding or over-sized sell choices retain the user's selected direction but show a clear unavailable message, never negative projected holdings or sale proceeds, and disable submission. The simulation still independently rejects the action, so scripted/form bypasses cannot advance a day or create a short position. Valid sell/hold estimates omit buy-only gap-cancellation language.

The report download action is above the expandable student form in a compact sticky report heading. Application modules and CSS carry a shared asset-version URL (`node scripts/version-assets.mjs preview-v3`); the header also confirms the running preview build. This prevents accidental mixed cached module versions during local preview updates. It does not establish that caching caused any previously observed mismatch. JSON import/restore never rewrites past labels: relative labels are generated from the active display code and are covered by a legacy version-two save regression.


### Daily-equity risk and risk-adjusted performance

The review screen, standalone HTML report and PDF share `performanceModel` and the same strategy / buy-and-hold comparison. Both series use initial capital plus the same completed trading-day closes, including cash, holdings and dividend rights. Imported saves keep their original dataset and cost model; performance is derived without writing to the journal or cached historical equity. Existing version 1–3 JSON exports/imports remain supported.

The comparison includes period total net return (never annualized), annualized daily volatility, maximum drawdown, deepest/longest/current drawdown duration and recovery status, Sharpe and Sortino. Educational defaults are rf=0, MAR=0 and 252 trading days/year. Volatility and Sharpe use sample standard deviation (N−1); Sortino uses the downside second moment over all N returns. Risk estimates need at least two returns. Zero volatility is a valid volatility of zero, with N/A Sharpe; zero downside produces N/A Sortino. Missing, nonfinite, duplicate or unordered daily observations produce N/A with reasons, without dropping observations. Drawdown durations count trading-day intervals from the latest equal high to first recovery, or to the final observed close when unrecovered. The longest event can differ from the deepest event.

Annualization is a scale convention, not a one-year forecast. Samples below 252 returns are explicitly identified as short samples; one run does not establish statistical superiority, alpha or future performance. No Calmar or trade-win-rate estimate is inferred. Fees, tax, dividend treatment, average exposure and full original transaction details remain in the reports.

To regenerate reports from an existing normal UI backup without starting another simulation:

```sh
node scripts/recompute-session.mjs /path/to/original-backup.json /path/to/new-output-directory
```

The output directory must not already exist. The script validates the save against its registered immutable dataset, writes PDF/HTML reports, copies the original backup byte-for-byte, and exports version-1 derived daily equity and risk metrics separately with the original file SHA256. The derived metrics file is an analysis export; resume the session using the preserved original backup. It does not alter the input or invent decisions.

Run the full test suite with the optional preserved 120-day fixture to include its exact reconciliation:

```sh
MARKET_REPLAY_SESSION_FIXTURE=/path/to/practice-6-completed-120-day-backup.json npm test
npm run check
```

Without the private fixture, only that one optional reconciliation test is skipped with an explicit reason. The fixture is intentionally kept outside application assets and source packages.


For optional real-browser news boundary acceptance, provide Playwright and Chromium in the cloud development environment, start the static server, then run:

```sh
node scripts/accept-news-boundary.cjs http://127.0.0.1:4173/ /tmp/new-news-boundary-evidence
```

This creates a separate browser context and a separate 20-day test practice through normal UI controls. It checks both a precise-time BOJ event and a date-only Taiwan central-bank event before/after their first eligible decision cutoff, reveals dates only in that test context, and verifies anonymous display after refresh. Generated screenshots and the synthetic test backup belong outside the repository; they are not publication assets.
