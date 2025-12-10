import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.tsx'
import './index.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const isDevelopment = 
  window.location.hostname.includes('replit') || 
  window.location.hostname.includes('localhost') ||
  window.location.hostname.includes('127.0.0.1');

// Always require the key - it should be available in both dev and production
if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key - add VITE_CLERK_PUBLISHABLE_KEY to secrets')
}

// Always wrap with ClerkProvider so Clerk hooks work everywhere
// The individual components handle dev mode behavior (auto-login, bypassing auth checks)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <App />
  </ClerkProvider>,
)
