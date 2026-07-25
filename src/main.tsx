import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { subscribeToPush } from './push-subscription'
import { supabase } from './supabase'

const rootElement = document.getElementById('root');

if (rootElement) {
    createRoot(rootElement).render(
        <StrictMode>
            <App />
        </StrictMode>,
    )
}

if ('serviceWorker' in navigator && 'PushManager' in window) {
    let swRegistration: ServiceWorkerRegistration | null = null;
    let isSubscribed = false;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
        swRegistration = reg;
        trySubscribe();
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        if (session && !isSubscribed) {
            trySubscribe();
        }
    });

    async function trySubscribe() {
        if (isSubscribed) return;
        if (!swRegistration) {
            swRegistration = await navigator.serviceWorker.ready;
        }

        if (Notification.permission === 'granted') {
            isSubscribed = await subscribeToPush(swRegistration);
        } else if (Notification.permission === 'default') {
            const result = await Notification.requestPermission();
            if (result === 'granted') {
                isSubscribed = await subscribeToPush(swRegistration);
            }
        }
    }
}