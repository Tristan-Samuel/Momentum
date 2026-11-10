import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { audioEngine } from '@/audio-engine/engine';
import { ensureSeeded } from '@/database/repository';
import { startSyncEngine } from '@/sync/engine';
import '@/index.css';

audioEngine.installUnlockListeners();
void ensureSeeded();
startSyncEngine();

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
