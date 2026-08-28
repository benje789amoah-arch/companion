import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {IntentProvider} from './intent';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Above `App` rather than inside it: the Paystack return branch replaces
        the whole page and returns before any of the marketing sections render,
        and a provider below that early return would not exist for them. */}
    <IntentProvider>
      <App />
    </IntentProvider>
  </StrictMode>,
);
