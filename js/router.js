/**
 * router.js — Hash-based SPA router
 */

window.Router = (() => {
  const routes = {};
  let currentRoute = null;

  function register(name, handler) {
    routes[name] = handler;
  }

  function navigate(route, params = {}) {
    window.location.hash = route;
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('mobile-open');
    }
    render(route, params);
  }

  function render(route, params = {}) {
    // Show login if not authenticated
    const session = (typeof Auth !== 'undefined') ? Auth.getSession() : null;
    const isLoggedIn = session && session.userId && sessionStorage.getItem('bm_session');

    if (!isLoggedIn) {
      if (route === 'login') {
        if (typeof App !== 'undefined' && App.renderLogin) App.renderLogin();
        return;
      }
      if (route === 'forgot-password') {
        if (typeof App !== 'undefined' && App.renderForgotStep1) App.renderForgotStep1();
        return;
      }
      // Redirect to login for any protected route
      if (typeof App !== 'undefined' && App.renderLogin) App.renderLogin();
      return;
    }

    if (route === 'login' || route === 'forgot-password' || !route) {
      navigate('dashboard');
      return;
    }

    const handler = routes[route];
    if (handler) {
      currentRoute = route;
      handler(params);
      updateNavActive(route);
    } else {
      navigate('dashboard');
    }
  }

  function updateNavActive(route) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const base = route.split('/')[0];
    const navItem = document.querySelector(`.nav-item[data-route="${base}"]`);
    if (navItem) navItem.classList.add('active');

    // Expand Master submenu
    const masterMenu = document.getElementById('master-submenu');
    if (masterMenu) {
      if (route.startsWith('master')) {
        masterMenu.classList.add('open');
      }
    }

    // Expand Field Visit submenu
    const fieldVisitMenu = document.getElementById('field-visit-submenu');
    const fieldVisitToggle = document.getElementById('field-visit-toggle-icon');
    if (fieldVisitMenu) {
      if (route.startsWith('field-visit')) {
        fieldVisitMenu.style.maxHeight = '200px';
        if (fieldVisitToggle) fieldVisitToggle.textContent = 'expand_less';
      }
    }

    // Expand Reports submenu
    const reportsMenu = document.getElementById('reports-submenu');
    const reportsToggle = document.getElementById('reports-toggle-icon');
    if (reportsMenu) {
      if (route.startsWith('reports')) {
        reportsMenu.style.maxHeight = '200px';
        if (reportsToggle) reportsToggle.textContent = 'expand_less';
      }
    }
  }

  function init() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || '';
      render(hash);
    });

    const initial = window.location.hash.replace('#', '');
    render(initial || 'login');
  }

  return { register, navigate, render, init };
})();
