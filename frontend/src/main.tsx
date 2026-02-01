import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 强制设置透明背景
document.documentElement.style.backgroundColor = 'transparent'
document.body.style.backgroundColor = 'transparent'
document.documentElement.style.borderRadius = '16px'
document.body.style.borderRadius = '16px'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Tauri 快捷键监听
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close()
  }
})

// 暴露复制函数给 Rust 后端调用
(window as any).copyToSystemClipboard = (content: string) => {
  navigator.clipboard.writeText(content).catch(console.error)
}
