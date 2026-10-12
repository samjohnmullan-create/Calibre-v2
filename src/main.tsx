import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import KnowledgeRouteMount from './KnowledgeRouteMount'
import './styles.css'
import './workbench-dex.css'
import './workbench-controls.css'
import './mobile.css'
import './item-editing.css'
import './media.css'
import './passport.css'
import './passport-finder.css'
import './research.css'
import './knowledge.css'
import './theme-classic.css'
import './brand-polish.css'
import './shell-layout.css'
import './shell-chrome.css'
import './responsive-cards.css'
import './device-shell'
import './dex-scroll'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <KnowledgeRouteMount />
  </StrictMode>,
)
