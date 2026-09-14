import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../i18n/index.jsx';
import { validateLogin } from '../validators/login.js';
import PageLoader from '../components/PageLoader.jsx';
import { ApiError } from '../api/client.js';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading, hasPermission } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Cashiers (and anyone allowed to sell) land directly on the POS - it
  // is the primary working screen. Users without sales.create fall back
  // to the dashboard. An explicit deep link always wins.
  function landingPath() {
    const explicit = location.state?.from?.pathname;
    if (explicit && explicit !== '/login') return explicit;
    return hasPermission('sales.create') ? '/pos' : '/';
  }

  if (isLoading) return <PageLoader label={t('common.loading')} />;
  if (isAuthenticated) return <Navigate to={landingPath()} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const errors = validateLogin({ username, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const user = await login({ username: username.trim(), password });
      const canSell = user?.isAdmin || (Array.isArray(user?.permissions) && user.permissions.includes('sales.create'));
      navigate(canSell ? '/pos' : '/', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('login.error');
      setFormError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark large" aria-hidden="true">
            V
          </span>
          <h1>{t('login.title')}</h1>
          <p>{t('login.subtitle')}</p>
        </div>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className={`form-field ${fieldErrors.username ? 'invalid' : ''}`}>
            <label htmlFor="username">{t('login.username')}</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('login.usernamePlaceholder')}
              disabled={submitting}
            />
            {fieldErrors.username ? <p className="field-error">{fieldErrors.username}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.password ? 'invalid' : ''}`}>
            <label htmlFor="password">{t('login.password')}</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              disabled={submitting}
            />
            {fieldErrors.password ? <p className="field-error">{fieldErrors.password}</p> : null}
          </div>

          {formError ? (
            <div className="form-alert" role="alert">
              {formError}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}