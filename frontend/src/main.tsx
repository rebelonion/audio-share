import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { ToastProvider } from './contexts/ToastContext'
import { BUILD_ID } from './lib/config'
import { markPreloadRecoveryAttempt } from './lib/preloadRecovery'
import './index.css'

window.addEventListener('vite:preloadError', event => {
  event.preventDefault()
  if (markPreloadRecoveryAttempt(BUILD_ID)) {
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HelmetProvider>
  </StrictMode>,
)
