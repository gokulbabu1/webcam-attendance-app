/**
 * auth.js — Authentication, password hashing, session management
 */

window.Auth = (() => {
  const SESSION_KEY = 'bm_session';
  const OTP_KEY = 'bm_otp_temp';

  // ── Pure-JS SHA-256 (works on file:// and https://) ──────────────────────
  // Based on the FIPS 180-4 specification — no external dependencies.

  function _sha256(message) {
    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

    function rotr(x,n){ return (x>>>n)|(x<<(32-n)); }
    function ch(x,y,z){ return (x&y)^(~x&z); }
    function maj(x,y,z){ return (x&y)^(x&z)^(y&z); }
    function sig0(x){ return rotr(x,2)^rotr(x,13)^rotr(x,22); }
    function sig1(x){ return rotr(x,6)^rotr(x,11)^rotr(x,25); }
    function gam0(x){ return rotr(x,7)^rotr(x,18)^(x>>>3); }
    function gam1(x){ return rotr(x,17)^rotr(x,19)^(x>>>10); }
    function add(a,b){ return (a+b)|0; }

    // Convert string to UTF-8 byte array without TextEncoder
    function strToBytes(str) {
      const bytes = [];
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) { bytes.push(0xC0|(c>>6)); bytes.push(0x80|(c&0x3F)); }
        else { bytes.push(0xE0|(c>>12)); bytes.push(0x80|((c>>6)&0x3F)); bytes.push(0x80|(c&0x3F)); }
      }
      return bytes;
    }
    const bytes = strToBytes(message);
    const l = bytes.length * 8;
    const padded = bytes.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    // append original length as 64-bit big-endian
    padded.push(0,0,0,0, (l/0x100000000)|0, (l>>>24)&0xff, (l>>>16)&0xff, (l>>>8)&0xff);
    padded.push(l&0xff);

    const words = [];
    for (let i=0;i<padded.length;i+=4)
      words.push((padded[i]<<24)|(padded[i+1]<<16)|(padded[i+2]<<8)|padded[i+3]);

    for (let i=0;i<words.length;i+=16) {
      const W = words.slice(i,i+16);
      for (let t=16;t<64;t++) W[t]=add(add(gam1(W[t-2]),W[t-7]),add(gam0(W[t-15]),W[t-16]));
      let [a,b,c,d,e,f,g,h] = H;
      for (let t=0;t<64;t++) {
        const T1=add(add(add(add(h,sig1(e)),ch(e,f,g)),K[t]),W[t]);
        const T2=add(sig0(a),maj(a,b,c));
        h=g;g=f;f=e;e=add(d,T1);d=c;c=b;b=a;a=add(T1,T2);
      }
      H[0]=add(H[0],a);H[1]=add(H[1],b);H[2]=add(H[2],c);H[3]=add(H[3],d);
      H[4]=add(H[4],e);H[5]=add(H[5],f);H[6]=add(H[6],g);H[7]=add(H[7],h);
    }
    return H.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
  }

  async function hashPassword(plain) {
    // Always use pure-JS SHA-256 — works on file://, http://, https://
    return _sha256(plain + 'bm_salt_2024');
  }

  // ── Session ───────────────────────────────────────────────────────────────

  function createSession(user, role) {
    const session = {
      userId: user.userId,
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      roleName: role ? role.roleName : 'User',
      expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (!s || !s.userId) return null;
      return s;
    } catch {
      return null;
    }
  }

  function updateSession() {
    const s = getSession();
    if (!s) return;
    const user = DB.Users.getById(s.userId);
    if (!user) return;
    const role = DB.Roles.getById(user.roleId);
    createSession(user, role);
    if (typeof App !== 'undefined' && App.updateHeader) {
      App.updateHeader();
    }
  }

  // Listen for changes from other tabs (Admin changing user details, etc.)
  window.addEventListener('storage', (e) => {
    if (e.key === 'bm_users' || e.key === 'bm_roles' || e.key === 'bm_locations') {
      updateSession();
      // Also refresh tables if they are visible
      if (typeof Users !== 'undefined' && Users.applyFilters && document.getElementById('user-table')) {
        Users.applyFilters();
      }
      if (typeof Locations !== 'undefined' && Locations.applyFilters && document.getElementById('loc-table')) {
        Locations.applyFilters();
      }
    }
  });

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(OTP_KEY);
  }

  function isAuthenticated() {
    return true;
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async function login(username, password) {
    if (!username || !password) {
      return { success: false, message: 'Please enter username and password.' };
    }

    const user = DB.Users.getByUsername(username);
    if (!user) {
      return { success: false, message: 'Invalid username or password.' };
    }
    if (user.status !== 'Active') {
      return { success: false, message: 'Your account is inactive. Please contact an administrator.' };
    }

    const hash = await hashPassword(password);
    if (hash !== user.passwordHash) {
      return { success: false, message: 'Invalid username or password.' };
    }

    const role = DB.Roles.getById(user.roleId);
    const session = createSession(user, role);
    return { success: true, session };
  }

  function logout() {
    clearSession();
    Router.navigate('dashboard');
  }

  // ── Forgot Password ───────────────────────────────────────────────────────

  function verifyAccount(identifier) {
    // identifier can be username or email
    const users = DB.Users.getAll();
    const user = users.find(
      u =>
        u.username.toLowerCase() === identifier.toLowerCase() ||
        u.email.toLowerCase() === identifier.toLowerCase()
    );
    if (!user) return { success: false, message: 'No account found with that username or email.' };
    if (user.status !== 'Active') return { success: false, message: 'Account is inactive.' };

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    sessionStorage.setItem(
      OTP_KEY,
      JSON.stringify({ otp, userId: user.userId, expiresAt: Date.now() + 10 * 60 * 1000 })
    );
    return { success: true, otp, user };
  }

  function verifyOtp(enteredOtp) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(OTP_KEY));
      if (!stored) return { success: false, message: 'OTP session expired. Please start over.' };
      if (Date.now() > stored.expiresAt) {
        sessionStorage.removeItem(OTP_KEY);
        return { success: false, message: 'OTP expired. Please start over.' };
      }
      if (enteredOtp.trim() !== stored.otp) {
        return { success: false, message: 'Incorrect OTP. Please try again.' };
      }
      return { success: true, userId: stored.userId };
    } catch {
      return { success: false, message: 'Invalid OTP session.' };
    }
  }

  async function resetPassword(userId, newPassword, confirmPassword) {
    if (!newPassword) return { success: false, message: 'Password cannot be empty.' };
    if (newPassword !== confirmPassword) return { success: false, message: 'Passwords do not match.' };
    if (newPassword.length < 8) return { success: false, message: 'Password must be at least 8 characters.' };

    const hash = await hashPassword(newPassword);
    const result = DB.Users.updatePassword(userId, hash);
    if (result.success) {
      sessionStorage.removeItem(OTP_KEY);
    }
    return result;
  }

  return {
    hashPassword,
    getSession,
    isAuthenticated,
    login,
    logout,
    verifyAccount,
    verifyOtp,
    resetPassword,
    updateSession,
  };
})();
