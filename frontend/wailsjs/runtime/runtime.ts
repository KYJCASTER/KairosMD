/**
 * v2 → v3 runtime 兼容层：保持旧的导入路径与函数签名，内部转发到 @wailsio/runtime。
 * v3 事件回调参数是 WailsEvent（数据在 .data），这里解包成 v2 的直接传参。
 */
import { Window, Application, Browser, Events } from '@wailsio/runtime'

export function WindowSetTitle(title: string): void {
  void Window.SetTitle(title)
}

export function WindowMinimise(): void {
  void Window.Minimise()
}

export function WindowToggleMaximise(): void {
  void Window.ToggleMaximise()
}

export function Quit(): void {
  void Application.Quit()
}

export function BrowserOpenURL(url: string): void {
  void Browser.OpenURL(url)
}

export function EventsOn(name: string, callback: (...data: unknown[]) => void): () => void {
  return Events.On(name as never, (ev: { data?: unknown }) => callback(ev?.data))
}
