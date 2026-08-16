/**
 * v2 → v3 绑定兼容层：保持旧的导入路径与具名导出签名，内部转发到 v3 生成的绑定。
 * v3 生成的 .js 无声明文件，此处手工补类型。
 */
// @ts-ignore v3 生成的绑定是 JSDoc 注释的 .js，无 .d.ts
import { Files as FilesBinding } from '../../../bindings/kairosmd'

/** v3 绑定序列化用 Go 的 json tag（小写字段名） */
export interface ExternalPluginBinding {
  id: string
  manifest: Record<string, unknown>
  hasMain: boolean
}

export interface DraftInfoBinding {
  for: string
  name: string
  content: string
  t: number
}

export const AppVersion = (): Promise<string> => FilesBinding.AppVersion() as Promise<string>
export const AllowDir = (arg1: string): Promise<void> => FilesBinding.AllowDir(arg1) as Promise<void>
export const AuthorizePath = (arg1: string): Promise<void> => FilesBinding.AuthorizePath(arg1) as Promise<void>
export const ConfigDir = (): Promise<string> => FilesBinding.ConfigDir() as Promise<string>
export const DeleteDraft = (arg1: string): Promise<void> => FilesBinding.DeleteDraft(arg1) as Promise<void>
export const InitialFile = (): Promise<string> => FilesBinding.InitialFile() as Promise<string>
export const ListExternalPlugins = (): Promise<ExternalPluginBinding[]> =>
  FilesBinding.ListExternalPlugins() as Promise<ExternalPluginBinding[]>
export const ListUserThemes = (): Promise<Array<Record<string, unknown>>> =>
  FilesBinding.ListUserThemes() as Promise<Array<Record<string, unknown>>>
export const LoadDraft = (arg1: string): Promise<DraftInfoBinding | null> =>
  FilesBinding.LoadDraft(arg1) as Promise<DraftInfoBinding | null>
export const MarkFrontendReady = (): Promise<string[]> =>
  FilesBinding.MarkFrontendReady() as Promise<string[]>
export const OpenNewWindow = (arg1: string): Promise<void> =>
  FilesBinding.OpenNewWindow(arg1) as Promise<void>
export const PickFile = (): Promise<string> => FilesBinding.PickFile() as Promise<string>
export const QuitApp = (): Promise<void> => FilesBinding.QuitApp() as Promise<void>
export const ReadConfig = (): Promise<Record<string, unknown>> =>
  FilesBinding.ReadConfig() as Promise<Record<string, unknown>>
export const ReadFile = (arg1: string): Promise<string> => FilesBinding.ReadFile(arg1) as Promise<string>
export const ReadPluginCode = (arg1: string): Promise<string> =>
  FilesBinding.ReadPluginCode(arg1) as Promise<string>
export const RevealPath = (arg1: string): Promise<void> => FilesBinding.RevealPath(arg1) as Promise<void>
export const SaveAsPath = (arg1: string): Promise<string> => FilesBinding.SaveAsPath(arg1) as Promise<string>
export const SaveClipboardImage = (arg1: string, arg2: string, arg3: string): Promise<string> =>
  FilesBinding.SaveClipboardImage(arg1, arg2, arg3) as Promise<string>
export const SaveConfig = (arg1: Record<string, unknown>): Promise<void> =>
  FilesBinding.SaveConfig(arg1) as Promise<void>
export const SaveDraft = (arg1: string, arg2: string, arg3: string): Promise<void> =>
  FilesBinding.SaveDraft(arg1, arg2, arg3) as Promise<void>
export const SaveHtmlPath = (arg1: string): Promise<string> =>
  FilesBinding.SaveHtmlPath(arg1) as Promise<string>
export const WriteFile = (arg1: string, arg2: string): Promise<void> =>
  FilesBinding.WriteFile(arg1, arg2) as Promise<void>
