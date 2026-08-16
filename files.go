package main

import (
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExternalPlugin 磁盘上的外部插件（%APPDATA%/KairosMd/plugins/<id>/）
type ExternalPlugin struct {
	Id       string         `json:"id"`
	Manifest map[string]any `json:"manifest"`
	HasMain  bool           `json:"hasMain"`
}

// Files 是暴露给前端的核心服务：文件对话框、读取、配置、草稿、贴图、多窗口
type Files struct {
	mu            sync.Mutex
	frontendReady bool
	forceQuit     bool // 前端确认未保存提示后置位，放行关闭
	initialPath   string
	pendingPaths  []string
	app           *application.App

	// S2：会话授权文件集——只有用户显式动作（对话框/命令行/最近文件）引入的路径才能被绑定读写
	authorized map[string]bool
}

func NewFiles() *Files {
	f := &Files{authorized: map[string]bool{}}
	f.authorizeFromConfig()
	f.authorizePath(firstMarkdownArg(os.Args[1:]))
	return f
}

// ---------- S2 路径授权集 ----------

func normPath(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		return ""
	}
	return strings.ToLower(filepath.Clean(abs))
}

func (f *Files) authorizePath(p string) {
	if n := normPath(p); n != "" {
		f.mu.Lock()
		f.authorized[n] = true
		f.mu.Unlock()
	}
}

func (f *Files) isAuthorized(p string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.authorized[normPath(p)]
}

// authorizeFromConfig 从 config.json 的 recent / lastFile 提取历史授权路径
func (f *Files) authorizeFromConfig() {
	cfg, err := f.ReadConfig()
	if err != nil {
		return
	}
	if s, ok := cfg["lastFile"].(string); ok && s != "" {
		f.authorizePath(s)
	}
	if arr, ok := cfg["recent"].([]any); ok {
		for _, it := range arr {
			if m, ok := it.(map[string]any); ok {
				if p, ok := m["path"].(string); ok && p != "" {
					f.authorizePath(p)
				}
			}
		}
	}
}

// AuthorizePath 前端打开文档前调用：仅放行落在 /kfs 白名单目录内的路径
// （用户已明确打开过该目录），防止被注入的 JS 借授权接口扩权。
func (f *Files) AuthorizePath(path string) error {
	if f.isAuthorized(path) {
		return nil
	}
	if !kfsPathAllowed(path) {
		return fmt.Errorf("路径未授权：%s", path)
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".mdx", ".txt":
	default:
		return fmt.Errorf("文件类型不支持：%s", path)
	}
	f.authorizePath(path)
	return nil
}

// ServiceStartup 服务启动钩子：捕获命令行文件参数并清理过期草稿
func (f *Files) ServiceStartup(_ context.Context, _ application.ServiceOptions) error {
	f.mu.Lock()
	f.app = application.Get()
	f.initialPath = firstMarkdownArg(os.Args[1:])
	f.mu.Unlock()
	f.authorizePath(f.initialPath)
	f.cleanOldDrafts()
	return nil
}

// InitialFile 返回一个通过文件关联传入的待打开 Markdown 文件路径。
// 读取后会消费该路径，避免前端重复打开。
func (f *Files) InitialFile() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.initialPath != "" {
		path := f.initialPath
		f.initialPath = ""
		return path
	}
	if len(f.pendingPaths) == 0 {
		return ""
	}
	path := f.pendingPaths[0]
	f.pendingPaths = f.pendingPaths[1:]
	return path
}

// MarkFrontendReady 标记前端已注册第二实例事件，并返回启动期间积压的路径。
func (f *Files) MarkFrontendReady() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.frontendReady = true
	paths := append([]string(nil), f.pendingPaths...)
	f.pendingPaths = nil
	return paths
}

// handleSecondInstance 将第二次启动传入的文件转交给当前实例。
func (f *Files) handleSecondInstance(data application.SecondInstanceData) {
	path := firstMarkdownArg(data.Args)
	if path == "" {
		return
	}
	// 双击打开的文件属于用户显式动作，直接授权
	f.authorizePath(path)

	f.mu.Lock()
	frontendReady := f.frontendReady
	if !frontendReady {
		f.pendingPaths = append(f.pendingPaths, path)
	}
	f.mu.Unlock()

	if frontendReady {
		application.Get().Event.Emit("app:open-file", path)
	}
}

// handleWindowClosing 系统关闭窗口（Alt+F4 / 任务栏）：v3 事件不可取消，
// 直接放行；未保存内容由草稿系统兜底。自定义标题栏的关闭按钮走前端确认。
func (f *Files) handleWindowClosing(win *application.WebviewWindow, e *application.WindowEvent) {
	// 仅最后窗口关闭时退出应用（--multi 拆窗进程关闭自己）
	application.Get().Quit()
}

// QuitApp 前端确认（或无未保存修改）后调用，真正退出
func (f *Files) QuitApp() {
	application.Get().Quit()
}

// ---------- /kfs 本地媒体目录白名单 ----------
// 渲染的 Markdown 不可信（可构造任意 /kfs?path= 探测本地文件），
// 因此 /kfs 只服务前端显式注册过的目录：当前打开的文档目录与用户主题目录。

var (
	kfsDirsMu sync.Mutex
	kfsDirs   = make([]string, 0, 64)
)

const kfsMaxDirs = 64

// AllowDir 把目录加入 /kfs 白名单（打开文档 / 加载用户主题时调用）
func (f *Files) AllowDir(dir string) {
	if dir == "" {
		return
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return
	}
	abs = strings.ToLower(filepath.Clean(abs))
	kfsDirsMu.Lock()
	defer kfsDirsMu.Unlock()
	for _, d := range kfsDirs {
		if d == abs {
			return
		}
	}
	if len(kfsDirs) >= kfsMaxDirs {
		kfsDirs = kfsDirs[len(kfsDirs)-kfsMaxDirs+1:]
	}
	kfsDirs = append(kfsDirs, abs)
}

// kfsPathAllowed 判断绝对路径是否落在任一白名单目录内（Windows 大小写不敏感）
func kfsPathAllowed(path string) bool {
	p := strings.ToLower(filepath.Clean(path))
	kfsDirsMu.Lock()
	defer kfsDirsMu.Unlock()
	for _, d := range kfsDirs {
		if strings.HasPrefix(p, d+string(filepath.Separator)) {
			return true
		}
	}
	return false
}

// ---------- 原子写入 ----------

// writeFileAtomic 临时文件 + rename，避免写入中途崩溃留下半截文件
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	_, werr := tmp.Write(data)
	cerr := tmp.Close()
	if werr != nil || cerr != nil {
		_ = os.Remove(tmpName)
		if werr != nil {
			return werr
		}
		return cerr
	}
	if err := os.Rename(tmpName, path); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return nil
}

func firstMarkdownArg(args []string) string {
	for _, arg := range args {
		path := strings.Trim(strings.TrimSpace(arg), `"`)
		if path == "" || strings.HasPrefix(path, "-") {
			continue
		}
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		switch strings.ToLower(filepath.Ext(path)) {
		case ".md", ".markdown", ".mdx":
			return path
		}
	}
	return ""
}

// IsMultiWindow 当前进程是否以独立新窗口模式启动（标签拖出拆分）
func IsMultiWindow() bool {
	for _, a := range os.Args[1:] {
		if a == "--multi" {
			return true
		}
	}
	return false
}

// OpenNewWindow 拖出标签：以 --multi 启动一个独立窗口进程展示该文档
func (f *Files) OpenNewWindow(path string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return exec.Command(exe, "--multi", path).Start()
}

// ---------- 对话框 ----------

func (f *Files) PickFile() (string, error) {
	p, err := application.Get().Dialog.OpenFile().
		SetTitle("打开 Markdown 文件").
		AddFilter("Markdown (*.md;*.markdown;*.mdx;*.txt)", "*.md;*.markdown;*.mdx;*.txt").
		PromptForSingleSelection()
	if err == nil && p != "" {
		f.authorizePath(p) // 用户对话框选择 → 授权
	}
	return p, err
}

// SaveAsPath 弹出保存对话框，返回用户选择的路径
func (f *Files) SaveAsPath(name string) (string, error) {
	d := application.Get().Dialog.SaveFile()
	d.SetOptions(&application.SaveFileDialogOptions{
		Title:    "保存为",
		Filename: name,
		Filters: []application.FileFilter{
			{DisplayName: "Markdown (*.md)", Pattern: "*.md"},
		},
	})
	p, err := d.PromptForSingleSelection()
	if err == nil && p != "" {
		f.authorizePath(p)
	}
	return p, err
}

// SaveHtmlPath 导出 HTML 的保存对话框
func (f *Files) SaveHtmlPath(name string) (string, error) {
	d := application.Get().Dialog.SaveFile()
	d.SetOptions(&application.SaveFileDialogOptions{
		Title:    "导出 HTML",
		Filename: name,
		Filters: []application.FileFilter{
			{DisplayName: "HTML (*.html)", Pattern: "*.html"},
		},
	})
	p, err := d.PromptForSingleSelection()
	if err == nil && p != "" {
		f.authorizePath(p)
	}
	return p, err
}

// ---------- 读取 ----------

// ReadFile 读取文件内容（限制 16MB）；UTF-8 优先，旧中文文档回退 GB18030 解码。
// 仅允许读取会话授权过的路径（用户打开/保存过的文件）。
func (f *Files) ReadFile(path string) (string, error) {
	if !f.isAuthorized(path) {
		return "", fmt.Errorf("路径未授权")
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.Size() > 16<<20 {
		return "", fmt.Errorf("文件过大（%.1f MB），KairosMd 只读取 16MB 以内的文本", float64(info.Size())/(1<<20))
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return decodeText(b), nil
}

// decodeText：UTF-8 BOM 去头；合法 UTF-8 直用；否则按 GB18030（GBK 超集）解码；再失败原样返回
func decodeText(b []byte) string {
	if len(b) >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF {
		return string(b[3:])
	}
	if utf8.Valid(b) {
		return string(b)
	}
	if out, err := simplifiedchinese.GB18030.NewDecoder().Bytes(b); err == nil && utf8.Valid(out) {
		return string(out)
	}
	return string(b)
}

// WriteFile 保存文件内容（原子写入）；仅授权路径且限文本类扩展名
func (f *Files) WriteFile(path, content string) error {
	if !f.isAuthorized(path) {
		return fmt.Errorf("路径未授权")
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".mdx", ".txt", ".html", ".htm", ".json":
	default:
		return fmt.Errorf("不允许写入该文件类型")
	}
	return writeFileAtomic(path, []byte(content))
}

// SaveClipboardImage 把 base64 图片写入 dir/name，返回完整路径。
// dir 必须在 /kfs 白名单目录内；name 强制取 Base（防 ..\ 穿越）且仅限图片扩展名。
func (f *Files) SaveClipboardImage(dir, name, b64 string) (string, error) {
	if !kfsPathAllowed(filepath.Join(dir, name)) {
		return "", fmt.Errorf("目录未授权")
	}
	cleanName := filepath.Base(name)
	ext := strings.ToLower(filepath.Ext(cleanName))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif":
	default:
		return "", fmt.Errorf("不允许的图片类型")
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, cleanName)
	if err := writeFileAtomic(p, data); err != nil {
		return "", err
	}
	return p, nil
}

// ---------- 配置目录与持久化 ----------

func (f *Files) ConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "KairosMd")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// ReadConfig 读取 config.json；不存在时返回空 map（不报错）
func (f *Files) ReadConfig() (map[string]any, error) {
	dir, err := f.ConfigDir()
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(filepath.Join(dir, "config.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]any{}, nil
		}
		return nil, err
	}
	cfg := map[string]any{}
	if err := json.Unmarshal(b, &cfg); err != nil {
		return map[string]any{}, nil // 配置损坏时回退默认值
	}
	return cfg, nil
}

// SaveConfig 增量合并写入：前端只发变化字段，这里与磁盘现有配置合并，
// 避免多进程（--multi 拆窗）互相用旧状态全量覆盖。原子写入防损坏。
func (f *Files) SaveConfig(cfg map[string]any) error {
	dir, err := f.ConfigDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dir, "config.json")

	existing := map[string]any{}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &existing)
	}
	for k, v := range cfg {
		existing[k] = v
	}

	b, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(path, b)
}

// ---------- 崩溃恢复草稿 ----------

// DraftInfo 一次未保存内容的快照（%APPDATA%/KairosMd/drafts/）
type DraftInfo struct {
	For     string `json:"for"` // 对应文档路径，未命名文档为空串
	Name    string `json:"name"`
	Content string `json:"content"`
	T       int64  `json:"t"` // 毫秒时间戳
}

func (f *Files) draftPath(forPath string) string {
	dir, err := f.ConfigDir()
	if err != nil {
		return ""
	}
	sum := sha1.Sum([]byte(forPath))
	return filepath.Join(dir, "drafts", hex.EncodeToString(sum[:])+".json")
}

// SaveDraft 落盘未保存内容快照（前端 dirty 时防抖调用）
func (f *Files) SaveDraft(forPath, name, content string) error {
	p := f.draftPath(forPath)
	if p == "" {
		return fmt.Errorf("配置目录不可用")
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	b, err := json.Marshal(DraftInfo{For: forPath, Name: name, Content: content, T: time.Now().UnixMilli()})
	if err != nil {
		return err
	}
	return writeFileAtomic(p, b)
}

// LoadDraft 读取草稿；不存在（或已损坏）返回 nil
func (f *Files) LoadDraft(forPath string) (*DraftInfo, error) {
	p := f.draftPath(forPath)
	if p == "" {
		return nil, fmt.Errorf("配置目录不可用")
	}
	b, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	d := &DraftInfo{}
	if json.Unmarshal(b, d) != nil {
		return nil, nil
	}
	return d, nil
}

// DeleteDraft 删除草稿（保存成功 / 用户明确放弃后）
func (f *Files) DeleteDraft(forPath string) error {
	p := f.draftPath(forPath)
	if p == "" {
		return nil
	}
	_ = os.Remove(p)
	return nil
}

// cleanOldDrafts 清理 30 天前的草稿，启动时调用
func (f *Files) cleanOldDrafts() {
	dir, err := f.ConfigDir()
	if err != nil {
		return
	}
	entries, err := os.ReadDir(filepath.Join(dir, "drafts"))
	if err != nil {
		return
	}
	cutoff := time.Now().AddDate(0, 0, -30).UnixMilli()
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || info.ModTime().UnixMilli() > cutoff {
			continue
		}
		_ = os.Remove(filepath.Join(dir, "drafts", e.Name()))
	}
}

// ---------- 外部插件与用户主题 ----------

func (f *Files) ListExternalPlugins() []ExternalPlugin {
	out := []ExternalPlugin{}
	dir, err := f.ConfigDir()
	if err != nil {
		return out
	}
	entries, err := os.ReadDir(filepath.Join(dir, "plugins"))
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		id := e.Name()
		mf := filepath.Join(dir, "plugins", id, "manifest.json")
		b, err := os.ReadFile(mf)
		if err != nil {
			continue
		}
		manifest := map[string]any{}
		if json.Unmarshal(b, &manifest) != nil {
			continue
		}
		_, mainErr := os.Stat(filepath.Join(dir, "plugins", id, "main.js"))
		out = append(out, ExternalPlugin{Id: id, Manifest: manifest, HasMain: mainErr == nil})
	}
	return out
}

// ReadPluginCode 读取插件入口脚本 main.js
func (f *Files) ReadPluginCode(id string) (string, error) {
	dir, err := f.ConfigDir()
	if err != nil {
		return "", err
	}
	id = filepath.Base(id) // 防止路径穿越
	b, err := os.ReadFile(filepath.Join(dir, "plugins", id, "main.js"))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ListUserThemes 扫描 themes/<id>/theme.json 的用户主题包
func (f *Files) ListUserThemes() []map[string]any {
	out := []map[string]any{}
	dir, err := f.ConfigDir()
	if err != nil {
		return out
	}
	entries, err := os.ReadDir(filepath.Join(dir, "themes"))
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, "themes", e.Name(), "theme.json"))
		if err != nil {
			continue
		}
		theme := map[string]any{}
		if json.Unmarshal(b, &theme) != nil {
			continue
		}
		theme["_dir"] = filepath.ToSlash(filepath.Join(dir, "themes", e.Name()))
		out = append(out, theme)
	}
	return out
}

// ---------- 杂项 ----------

// RevealPath 在资源管理器中定位文件/文件夹（仅授权路径或白名单目录内）
func (f *Files) RevealPath(path string) error {
	if f.isAuthorized(path) || kfsPathAllowed(path) {
		return shellReveal(path)
	}
	return fmt.Errorf("路径未授权")
}

// AppVersion 返回应用版本号，供插件 API 判断兼容性
func (f *Files) AppVersion() string {
	return "0.2.0"
}
