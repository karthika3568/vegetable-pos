import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';

export default function MainLayout() {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 1024px)').matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)');
    const onMediaChange = (event) => setIsMobile(event.matches);
    mediaQuery.addEventListener('change', onMediaChange);
    return () => mediaQuery.removeEventListener('change', onMediaChange);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    if (isMobile) {
      setSidebarCollapsed(false);
    }
  }, [isMobile, location.pathname]);

  const menuOpen = isMobile ? mobileNavOpen : !sidebarCollapsed;

  const toggleNavigation = useCallback(() => {
    if (isMobile) {
      setMobileNavOpen((open) => !open);
      return;
    }

    setSidebarCollapsed((collapsed) => !collapsed);
  }, [isMobile]);

  // Accept an optional explicit open/closed value from Header (keyboard handler)
  // If `next` is boolean, set the mobile nav (on mobile) or collapsed state (desktop)
  const toggleNavigationExplicit = useCallback((next) => {
    if (typeof next === 'boolean') {
      if (isMobile) {
        setMobileNavOpen(Boolean(next));
        return;
      }
      setSidebarCollapsed(Boolean(!next));
      return;
    }

    // fallback to normal toggle behavior
    if (isMobile) {
      setMobileNavOpen((open) => !open);
      return;
    }
    setSidebarCollapsed((collapsed) => !collapsed);
  }, [isMobile]);

  const closeNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="app-shell">
      <Sidebar
        open={isMobile ? mobileNavOpen : true}
        collapsed={sidebarCollapsed}
        onClose={closeNav}
      />

      <div className={sidebarCollapsed ? 'app-content sidebar-collapsed' : 'app-content'}>
        <Header menuOpen={menuOpen} onMenuToggle={toggleNavigationExplicit} isPos={false} isMobile={isMobile} />

        <div className="app-main">
          <main className="page-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}