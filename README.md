# SLEEPHASE CS 匹配助手

基于 [小淳](https://github.com/qianjiachun/) 的 **CS 匹配助手 4.0.2** 做的二次开发版本（Tauri 2 + Vue 3）。
在原版二进制上重打包前端资源，保留原版全部后端能力（完美/5E 数据、历史记录、登录态），
并加入二次开发定制项。

> **禁止传播** · 仅供个人使用

---

## 定制内容

| 功能 | 说明 |
|---|---|
| 启动密码 | 首次启动输入密码（单独发放），之后自动记住（localStorage），不再重复输入 |
| 深色模式 | 跟随系统 / 浅色 / 深色 三态，标题栏按钮或 `Ctrl+Shift+L` 切换；二维码区域强制白底 |
| 准备顺序 | 左下角面板，记录谁第 1 / 第 2 / 第 3 个准备，带耗时与昵称，换局自动清空 |
| 版本 | UI 与 PE 版本资源统一 `1.0.0` |
| AI 功能 | 移除设置入口与全部分析命令 |
| 对局 HUD | 移除标题栏入口与 HUD 窗口创建 |
| 更新通道 | 检查更新 / 更新日志 / 下载全部走本仓库 Releases |
| 标题 | 页面标题、应用标题栏、窗口标题统一带「禁止传播」 |

---

## 目录

```
frontend/                 已解包的前端源码（可直接改）
  assets/
    main-DWII-cul.js      应用主包（Vue 3）
    sleephase-inline.js   运行期定制层（密码/主题/准备面板/更新桥）
    sleephase-extras.js   早期版本用的主题+面板脚本（保留参考）
    sleephase-custom.js   早期版本用的定制脚本（保留参考）
tools/                    重打包工具链
  extract_assets.mjs      exe → 前端资源（brotli）
  pack_frontend.mjs       前端 → 可回填的 brotli 资源
  repack_pe.py            改 Tauri 资源表 + 新增 .adata 节
  patch_version.py        版本资源 4.0.2 → 1.0.0
  patch_title.py          窗口标题串等长替换
  strip_admin.py          清单 requireAdministrator → asInvoker
  verify_pack.py          从成品 exe 读回资源校验
  probe_headless.mjs      Edge headless 端到端探针
  apply_rebrand.mjs       文案/仓库链接批量替换
  apply_strings.mjs       中文字面量批量替换
  dump_strings.mjs        中文文案清单导出
backend/                  用 Tauri 2 重建的后端骨架（可选，需 Rust）
docs/                     逆向报告 / 前端地图 / 魔改指南 / 打包说明
dist/                     构建产物（exe）
```

---

## 构建

需要：Node 18+、Python 3.9+、原版 `cs-match-helper.exe`（放 `artifacts/cs-match-helper/`）。

```powershell
# 1) 生成前端资源
node tools\pack_frontend.mjs frontend build\repack "600" --no-bust

# 2) 回填进 exe（新增 .adata 节）
python tools\repack_pe.py artifacts\cs-match-helper\cs-match-helper.exe build\stage.exe build\repack\manifest.json

# 3) 版本号 + 窗口标题
python tools\patch_version.py build\stage.exe build\stage-v.exe
python tools\patch_title.py build\stage-v.exe dist\sleephase-helper.exe

# 4) 可选：免 UAC 版
python tools\strip_admin.py dist\sleephase-helper.exe dist\sleephase-helper-no-admin.exe
```

> `--no-bust` 表示不给资源 URL 加 `?v=`（实测加 query 会影响部分懒加载页面）。

---

## 原理（简述）

Tauri 2 把前端资源内嵌在 PE 的 `.rdata` 里，资源表是 25 条定长 32 字节条目：

```
[u64] key_ptr   → "/assets/main-DWII-cul.js"
[u64] key_len
[u64] data_ptr  → 紧随其后的 brotli 流
[u64] data_len
```

`data_ptr` 在重定位表中，可以安全改写；新增的压缩流放在追加的 `.adata` 节。
所以不需要重新编译 Rust，就能整体替换前端。

运行期定制（密码/主题/面板）放在 `index.html` 的**内联脚本**里，与应用 bundle 完全隔离——
这是踩过坑之后的结论：注入进 main.js 会跟着 Vue 一起崩。

---

## 已知限制

- 密码是前端闸门，能挡住普通使用者，不是加密。
- 准备顺序依赖应用自身推送的 `readyUuids` 字段，服务端不下发时面板为空。
- 后端骨架 `backend/` 未包含完美的扫码协议实现，重建后需要自行补齐。
