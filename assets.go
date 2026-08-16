package main

import (
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// 本地资源白名单：Markdown 里引用的相对路径图片/媒体通过 /kfs?path=<绝对路径> 提供，
// 避免 WebView 无法直接加载 file:// 的问题
var assetExts = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".svg":  "image/svg+xml",
	".bmp":  "image/bmp",
	".ico":  "image/x-icon",
	".avif": "image/avif",
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".mp3":  "audio/mpeg",
	".wav":  "audio/wav",
	".ogg":  "audio/ogg",
}

// localFileHandler 处理 /kfs?path=... 请求，从磁盘流式返回白名单内的媒体文件
// 独立函数而非 Files 方法，避免被 Wails 绑定暴露给前端
func localFileHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimSuffix(r.URL.Path, "/") != "/kfs" {
			http.NotFound(w, r)
			return
		}
		p := r.URL.Query().Get("path")
		if p == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}
		p = filepath.Clean(p)
		ct, ok := assetExts[strings.ToLower(filepath.Ext(p))]
		if !ok {
			http.Error(w, "file type not allowed", http.StatusForbidden)
			return
		}
		file, err := os.Open(p)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		defer file.Close()
		st, err := file.Stat()
		if err != nil || st.IsDir() {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, st.Name(), st.ModTime(), file)
	})
}

// shellReveal 在 Windows 资源管理器中定位路径
func shellReveal(path string) error {
	_, err := os.Stat(path)
	if err != nil {
		return err
	}
	return exec.Command("explorer", "/select,", path).Start()
}
