# My GitHub Tasks

跨 Organization / Project 的個人（與團隊）工作總覽頁面。

排程（GitHub Actions，每 30 分鐘）會：
1. 用一個具備 `read:org` + `repo` + `project` 權限的 token，列出這個 token 看得到的所有 GitHub Organization。
2. 抓取每個 org 的成員名單，合併去重成一份團隊名單。
3. 對名單裡每個人查詢 `assignee:<login> is:issue`，並對每筆 issue 查它所屬的 Projects v2 專案與 Status 欄位。
4. 把結果寫成 `docs/data.json`，交給 `docs/index.html` 這個純前端靜態頁面渲染（依 Org → Project 分組，可用下拉選單切換看任何人的任務）。

## 建置

### 1. 建立 token 並設定成 repo secret

需要一個 classic PAT，scopes：`repo`、`read:org`、`project`。

```
gh secret set GH_TASKS_TOKEN --repo <owner>/<repo>
```

> 如果任一 org 對 PAT 存取有限制（Organization Settings → Personal access tokens），需要該 org owner 額外核准這個 token，否則該 org 的成員 / 任務會抓不到（腳本會在 log 印出警告但不會整個失敗）。

### 2. 啟用 GitHub Pages（來源設為 GitHub Actions）

Repo → Settings → Pages → Build and deployment → Source：選擇 **GitHub Actions**。

> Private repo 要讓 Pages 網站限制「只有被邀請的人能看」，需要 GitHub Pro（個人版）、Team 或 Enterprise Cloud 方案。如果方案不支援，Pages 網址會是「知道網址即可看」的公開狀態，請評估資料敏感性後再決定要不要開放。

### 3. 觸發第一次執行

Actions 分頁手動觸發 `Update dashboard`（`workflow_dispatch`），或等待下一次排程（每 30 分鐘一次）。

## 本機測試

```bash
export GH_TOKEN=<your-pat>
node scripts/fetch-tasks.js
# 產生 docs/data.json，可直接用瀏覽器打開 docs/index.html 檢查（部分瀏覽器需要用簡易 http server 才能 fetch 本機 json，例如 npx serve docs）
```

## 已知限制

- 只涵蓋 Projects v2（新版 Projects）。舊版 Projects（classic）不支援。
- 只查 Issue（`is:issue`），不含 Pull Request。
- Search API 對單一查詢有分頁上限，團隊人數 / 任務量很大時，排程執行時間與 API rate limit 消耗會增加。
