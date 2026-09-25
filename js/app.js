/**
 * app.js — Application bootstrap, navigation, notifications, layout
 */

window.App = (() => {
  // ── Layout ────────────────────────────────────────────────────────────────

  function setContent(html) {
    const el = document.getElementById('main-content');
    if (el) {
      el.innerHTML = html;
      el.scrollTop = 0;
    }
  }
  function showAppShell() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    updateHeader();
  }

  function updateHeader() {
    const session = Auth.getSession();
    if (session) {
      document.getElementById('header-username').textContent = session.fullName;
      document.getElementById('header-role').textContent = session.roleName;
      
      const user = DB.Users.getById(session.userId);
      const textSpan = document.getElementById('header-avatar-text');
      const avatarDiv = document.getElementById('header-avatar');
      
      if (user && user.photo) {
        if (textSpan) textSpan.style.display = 'none';
        avatarDiv.style.background = 'none';
        avatarDiv.style.padding = '0';
        avatarDiv.style.overflow = 'hidden';
        avatarDiv.innerHTML = `<img src="${user.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      } else {
        avatarDiv.innerHTML = '';
        avatarDiv.style.background = '';
        avatarDiv.style.padding = '';
        avatarDiv.style.overflow = '';
        if (textSpan) {
          avatarDiv.appendChild(textSpan);
          textSpan.style.display = 'inline';
          textSpan.textContent = session.fullName.charAt(0).toUpperCase();
        }
      }

      // Location Transaction menu is now visible to all users
      const navTransLoc = document.getElementById('nav-transaction-location');
      if (navTransLoc) {
        navTransLoc.style.display = 'flex';
      }
    }
  }

  function showAuthView(html) {
    document.getElementById('auth-view').innerHTML = html;
    document.getElementById('auth-view').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
  }

  // ── Header Profile ────────────────────────────────────────────────────────
  function viewCurrentUser() {
    const session = Auth.getSession();
    if (session && session.userId && typeof Users !== 'undefined' && Users.viewUser) {
      Users.viewUser(session.userId);
    }
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const shell = document.getElementById('app-shell');
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
      shell.classList.toggle('sidebar-collapsed');
    }
  }

  function toggleMasterMenu() {
    const sub = document.getElementById('master-submenu');
    const toggle = document.getElementById('master-toggle-icon');
    if (sub) {
      sub.classList.toggle('open');
      toggle && (toggle.textContent = sub.classList.contains('open') ? 'expand_less' : 'expand_more');
    }
  }

  function toggleFieldVisitMenu() {
    const sub = document.getElementById('field-visit-submenu');
    const toggle = document.getElementById('field-visit-toggle-icon');
    if (sub) {
      const isOpen = sub.style.maxHeight !== '0px' && sub.style.maxHeight !== '';
      sub.style.maxHeight = isOpen ? '0px' : '200px';
      toggle && (toggle.textContent = isOpen ? 'expand_more' : 'expand_less');
    }
  }

  function toggleReportsMenu() {
    const sub = document.getElementById('reports-submenu');
    const toggle = document.getElementById('reports-toggle-icon');
    if (sub) {
      const isOpen = sub.style.maxHeight !== '0px' && sub.style.maxHeight !== '';
      sub.style.maxHeight = isOpen ? '0px' : '200px';
      toggle && (toggle.textContent = isOpen ? 'expand_more' : 'expand_less');
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  function notify(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: 'check_circle', error: 'error', info: 'info', warning: 'warning' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="material-icons toast-icon">${icons[type] || 'info'}</span>
      <span class="toast-msg">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <span class="material-icons">close</span>
      </button>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-in'));

    setTimeout(() => {
      toast.classList.remove('toast-in');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ── Login View ────────────────────────────────────────────────────────────

  function renderLogin(errorMsg = '') {
    let savedUser = '';
    let savedPass = '';
    let checked = '';
    try {
      const saved = JSON.parse(localStorage.getItem('bm_remember'));
      if (saved && saved.u && saved.p) {
        savedUser = saved.u;
        savedPass = saved.p;
        checked = 'checked';
      }
    } catch(e) {}

    showAuthView(`
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo-icon" style="background:transparent;"><img src="logo.png" alt="Logo" style="width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));" /></div>
          <div class="logo-text">
            <span class="logo-name">Webcam</span>

          </div>
        </div>
        <h2 class="auth-title">Welcome Back</h2>
        <p class="auth-subtitle">Sign in to your account</p>

        ${errorMsg ? `<div class="alert alert-error"><span class="material-icons">error_outline</span>${errorMsg}</div>` : ''}

        <form id="login-form" onsubmit="App.handleLogin(event)" novalidate>
          <div class="form-group">
            <label for="login-username">Username</label>
            <div class="input-icon-wrap">
              <span class="input-icon material-icons">person</span>
              <input type="text" id="login-username" placeholder="Enter username" autocomplete="username" value="${savedUser}" required />
            </div>
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <div class="input-icon-wrap">
              <span class="input-icon material-icons">lock</span>
              <input type="password" id="login-password" placeholder="Enter password" autocomplete="current-password" value="${savedPass}" required />
              <button type="button" class="toggle-pwd" onclick="App.toggleLoginPwd(this)">
                <span class="material-icons">visibility</span>
              </button>
            </div>
          </div>
          <div class="auth-options">
            <label class="checkbox-label">
              <input type="checkbox" id="remember-me" ${checked} />
              <span>Remember me</span>
            </label>
            <a href="#" class="link" onclick="App.renderForgotStep1(); return false;">Forgot Password?</a>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="login-btn">
            <span class="material-icons">login</span> Sign In
          </button>
        </form>
        <p class="auth-hint">Default: <strong>admin</strong> / <strong>Admin@123</strong></p>
      </div>
    `);
    document.getElementById('login-username')?.focus();
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const rememberMe = document.getElementById('remember-me').checked;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons spin">sync</span> Signing in…';

    const result = await Auth.login(username, password);
    if (result.success) {
      if (rememberMe) {
        localStorage.setItem('bm_remember', JSON.stringify({ u: username, p: password }));
      } else {
        localStorage.removeItem('bm_remember');
      }
      showAppShell();
      Router.navigate('dashboard');
    } else {
      renderLogin(result.message);
    }
  }

  function toggleLoginPwd(btn) {
    const input = document.getElementById('login-password');
    const icon = btn.querySelector('.material-icons');
    if (input.type === 'password') { input.type = 'text'; icon.textContent = 'visibility_off'; }
    else { input.type = 'password'; icon.textContent = 'visibility'; }
  }

  // ── Forgot Password Flow ──────────────────────────────────────────────────

  function renderForgotStep1(errorMsg = '') {
    showAuthView(`
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo-icon" style="background:transparent;"><img src="logo.png" alt="Logo" style="width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));" /></div>
          <div class="logo-text">
            <span class="logo-name">Webcam</span>

          </div>
        </div>
        <h2 class="auth-title">Forgot Password</h2>
        <p class="auth-subtitle">Step 1 of 3 — Enter your username or email</p>
        <div class="step-indicator">
          <div class="step active">1</div>
          <div class="step-line"></div>
          <div class="step">2</div>
          <div class="step-line"></div>
          <div class="step">3</div>
        </div>

        ${errorMsg ? `<div class="alert alert-error"><span class="material-icons">error_outline</span>${errorMsg}</div>` : ''}

        <form onsubmit="App.handleForgotStep1(event)" novalidate>
          <div class="form-group">
            <label for="forgot-identifier">Username or Email</label>
            <div class="input-icon-wrap">
              <span class="input-icon material-icons">email</span>
              <input type="text" id="forgot-identifier" placeholder="Enter username or email" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block">
            <span class="material-icons">arrow_forward</span> Continue
          </button>
          <button type="button" class="btn btn-ghost btn-block" onclick="App.renderLogin()">
            <span class="material-icons">arrow_back</span> Back to Login
          </button>
        </form>
      </div>
    `);
    document.getElementById('forgot-identifier')?.focus();
  }

  function handleForgotStep1(e) {
    e.preventDefault();
    const identifier = document.getElementById('forgot-identifier').value.trim();
    if (!identifier) { renderForgotStep1('Please enter your username or email.'); return; }
    const result = Auth.verifyAccount(identifier);
    if (!result.success) { renderForgotStep1(result.message); return; }

    renderForgotStep2(result.userId, result.otp, result.user.fullName);
  }

  function renderForgotStep2(userId, otp, fullName, errorMsg = '') {
    showAuthView(`
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo-icon" style="background:transparent;"><img src="logo.png" alt="Logo" style="width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));" /></div>
          <div class="logo-text">
            <span class="logo-name">Webcam</span>

          </div>
        </div>
        <h2 class="auth-title">Verify OTP</h2>
        <p class="auth-subtitle">Step 2 of 3 — Enter the verification code</p>
        <div class="step-indicator">
          <div class="step done">✓</div>
          <div class="step-line active"></div>
          <div class="step active">2</div>
          <div class="step-line"></div>
          <div class="step">3</div>
        </div>

        <div class="otp-info-box">
          <span class="material-icons">mark_email_read</span>
          <div>
            <strong>OTP sent to ${fullName}</strong>
            <p>For this demo, your OTP is: <strong class="otp-display">${otp}</strong></p>
          </div>
        </div>

        ${errorMsg ? `<div class="alert alert-error"><span class="material-icons">error_outline</span>${errorMsg}</div>` : ''}

        <form onsubmit="App.handleForgotStep2(event)" novalidate>
          <div class="form-group">
            <label for="forgot-otp">6-Digit OTP</label>
            <div class="input-icon-wrap">
              <span class="input-icon material-icons">pin</span>
              <input type="text" id="forgot-otp" placeholder="Enter OTP" maxlength="6" pattern="[0-9]{6}" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block">
            <span class="material-icons">arrow_forward</span> Verify OTP
          </button>
          <button type="button" class="btn btn-ghost btn-block" onclick="App.renderForgotStep1()">
            <span class="material-icons">arrow_back</span> Back
          </button>
        </form>
      </div>
    `);
    document.getElementById('forgot-otp')?.focus();
  }

  function handleForgotStep2(e) {
    e.preventDefault();
    const otp = document.getElementById('forgot-otp').value.trim();
    const result = Auth.verifyOtp(otp);
    if (!result.success) {
      // Re-render with error (otp is already stored in sessionStorage)
      const otpData = JSON.parse(sessionStorage.getItem('bm_otp_temp') || '{}');
      renderForgotStep2(result.userId || '', otpData.otp || '', '', result.message);
      return;
    }
    renderForgotStep3(result.userId);
  }

  function renderForgotStep3(userId, errorMsg = '') {
    showAuthView(`
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo-icon" style="background:transparent;"><img src="logo.png" alt="Logo" style="width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));" /></div>
          <div class="logo-text">
            <span class="logo-name">Webcam</span>

          </div>
        </div>
        <h2 class="auth-title">Reset Password</h2>
        <p class="auth-subtitle">Step 3 of 3 — Create a new password</p>
        <div class="step-indicator">
          <div class="step done">✓</div>
          <div class="step-line active"></div>
          <div class="step done">✓</div>
          <div class="step-line active"></div>
          <div class="step active">3</div>
        </div>

        ${errorMsg ? `<div class="alert alert-error"><span class="material-icons">error_outline</span>${errorMsg}</div>` : ''}

        <form onsubmit="App.handleForgotStep3(event, '${userId}')" novalidate>
          <div class="form-group">
            <label for="new-pwd">New Password</label>
            <div class="input-icon-wrap">
              <span class="input-icon material-icons">lock</span>
              <input type="password" id="new-pwd" placeholder="Min. 8 characters" required />
              <button type="button" class="toggle-pwd" onclick="App.toggleForgotPwd('new-pwd', this)">
                <span class="material-icons">visibility</span>
              </button>
            </div>
          </div>
          <div class="form-group">
            <label for="confirm-new-pwd">Confirm New Password</label>
            <div class="input-icon-wrap">
              <span class="input-icon material-icons">lock_reset</span>
              <input type="password" id="confirm-new-pwd" placeholder="Re-enter new password" required />
              <button type="button" class="toggle-pwd" onclick="App.toggleForgotPwd('confirm-new-pwd', this)">
                <span class="material-icons">visibility</span>
              </button>
            </div>
          </div>
          <input type="hidden" id="reset-user-id" value="${userId}" />
          <button type="submit" class="btn btn-primary btn-block">
            <span class="material-icons">lock_reset</span> Reset Password
          </button>
        </form>
      </div>
    `);
    document.getElementById('new-pwd')?.focus();
  }

  async function handleForgotStep3(e, userId) {
    e.preventDefault();
    const newPwd = document.getElementById('new-pwd').value;
    const confirmPwd = document.getElementById('confirm-new-pwd').value;
    const result = await Auth.resetPassword(userId, newPwd, confirmPwd);
    if (!result.success) { renderForgotStep3(userId, result.message || 'Failed to reset password.'); return; }
    showAuthView(`
      <div class="auth-card text-center">
        <div class="success-icon"><span class="material-icons">check_circle</span></div>
        <h2 class="auth-title">Password Reset!</h2>
        <p class="auth-subtitle">Your password has been updated successfully.</p>
        <button class="btn btn-primary btn-block" onclick="App.renderLogin()">
          <span class="material-icons">login</span> Back to Login
        </button>
      </div>
    `);
  }

  function toggleForgotPwd(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('.material-icons');
    if (input.type === 'password') { input.type = 'text'; icon.textContent = 'visibility_off'; }
    else { input.type = 'password'; icon.textContent = 'visibility'; }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    // Register routes
    Router.register('login', () => Router.navigate('dashboard'));
    Router.register('forgot-password', () => Router.navigate('dashboard'));
    Router.register('dashboard', () => { showAppShell(); Dashboard.render(); });
    Router.register('master/users', () => { showAppShell(); Users.render(); });
    
    // Field Visit (Transaction)
    Router.register('field-visit/checkin', () => { showAppShell(); Checkin.render(); });
    Router.register('field-visit/locations', () => { showAppShell(); Locations.render(); });

    // Reports Route
    Router.register('reports/attendance', () => { showAppShell(); Report.render(); });

    // Always reseed credentials to keep usernames/passwords up to date
    await DB.seed();

    // Hook to clear cameras / map state on navigation
    window.addEventListener('hashchange', () => {
      if (typeof Checkin !== 'undefined' && Checkin.cleanup) {
        Checkin.cleanup();
      }
      if (typeof History !== 'undefined' && History.cleanup) {
        History.cleanup();
      }
    });

    // Start router
    Router.init();
  }

  return {
    setContent, showAppShell, showAuthView, notify,
    renderLogin, handleLogin, toggleLoginPwd,
    renderForgotStep1, handleForgotStep1,
    renderForgotStep2, handleForgotStep2,
    renderForgotStep3, handleForgotStep3, toggleForgotPwd,
    toggleSidebar, toggleMasterMenu, toggleFieldVisitMenu, toggleReportsMenu, viewCurrentUser, updateHeader,
    init,
  };
})();

window.addEventListener('DOMContentLoaded', () => App.init());
