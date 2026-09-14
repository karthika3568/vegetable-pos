import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { NAVIGATION, filterNavigationByPermission } from '../../config/navigation.js';

export default function NavBar({ open, onClose }) {
  const { hasPermission } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  const sections = filterNavigationByPermission(NAVIGATION, hasPermission);
  const items = sections.flatMap((section) => section.items);
  const primaryIds = ['pos', 'sales-history', 'invoices', 'purchases', 'credit', 'products'];
  const primaryItems = items.filter((item) => primaryIds.includes(item.id));
  const secondaryItems = items.filter((item) => !primaryIds.includes(item.id));

  useEffect(() => {
    function closeOnOutside(event) {
      if (moreRef.current && !moreRef.current.contains(event.target)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  function linkClass(isActive) {
    return isActive ? 'subnav-link active' : 'subnav-link';
  }

  function renderLink(item) {
    return (
      <NavLink
        key={item.id}
        to={item.path}
        end={Boolean(item.end)}
        className={({ isActive }) => linkClass(isActive)}
        onClick={onClose}
      >
        {t(item.labelKey ?? item.id)}
      </NavLink>
    );
  }

  return (
    <nav className={open ? 'subnav open' : 'subnav'} aria-label="Module navigation">
      <div className="subnav-primary">{primaryItems.map(renderLink)}</div>
      {secondaryItems.length > 0 ? (
        <div className="subnav-more" ref={moreRef}>
          <button
            type="button"
            className={`subnav-link subnav-more-button${secondaryItems.some((item) => location.pathname === item.path) ? ' active' : ''}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((value) => !value)}
          >
            {t('nav.more')} <span aria-hidden="true">⌄</span>
          </button>
          {moreOpen ? (
            <div className="subnav-more-menu">
              {secondaryItems.map(renderLink)}
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}