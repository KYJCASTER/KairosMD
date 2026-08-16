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
}

func NewFiles() *Files { return &Files{} }

// ServiceStartup 服务启动钩子：捕获命令行文件参数并清理过期草稿
func (f *Files) ServiceStartup(_ context.Context, _ application.ServiceOptions) error {
	f.mu.Lock()
	f.app = application.Get()
	f.initialPath = firstMarkdownArg(os.Args[1:])
	f.mu.Unlock()
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
	return application.Get().Dialog.OpenFile().
		SetTitle("打开 Markdown 文件").
		AddFilter("Markdown (*.md;*.markdown;*.mdx;*.txt)", "*.md;*.markdown;*.mdx;*.txt").
		PromptForSingleSelection()
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
	return d.PromptForSingleSelection()
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
	return d.PromptForSingleSelection()
}

// ---------- 读取 ----------

// ReadFile 读取文件内容（限制 16MB）；UTF-8 优先，旧中文文档回退 GB18030 解码
func (f *Files) ReadFile(path string) (string, error) {
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

// WriteFile 保存文件内容
func (f *Files) WriteFile(path, content string) error {
	return os.WriteFile(path, []byte(content), 0o644)
}

// SaveClipboardImage 把 base64 图片写入 dir/name（自动建目录），返回完整路径
func (f *Files) SaveClipboardImage(dir, name, b64 string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, data, 0o644); err != nil {
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

func (f *Files) SaveConfig(cfg map[string]any) error {
	dir, err := f.ConfigDir()
	if err != nil {
		return err
	}
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "config.json"), b, 0o644)
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
	return os.WriteFile(p, b, 0o644)
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

// RevealPath 在资源管理器中定位文件/文件夹
func (f *Files) RevealPath(path string) error {
	return shellReveal(path)
}

// AppVersion 返回应用版本号，供插件 API 判断兼容性
func (f *Files) AppVersion() string {
	return "0.2.0"
}
