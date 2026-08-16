package main

import (
	"embed"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

// singleInstanceId 主窗口共用一个锁（双击文件转发到已有窗口）；--multi 拆出的新窗口各自独立
func singleInstanceId() string {
	if IsMultiWindow() {
		return fmt.Sprintf("kairosmd-window-%d", os.Getpid())
	}
	return "kairosmd-single-instance"
}

// startupBackground 按配置里的主题明暗选窗口初始底色，暗色主题启动不再闪亮色
func startupBackground() application.RGBA {
	files := NewFiles()
	if cfg, err := files.ReadConfig(); err == nil {
		if id, _ := cfg["themeId"].(string); id == "sora" || id == "sumi" {
			return application.NewRGB(23, 21, 31)
		}
	}
	// 默认主题「枫」的奶杏底色
	return application.NewRGB(253, 248, 241)
}

// withCSP 为所有响应注入内容安全策略（S5 纵深防御）：
// 阻止内联事件处理器（XSS 主要向量）与外部脚本。
// 'unsafe-eval' 仅为插件系统（new Function 执行 main.js）保留；不包含 'unsafe-inline'。
func withCSP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https:; "+
				"style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; "+
				"script-src 'self' 'unsafe-eval'; frame-src 'none'; object-src 'none'")
		next.ServeHTTP(w, r)
	})
}

// assetHandler 组合 /kfs 本地媒体服务与前端资产服务
func assetHandler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/kfs", localFileHandler())
	mux.Handle("/", application.AssetFileServerFS(assets))
	return withCSP(mux)
}

func main() {
	files := NewFiles()

	app := application.New(application.Options{
		Name:        "KairosMd",
		Description: "极简 Markdown 阅读器",
		Services: []application.Service{
			application.NewService(files),
		},
		Assets: application.AssetOptions{
			Handler: assetHandler(),
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID:               singleInstanceId(),
			OnSecondInstanceLaunch: files.handleSecondInstance,
		},
	})

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "KairosMd",
		Width:            1180,
		Height:           800,
		MinWidth:         760,
		MinHeight:        540,
		Frameless:        true,
		BackgroundColour: startupBackground(),
		URL:              "/",
	})

	// 系统关闭（Alt+F4 / 任务栏）：转发给前端做未保存确认；前端确认后经 QuitApp → 直接关窗
	win.OnWindowEvent(events.Common.WindowClosing, func(e *application.WindowEvent) {
		files.handleWindowClosing(win, e)
	})

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
