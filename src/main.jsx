import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConferenceProvider } from './lib/store.jsx';
import { Toaster } from './components/Toaster.jsx';
import { App } from './App.jsx';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Toaster>
        <ConferenceProvider>
          <App />
        </ConferenceProvider>
      </Toaster>
    </BrowserRouter>
  </StrictMode>,
);
