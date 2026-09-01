# My GitHub Tasks

跨 Organization / Project 的個人（與團隊）工作總覽頁面。

排程（GitHub Actions，每 30 分鐘）會：
1. 讀取 `config/orgs.json` 裡指定的 org 清單。
2. 抓取每個 org 的成員名單，合併去重成一份團隊名單。
3. 對名單裡每個人查詢 `assignee:<login> is:issue`，並對每筆 issue 查它所屬的 Projects v2 專案與 Status 欄位。
4. 把結果寫成 `docs/data.json`，交給 `docs/index.html` 這個純前端靜態頁面渲染（依 Org → Project 分組，可用下拉選單切換看任何人的任務）。

## 建置

### 0. 設定要納入的 org

編輯 `config/orgs.json`，列出要抓成員/任務的 org login（目前：`EY-DnD-BoehringerIngelheim`、`EY-DnD-Unilever`、`EY-DnD-McDonalds`、`EY-DnD-QSquare`）。這份清單同時也是白名單：拿來決定要抓哪些 org 的成員，也用來過濾查到的 issue（issue 所屬 org 不在清單內就丟棄，即使 assignee 剛好是名單裡的人、且該 org 是這個 token 看得到的）。

如果有些 Projects v2（例如已 closed 或用不到的 untitled project）不想出現在 dashboard 上，把它的網址加進 `config/excluded-projects.json`（例如 `https://github.com/orgs/<org>/projects/<number>`）。屬於被排除 project 的 issue 就不會被列出。

### 1. 建立 token 並設定成 repo secret

需要一個 classic PAT，scopes：`repo`、`read:org`、`project`。

```
gh secret set GH_TASKS_TOKEN --repo <owner>/<repo>
```

> 如果任一 org 對 PAT 存取有限制（Organization Settings → Personal access tokens），需要該 org owner 額外核准這個 token，否則該 org 的成員 / 任務會抓不到（腳本會在 log 印出警告但不會整個失敗）。

### 2. GitHub Pages

已啟用（Source: GitHub Actions），網址：https://jordan-jh-lin.github.io/my-github-tasks/

> ⚠️ 這個 repo 是 **public**（免費個人方案的 private repo 不支援 GitHub Pages），代表 `docs/data.json`／這個網址只要有人知道連結就看得到全組的指派資訊。如果之後要收回成不公開，可以升級 GitHub Pro（個人版每月約 $4）再把 repo 改回 private，Pages 會自動變成需要有 repo 讀取權限才能看。

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
