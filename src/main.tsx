import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './AppV3'
import './styles.css'
import './workbench-dex.css'
import './workbench-controls.css'
import './mobile.css'
import './item-editing.css'
import './dex-scroll'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
