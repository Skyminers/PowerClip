/**
 * 设置对话框组件
 */

import type { Settings } from '../types'
import { theme } from '../theme'

const colors = theme.colors

export function SettingsDialog({
  settings,
  recordingHotkey,
  onClose,
  onUpdateSettings,
  onSaveSettings,
  onStartRecordingHotkey
}: {
  settings: Settings
  recordingHotkey: boolean
  onClose: () => void
  onUpdateSettings: (settings: Settings) => void
  onSaveSettings: (settings: Settings) => void
  onStartRecordingHotkey: () => void
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-96 max-h-[90vh] overflow-y-auto p-4 rounded-lg shadow-xl" style={{ backgroundColor: colors.bgSecondary }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">设置</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 自动清理开关 - checkbox 立即保存 */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.auto_cleanup_enabled}
              onChange={(e) => {
                const newSettings = { ...settings, auto_cleanup_enabled: e.target.checked }
                onUpdateSettings(newSettings)
                onSaveSettings(newSettings)
              }}
              className="w-4 h-4 rounded"
            />
            <span>自动清理旧记录</span>
          </label>
        </div>

        {/* 最大保存条数 - 失去焦点时保存 */}
        <div className="mb-4">
          <label className="block text-sm mb-1" style={{ color: colors.textMuted }}>最大保存条数</label>
          <input
            type="number"
            value={settings.max_items}
            onChange={(e) => onUpdateSettings({ ...settings, max_items: parseInt(e.target.value) || 100 })}
            onBlur={(e) => onSaveSettings({ ...settings, max_items: parseInt(e.target.value) || 100 })}
            disabled={!settings.auto_cleanup_enabled}
            min={1}
            max={10000}
            className="w-full px-3 py-1.5 rounded bg-white/10 border-none outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        {/* 窗口透明度 - 拖动结束时保存 */}
        <div className="mb-4">
          <label className="block text-sm mb-1" style={{ color: colors.textMuted }}>
            窗口透明度: {Math.round(settings.window_opacity * 100)}%
          </label>
          <input
            type="range"
            value={settings.window_opacity}
            onChange={(e) => onUpdateSettings({ ...settings, window_opacity: parseFloat(e.target.value) })}
            onMouseUp={(e) => onSaveSettings({ ...settings, window_opacity: parseFloat((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => onSaveSettings({ ...settings, window_opacity: parseFloat((e.target as HTMLInputElement).value) })}
            min={0.5}
            max={1.0}
            step={0.05}
            className="w-full"
          />
        </div>

        {/* 自动粘贴开关 */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.auto_paste_enabled}
              onChange={(e) => {
                const newSettings = { ...settings, auto_paste_enabled: e.target.checked }
                onUpdateSettings(newSettings)
                onSaveSettings(newSettings)
              }}
              className="w-4 h-4 rounded"
            />
            <span>选择后自动粘贴</span>
          </label>
          <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
            启用后，选择项目时会自动复制并粘贴到当前位置
          </p>
        </div>

        {/* 快捷键设置 */}
        <div className="mb-4">
          <label className="block text-sm mb-1" style={{ color: colors.textMuted }}>唤起窗口快捷键</label>
          <button
            onClick={onStartRecordingHotkey}
            className={`w-full px-3 py-1.5 rounded text-sm ${
              recordingHotkey ? 'bg-blue-500 ring-2 ring-blue-300' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {recordingHotkey ? '按下快捷键...' : `${settings.hotkey_modifiers}+${settings.hotkey_key.replace('Key', '')}`}
          </button>
        </div>
      </div>
    </div>
  )
}
