/**
 * 设置对话框组件
 */

import { useState } from 'react'
import type { Settings, Extension } from '../types'
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
            <span>自动粘贴</span>
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

        {/* 扩展管理 */}
        <ExtensionManager
          extensions={settings.extensions}
          onChange={(extensions) => {
            const newSettings = { ...settings, extensions }
            onUpdateSettings(newSettings)
            onSaveSettings(newSettings)
          }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// 扩展管理子组件
// ============================================================================

function ExtensionManager({
  extensions,
  onChange,
}: {
  extensions: Extension[]
  onChange: (extensions: Extension[]) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [form, setForm] = useState<Extension>({
    name: '',
    command: '',
    timeout: -1,
    close_on_success: true,
  })

  const resetForm = () => {
    setForm({ name: '', command: '', timeout: -1, close_on_success: true })
    setShowForm(false)
    setEditIndex(null)
  }

  const handleSave = () => {
    if (!form.name.trim() || !form.command.trim()) return
    const trimmed = { ...form, name: form.name.trim(), command: form.command.trim() }

    if (editIndex !== null) {
      const updated = [...extensions]
      updated[editIndex] = trimmed
      onChange(updated)
    } else {
      onChange([...extensions, trimmed])
    }
    resetForm()
  }

  const handleEdit = (index: number) => {
    setForm(extensions[index])
    setEditIndex(index)
    setShowForm(true)
  }

  const handleDelete = (index: number) => {
    onChange(extensions.filter((_, i) => i !== index))
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm" style={{ color: colors.textMuted }}>扩展 (Tab 键触发)</label>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
          >
            + 添加
          </button>
        )}
      </div>

      {/* 已有扩展列表 */}
      {extensions.length > 0 && (
        <div className="space-y-1 mb-2">
          {extensions.map((ext, index) => (
            <div
              key={index}
              className="flex items-center justify-between px-3 py-1.5 rounded text-sm bg-white/5"
            >
              <div className="flex-1 min-w-0">
                <span className="truncate block">{ext.name}</span>
                <span className="text-xs truncate block" style={{ color: colors.textMuted }}>{ext.command}</span>
              </div>
              <div className="flex gap-1 flex-shrink-0 ml-2">
                <button
                  onClick={() => handleEdit(index)}
                  className="p-1 rounded hover:bg-white/10"
                  title="编辑"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(index)}
                  className="p-1 rounded hover:bg-white/10"
                  title="删除"
                  style={{ color: '#f38ba8' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加/编辑表单 */}
      {showForm && (
        <div className="p-3 rounded bg-white/5 space-y-2">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="扩展名称"
            className="w-full px-3 py-1.5 rounded bg-white/10 border-none outline-none text-sm focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            placeholder="命令 (例: pbcopy, cat > /tmp/out.txt)"
            className="w-full px-3 py-1.5 rounded bg-white/10 border-none outline-none text-sm focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: colors.textMuted }}>超时 (ms)</label>
              <select
                value={form.timeout}
                onChange={(e) => setForm({ ...form, timeout: parseInt(e.target.value) })}
                className="w-full px-3 py-1.5 rounded bg-white/10 border-none outline-none text-sm"
              >
                <option value={-1}>等待完成</option>
                <option value={0}>不等待</option>
                <option value={3000}>3秒</option>
                <option value={5000}>5秒</option>
                <option value={10000}>10秒</option>
                <option value={30000}>30秒</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={form.close_on_success}
                  onChange={(e) => setForm({ ...form, close_on_success: e.target.checked })}
                  className="w-3.5 h-3.5 rounded"
                />
                <span>成功后关闭</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || !form.command.trim()}
              className="px-3 py-1 rounded text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
            >
              {editIndex !== null ? '保存' : '添加'}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1 rounded text-sm bg-white/10 hover:bg-white/20"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {extensions.length === 0 && !showForm && (
        <p className="text-xs" style={{ color: colors.textMuted }}>
          选中项目后按 Tab 键可运行扩展命令
        </p>
      )}
    </div>
  )
}
