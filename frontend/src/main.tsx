import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { ToastProvider } from './contexts/ToastContext'
import { BUILD_ID } from './lib/config'
import { markPreloadRecoveryAttempt } from './lib/preloadRecovery'
import { detectAdBlocking } from './lib/adBlockProbe'
import { setRybbitAdBlockTraits } from './lib/rybbitIdentity'
import './index.css'

window.addEventListener('vite:preloadError', event => {
  event.preventDefault()
  if (markPreloadRecoveryAttempt(BUILD_ID)) {
    window.location.reload()
  }
})

void detectAdBlocking()
  .then(result => setRybbitAdBlockTraits(result.status, result.adDeliveryStatus))

const rootElement = document.getElementById('root')!
rootElement.replaceChildren()

createRoot(rootElement).render(
  <StrictMode>
    <HelmetProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HelmetProvider>
  </StrictMode>,
)
