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
