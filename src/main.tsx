import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import netlifyIdentity from 'netlify-identity-widget';
import './index.css'
import App from './App.tsx'

// Initialize Netlify Identity
// This will automatically handle login, logout, and token refresh
netlifyIdentity.init();

const rootElement = document.getElementById('root');

if (rootElement) {
    createRoot(rootElement).render(
        <StrictMode>
            <App />
        </StrictMode>,
    )
}
