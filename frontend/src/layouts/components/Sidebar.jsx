import { NavLink } from 'react-router-dom';
import { NAVIGATION, filterNavigationByPermission } from '../../config/navigation.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';

function NavItem({ item, onNavigate }) {
  const { t } = useLanguage();
  const label = t(item.labelKey ?? item.id);
  const Icon = item.icon;

  return (
    <li>
      <NavLink
        to={item.path}
        end={Boolean(item.end)}
        className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        onClick={onNavigate}
        title={label}
      >
        <span className="nav-icon" aria-hidden="true">
          {Icon ? <Icon size={16} /> : null}
        </span>
        <span className="nav-label">{label}</span>
      </NavLink>
    </li>
  );
}

export default function Sidebar({ open, collapsed = false, onClose }) {
  const { hasPermission } = useAuth();
  const { t } = useLanguage();
  const sections = filterNavigationByPermission(NAVIGATION, hasPermission);

  return (
    <>
      <div
        className={open ? 'sidebar-backdrop show' : 'sidebar-backdrop'}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <div className="brand-text">
            <strong>{t('common.appName')}</strong>
            <span>{t('common.appTitle')}</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {sections.map((section) => (
            <div className="nav-section" key={section.id}>
              <p className="nav-section-label">{t(section.labelKey ?? section.id)}</p>
              <ul className="nav-list">
                {section.items.map((item) => (
                  <NavItem key={item.id} item={item} onNavigate={onClose} />
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}