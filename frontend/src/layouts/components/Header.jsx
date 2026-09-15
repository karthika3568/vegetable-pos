import { useEffect } from 'react';
import { FiLogOut, FiMenu } from 'react-icons/fi';
import { useLocation } from 'react-router-dom';
import { NAVIGATION } from '../../config/navigation.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';

export default function Header({ menuOpen, onMenuToggle, isPos = false, isMobile = false }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (onMenuToggle && menuOpen) onMenuToggle(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, onMenuToggle]);

  const allItems = NAVIGATION.flatMap((section) => section.items);
  const pageTitle =
    allItems.find((item) => location.pathname === item.path)?.labelKey
      ? t(allItems.find((item) => location.pathname === item.path).labelKey)
      : 'Dashboard';

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : (user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <header className={`app-header topnav${isPos ? ' is-pos-header' : ''}`}>
      <div className="header-left">
        <button
          type="button"
          className="icon-btn menu-btn"
          onClick={onMenuToggle}
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          title={isMobile ? (menuOpen ? 'Close navigation' : 'Open navigation') : menuOpen ? 'Collapse navigation' : 'Expand navigation'}
        >
          <FiMenu size={18} />
        </button>

        <div className="topnav-brand">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <span className="shop-name">{t('common.appName')}</span>
        </div>
      </div>

      <div className="header-right">
        <div className="page-title-pill">{pageTitle}</div>

        <div className="user-chip" title={`${user?.fullName || user?.username} · ${user?.roleName || ''}`}>
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="user-meta">
            <span className="user-name">{user?.fullName || user?.username}</span>
            <span className="user-role">{user?.roleName}</span>
          </div>
        </div>

        <button type="button" className="btn btn-outline btn-logout" onClick={() => logout()}>
          <FiLogOut size={15} />
          {t('login.signOut')}
        </button>
      </div>
    </header>
  );
}