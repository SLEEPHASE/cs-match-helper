# 上传到 GitHub

仓库地址：`https://github.com/SLEEPHASE/cs-match-helper`

## 1. 推送源码

```powershell
cd cs-match-helper-re
git init
git add .
git commit -m "SLEEPHASE 定制版 v1.0.0"
git branch -M main
git remote add origin https://github.com/SLEEPHASE/cs-match-helper.git
git push -u origin main
```

> `.gitignore` 已排除 `build/`、`dist/*.exe`、`artifacts/`、`patched/`，仓库只留源码与工具链。

## 2. 发 Release

用 `gh`（推荐）：

```powershell
gh release create v1.0.0 `
  release\sleephase-helper.exe `
  release\sleephase-helper-no-admin.exe `
  --title "v1.0.0" `
  --notes-file release\README.md
```

网页端也可以：Releases → Draft a new release → Tag `v1.0.0` → 上传 `release/` 里的两个 exe 和 `SHA256.txt`。

## 3. 验证更新通道

程序里的检查更新会请求：

```
https://api.github.com/repos/SLEEPHASE/cs-match-helper/releases/latest
```

取 `tag_name` 与第一个 `.exe` 资产。所以：

- tag 必须是 `v1.0.0` 这种形式（代码会去掉前缀 `v` 再和 `1.0.0` 比较）
- Release 里至少要挂一个 `.exe` 资产，否则「下载更新」会退回到 Releases 页面

## 4. 更新版本号（以后发新版本）

1. 改 `tools/pack_frontend.mjs` 里两处 `1.0.0` 与 `tools/patch_title.py` 的目标版本串
2. 改 `tools/patch_version.py` 的 `old/new`（默认 `4.0.2 → 1.0.0`）
3. 重新按 README 的构建步骤出包
4. tag 用新版本号推送

## 注意

- 仓库建议 **public**：前端直接 `fetch` GitHub API，私有仓库会 401。
- 上传前确认 `release/` 里的 exe 是最新构建（对比 `SHA256.txt`）。
- 不要把原版 `cs-match-helper.exe` 或逆向样本提交进仓库。
