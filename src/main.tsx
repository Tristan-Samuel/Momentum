import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { audioEngine } from '@/audio-engine/engine';
import { ensureSeeded } from '@/database/repository';
import '@/index.css';

audioEngine.installUnlockListeners();
void ensureSeeded();

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
