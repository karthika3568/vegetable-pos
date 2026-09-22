import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { BranchProvider } from './context/BranchContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { LanguageProvider } from './i18n/index.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          {/* Branch selection only makes sense once a session exists - nested
              inside AuthProvider so it can read isAuthenticated via useAuth(). */}
          <BranchProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </BranchProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);