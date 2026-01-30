import { build } from 'vite'
import { resolve } from 'path'

async function buildFrontend() {
  console.log('Building frontend...')
  await build({
    root: resolve(__dirname),
    build: {
      outDir: resolve(__dirname, '../src-tauri/dist'),
      emptyOutDir: true
    }
  })
  console.log('Frontend built successfully!')
}

buildFrontend().catch(console.error)
