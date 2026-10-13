import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative assets keep the current /Calibre-v2/ preview working and also
  // allow the same build to run at app.calibreco.com.au after cutover.
  base: './',
})
