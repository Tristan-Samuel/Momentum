import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { audioEngine } from '@/audio-engine/engine';
import { ensureSeeded } from '@/database/repository';
import { startSyncEngine } from '@/sync/engine';
import { isHostedApp } from '@/sync/hosted';
import { completeWebSignIn } from '@/sync/restore';
import '@/index.css';

audioEngine.installUnlockListeners();
void ensureSeeded().then(() => {
  if (isHostedApp()) void completeWebSignIn().catch(() => undefined);
});
startSyncEngine();

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
