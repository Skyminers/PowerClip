import React from 'react'
import ReactDOM from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import App from './App'
import { initLogger } from './utils/logger'
import './index.css'

// Initialize logging system
initLogger()

// ============== Tauri Event Listener ==============
// Set up window shown listener at app startup (before React mounts)
listen('powerclip:window-shown', () => {
  window.dispatchEvent(new CustomEvent('powerclip:window-shown'))
}).catch(err => {
  console.error('[PowerClip] Failed to set up window-shown listener:', err)
})

// Set up new-item listener at module level (always active)
listen<any>('powerclip:new-item', (event) => {
  window.dispatchEvent(new CustomEvent('powerclip:new-item', { detail: event.payload }))
}).catch(err => {
  console.error('[PowerClip] Failed to set up new-item listener:', err)
})

// Set up settings-changed listener
listen('powerclip:settings-changed', () => {
  window.dispatchEvent(new CustomEvent('powerclip:settings-changed'))
}).catch(err => {
  console.error('[PowerClip] Failed to set up settings-changed listener:', err)
})

// ============== Application ==============

// Set transparent background
document.documentElement.style.backgroundColor = 'transparent'
document.body.style.backgroundColor = 'transparent'
document.documentElement.style.borderRadius = '16px'
document.body.style.borderRadius = '16px'

// Initialize React app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
