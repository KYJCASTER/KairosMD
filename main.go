package main

import (
	"context"
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

// startupBackground 按配置里的主题明暗选窗口初始底色，暗色主题启动不再闪亮色
func startupBackground() *options.RGBA {
	files := NewFiles()
	if cfg, err := files.ReadConfig(); err == nil {
		if id, _ := cfg["themeId"].(string); id == "sora" || id == "sumi" {
			return &options.RGBA{R: 23, G: 21, B: 31, A: 1}
		}
	}
	// 默认主题「枫」的奶杏底色
	return &options.RGBA{R: 253, G: 248, B: 241, A: 1}
}

func main() {
	files := NewFiles()

	err := wails.Run(&options.App{
		Title:            "KairosMd",
		Width:            1180,
		Height:           800,
		MinWidth:         760,
		MinHeight:        540,
		Frameless:        true,
		BackgroundColour: startupBackground(),
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: localFileHandler(),
		},
		OnStartup: func(ctx context.Context) { files.startup(ctx) },
		OnBeforeClose: func(ctx context.Context) bool {
			return files.beforeClose(ctx)
		},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "kairosmd-single-instance",
			OnSecondInstanceLaunch: files.handleSecondInstance,
		},
		Bind:                     []interface{}{files},
		EnableDefaultContextMenu: true,
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
