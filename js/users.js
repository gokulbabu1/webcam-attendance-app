/**
 * users.js — User Master CRUD view
 */

window.Users = (() => {
  let currentPage = 1;
  const pageSize = 10;
  let filteredData = [];
  let currentPhotoBase64 = null;
  let usrMap = null;
  let usrMarker = null;

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function render() {
    const roles = DB.Roles.getAll();
    const roleOptions = roles.map(r => `<option value="${r.roleId}">${r.roleName}</option>`).join('');
    
    const locations = DB.Locations.getActive();
    const locOptions = locations.map(l => `<option value="${l.locationId}">${l.locationName}</option>`).join('');
    
    const session = Auth.getSession();
    const isAdmin = session && session.roleId === 'role-admin';

    App.setContent(`
      <div class="page-header">
        <div>
          <h1 class="page-title">User Master</h1>
          <p class="page-subtitle">Manage user accounts and permissions</p>
        </div>
        ${isAdmin ? `
        <button class="btn btn-primary" onclick="Users.openForm()">
          <span class="material-icons">person_add</span> Add User
        </button>` : ''}
      </div>

      <div class="card">
        <div class="card-toolbar">
          <div class="search-box">
            <span class="material-icons">search</span>
            <input type="text" id="usr-search" placeholder="Search users…" oninput="Users.applyFilters()" />
          </div>
          <div class="filter-group">
            <select id="usr-status-filter" onchange="Users.applyFilters()">
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <select id="usr-role-filter" onchange="Users.applyFilters()">
              <option value="">All Roles</option>
              ${roleOptions}
            </select>
          </div>
          <span id="usr-count" class="record-count"></span>
        </div>

        <div class="table-wrapper">
          <table class="data-table" id="usr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>User ID</th>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Role</th>
                <th>Location</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="usr-tbody"></tbody>
          </table>
        </div>
        <div class="table-footer">
          <div id="usr-pagination" class="pagination"></div>
        </div>
      </div>

      <!-- User Form Modal -->
      <div class="modal-overlay" id="usr-modal" style="display:none">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h2 id="usr-modal-title">Add User</h2>
            <button class="modal-close" onclick="Users.closeForm()">
              <span class="material-icons">close</span>
            </button>
          </div>
          <div class="modal-body">
            <form id="usr-form" onsubmit="Users.saveForm(event)" novalidate>
              <input type="hidden" id="usr-id" />
              <div class="form-section-title">Account Information</div>
              <div class="form-grid">
                <div class="form-group">
                  <label for="usr-usercode">Employee ID <span class="req">*</span></label>
                  <div class="input-icon-wrap">
                    <input type="text" id="usr-usercode" placeholder="e.g. EMP-001" required />
                  </div>
                </div>
                <div class="form-group">
                  <label for="usr-username">Username <span class="req">*</span></label>
                  <input type="text" id="usr-username" placeholder="e.g. john.doe" maxlength="50" required />
                  <span class="field-error" id="err-usr-username"></span>
                </div>
                <div class="form-group">
                  <label for="usr-fullname">Full Name <span class="req">*</span></label>
                  <input type="text" id="usr-fullname" placeholder="e.g. John Doe" maxlength="100" required />
                  <span class="field-error" id="err-usr-fullname"></span>
                </div>
                <div class="form-group">
                  <label for="usr-email">Email</label>
                  <input type="email" id="usr-email" placeholder="john@example.com" maxlength="150" />
                  <span class="field-error" id="err-usr-email"></span>
                </div>
                <div class="form-group">
                  <label for="usr-mobile">Mobile Number</label>
                  <input type="tel" id="usr-mobile" placeholder="e.g. 9876543210" maxlength="15" />
                </div>
                <div class="form-group">
                  <label for="usr-photo">Employee Photo</label>
                  <input type="file" id="usr-photo" accept="image/*" onchange="Users.handlePhotoUpload(this)" style="font-size:13px;" />
                  <p style="font-size:11px; color:var(--warning); margin-top:4px;">
                    <span class="material-icons" style="font-size:12px; vertical-align:middle;">face</span> 
                    <strong>Important:</strong> Ensure the face is clearly visible. This photo will be used for AI Face Match during Check-In.
                  </p>
                  <input type="hidden" id="user-photo-base64" value="" />
                  <div id="usr-photo-preview-container" style="margin-top:10px; display:none; align-items:center; gap:10px;">
                    <img id="usr-photo-preview" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid var(--primary);" />
                    <button type="button" class="btn btn-ghost btn-sm" onclick="Users.clearPhoto()">Clear Photo</button>
                  </div>
                </div>
              </div>

              <div class="form-section-title" id="pwd-section-title">Password</div>
              <div class="form-grid" id="pwd-section">
                <div class="form-group">
                  <label for="usr-password">Password <span class="req" id="pwd-req-star">*</span></label>
                  <div class="input-icon-wrap">
                    <input type="password" id="usr-password" placeholder="Min. 8 characters" oninput="Users.checkStrength()" />
                    <button type="button" class="toggle-pwd" onclick="Users.togglePwd('usr-password', this)">
                      <span class="material-icons">visibility</span>
                    </button>
                  </div>
                  <div class="strength-meter" id="strength-meter" style="display:none">
                    <div class="strength-bar">
                      <div id="strength-fill"></div>
                    </div>
                    <small id="strength-label"></small>
                  </div>
                  <span class="field-error" id="err-usr-password"></span>
                </div>
                <div class="form-group">
                  <label for="usr-confirm-pwd">Confirm Password <span class="req" id="cpwd-req-star">*</span></label>
                  <div class="input-icon-wrap">
                    <input type="password" id="usr-confirm-pwd" placeholder="Re-enter password" />
                    <button type="button" class="toggle-pwd" onclick="Users.togglePwd('usr-confirm-pwd', this)">
                      <span class="material-icons">visibility</span>
                    </button>
                  </div>
                  <span class="field-error" id="err-usr-confirm-pwd"></span>
                </div>
              </div>

              <div class="form-section-title">Status & Assignment</div>
              <div class="form-grid">
                <div class="form-group">
                  <label for="usr-status">Status</label>
                  <select id="usr-status">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                
              </div>

              <div class="modal-actions">
                <button type="button" class="btn btn-ghost" onclick="Users.closeForm()">Cancel</button>
                <button type="submit" class="btn btn-primary" id="usr-save-btn">
                  <span class="material-icons">save</span> Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Confirm Modal -->
      <div class="modal-overlay" id="usr-confirm-modal" style="display:none">
        <div class="modal modal-sm">
          <div class="modal-header danger">
            <h2 id="usr-confirm-title">Confirm Action</h2>
            <button class="modal-close" onclick="Users.closeConfirm()">
              <span class="material-icons">close</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="confirm-icon">
              <span class="material-icons" id="usr-confirm-icon">warning</span>
            </div>
            <p id="usr-confirm-msg" class="confirm-msg"></p>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" onclick="Users.closeConfirm()">Cancel</button>
              <button type="button" class="btn btn-danger" id="usr-confirm-btn">Confirm</button>
            </div>
          </div>
        </div>
      </div>

      <!-- User Details Modal -->
      <div class="modal-overlay" id="usr-view-modal" style="display:none" onclick="if(event.target===this)Users.closeView()">
        <div class="modal modal-lg" style="max-width:560px">
          <div class="modal-header" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 28px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 id="view-fullname" style="margin:0;color:#fff;font-size:1.4rem"></h2>
              <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
                <code id="view-usercode" style="background:rgba(255,255,255,0.2);color:#fff;padding:4px 12px;border-radius:20px;font-size:0.85rem;font-weight:700;letter-spacing:1px"></code>
                <span id="view-status-badge"></span>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:24px;">
              <div style="position:relative; cursor:pointer;" onclick="Users.viewFullPhoto()">
                <div id="view-avatar" title="Click to view full photo" style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,0.15); border:2px solid rgba(255,255,255,0.5);"></div>
              </div>
              
              <button class="modal-close" onclick="Users.closeView()" style="color:#fff; position:static; transform:none; padding:8px; background:rgba(255,255,255,0.1); border-radius:50%;">
                <span class="material-icons">close</span>
              </button>
            </div>
          </div>
          <div class="modal-body" style="padding:24px 28px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Username</label>
                <p id="view-username" style="margin:4px 0 0;font-weight:600;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Employee ID</label>
                <p id="view-usercode2" style="margin:4px 0 0;font-weight:700;color:var(--primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Email</label>
                <p id="view-email" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Mobile</label>
                <p id="view-mobile" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Role</label>
                <p id="view-role" style="margin:4px 0 0"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Location</label>
                <p id="view-location" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Created Date</label>
                <p id="view-created" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Last Updated</label>
                <p id="view-updated" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
            </div>
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
              <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">User ID (System)</label>
              <p id="view-userid" style="margin:4px 0 0;font-family:monospace;font-size:0.78rem;color:var(--text-muted);word-break:break-all"></p>
            </div>
            <div class="modal-actions" style="margin-top:20px">
              <button type="button" class="btn btn-ghost" onclick="Users.closeView()">Close</button>
              <button type="button" class="btn btn-primary" id="view-edit-btn"><span class="material-icons">edit</span> Edit User</button>
            </div>
          </div>
        </div>
      </div>
    `);

    applyFilters();
  }

  function applyFilters() {
    const q = document.getElementById('usr-search')?.value || '';
    const status = document.getElementById('usr-status-filter')?.value || '';
    const role = document.getElementById('usr-role-filter')?.value || '';
    let data = DB.Users.search(q, status, role);
    
    const session = Auth.getSession();
    if (session && session.roleId !== 'role-admin') {
      data = data.filter(u => u.userId === session.userId);
    }
    
    filteredData = data;
    currentPage = 1;
    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById('usr-tbody');
    const countEl = document.getElementById('usr-count');
    if (!tbody) return;

    const total = filteredData.length;
    const start = (currentPage - 1) * pageSize;
    const page = filteredData.slice(start, start + pageSize);

    countEl && (countEl.textContent = `${total} record${total !== 1 ? 's' : ''}`);

    if (page.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-row">No users found.</td></tr>`;
      renderPagination(total);
      return;
    }

    tbody.innerHTML = page
        .map((u, i) => `
        <tr>
          <td>${start + i + 1}</td>
          <td><code class="id-chip" style="color:var(--primary);background:rgba(99,102,241,0.12);font-weight:700;letter-spacing:1px">${u.userCode || 'EMP-???'}</code></td>
          <td>
            <div class="user-cell">
              <div class="avatar" style="${u.photo ? 'background:none;padding:0;overflow:hidden;' : ''}">${u.photo ? `<img src="${u.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : u.fullName.charAt(0).toUpperCase()}</div>
              <span>${u.username}</span>
            </div>
          </td>
          <td>${u.fullName}</td>
          <td>${u.email || '—'}</td>
          <td>${u.mobileNumber || '—'}</td>
          <td><span class="role-badge">${u.roleName}</span></td>
          <td>${u.locationName}</td>
          <td><span class="badge ${u.status === 'Active' ? 'badge-success' : 'badge-danger'}">${u.status}</span></td>
          <td>${formatDate(u.createdDate)}</td>
          <td>${formatDate(u.updatedDate)}</td>
          <td>
            <div class="action-btns">
              <button class="icon-btn" title="View Details" onclick="Users.viewUser('${u.userId}')" style="color:var(--primary)">
                <span class="material-icons">visibility</span>
              </button>
              <button class="icon-btn" title="Upload Photo" onclick="Users.triggerPhotoUpload('${u.userId}')" style="color:#6366f1">
                <span class="material-icons">add_circle</span>
              </button>
              ${(Auth.getSession() && Auth.getSession().roleId === 'role-admin') ? `
              <button class="icon-btn edit" title="Edit" onclick="Users.openForm('${u.userId}')">
                <span class="material-icons">edit</span>
              </button>
              <button class="icon-btn" title="Unlock Location" onclick="Users.confirmResetLocation('${u.userId}', '${u.fullName}')" style="color:var(--warning)">
                <span class="material-icons">location_off</span>
              </button>
              <button class="icon-btn ${u.status === 'Active' ? 'warn' : 'success'}" title="${u.status === 'Active' ? 'Deactivate' : 'Activate'}"
                onclick="Users.confirmToggle('${u.userId}', '${u.status}', '${u.fullName}')">
                <span class="material-icons">${u.status === 'Active' ? 'block' : 'check_circle'}</span>
              </button>
              <button class="icon-btn danger" title="Delete" onclick="Users.confirmDelete('${u.userId}', '${u.fullName}')">
                <span class="material-icons">delete</span>
              </button>` : ''}
            </div>
          </td>
        </tr>
      `)
      .join('');

    renderPagination(total);
  }

  function renderPagination(total) {
    const pag = document.getElementById('usr-pagination');
    if (!pag) return;
    const pages = Math.ceil(total / pageSize);
    if (pages <= 1) { pag.innerHTML = ''; return; }
    let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="Users.goPage(${currentPage - 1})"><span class="material-icons">chevron_left</span></button>`;
    for (let p = 1; p <= pages; p++) {
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="Users.goPage(${p})">${p}</button>`;
    }
    html += `<button class="page-btn" ${currentPage === pages ? 'disabled' : ''} onclick="Users.goPage(${currentPage + 1})"><span class="material-icons">chevron_right</span></button>`;
    pag.innerHTML = html;
  }

  function goPage(p) { currentPage = p; renderTable(); }

  function openForm(id = null) {
    const modal = document.getElementById('usr-modal');
    const title = document.getElementById('usr-modal-title');
    clearFormErrors();

    const session = Auth.getSession();
    const isAdmin = session.roleName === 'System Administrator';
    const statusEl = document.getElementById('usr-status');
    statusEl.disabled = !isAdmin;
    statusEl.parentElement.style.opacity = isAdmin ? '1' : '0.5';

    const pwdSection = document.getElementById('pwd-section');
    const pwdTitle = document.getElementById('pwd-section-title');

    if (id) {
      const u = DB.Users.getById(id);
      if (!u) return;
      title.textContent = 'Edit User';
      document.getElementById('usr-id').value = u.userId;
      document.getElementById('usr-usercode').value = u.userCode || '—';
      document.getElementById('usr-username').value = u.username;
      document.getElementById('usr-fullname').value = u.fullName;
      document.getElementById('usr-email').value = u.email;
      document.getElementById('usr-mobile').value = u.mobileNumber;
      document.getElementById('usr-status').value = u.status;
      document.getElementById('usr-password').value = '';
      document.getElementById('usr-confirm-pwd').value = '';
      document.getElementById('pwd-req-star').style.display = 'none';
      document.getElementById('cpwd-req-star').style.display = 'none';
      pwdTitle.textContent = 'Change Password (leave blank to keep current)';
    } else {
      title.textContent = 'Add User';
      document.getElementById('usr-form').reset();
      document.getElementById('usr-id').value = '';
      document.getElementById('usr-usercode').value = DB.Users.generateUserCode();
      document.getElementById('pwd-req-star').style.display = '';
      document.getElementById('cpwd-req-star').style.display = '';
      pwdTitle.textContent = 'Password';
    }
    
    document.getElementById('strength-meter').style.display = 'none';

    // Clear photo upload
    document.getElementById('usr-photo').value = '';
    currentPhotoBase64 = null;
    const photoContainer = document.getElementById('usr-photo-preview-container');
    const photoPreview = document.getElementById('usr-photo-preview');
    
    if (id) {
      const u = DB.Users.getById(id);
      if (u && u.photo) {
        currentPhotoBase64 = u.photo;
        photoPreview.src = u.photo;
        photoContainer.style.display = 'flex';
      } else {
        photoContainer.style.display = 'none';
        photoPreview.src = '';
      }
    } else {
      photoContainer.style.display = 'none';
      photoPreview.src = '';
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      modal.querySelector('.modal').classList.add('modal-in');
    }, 10);
    document.getElementById('usr-username').focus();
  }


  function closeForm() {
    const modal = document.getElementById('usr-modal');
    modal.querySelector('.modal').classList.remove('modal-in');
    setTimeout(() => { modal.style.display = 'none'; }, 250);
  }

  function clearFormErrors() {
    ['err-usr-username', 'err-usr-fullname', 'err-usr-email', 'err-usr-password', 'err-usr-confirm-pwd', 'err-usr-location'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  }

  function checkStrength() {
    const pwd = document.getElementById('usr-password').value;
    const meter = document.getElementById('strength-meter');
    const fill = document.getElementById('strength-fill');
    const label = document.getElementById('strength-label');
    if (!pwd) { meter.style.display = 'none'; return; }
    meter.style.display = 'block';

    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    const levels = [
      { pct: 20, cls: 'very-weak', text: 'Very Weak' },
      { pct: 40, cls: 'weak', text: 'Weak' },
      { pct: 60, cls: 'fair', text: 'Fair' },
      { pct: 80, cls: 'strong', text: 'Strong' },
      { pct: 100, cls: 'very-strong', text: 'Very Strong' },
    ];
    const level = levels[Math.min(score, 4)];
    fill.style.width = level.pct + '%';
    fill.className = level.cls;
    label.textContent = level.text;
  }

  function togglePwd(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('.material-icons');
    if (input.type === 'password') {
      input.type = 'text';
      icon.textContent = 'visibility_off';
    } else {
      input.type = 'password';
      icon.textContent = 'visibility';
    }
  }

  function handlePhotoUpload(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      currentPhotoBase64 = e.target.result;
      document.getElementById('usr-photo-preview').src = currentPhotoBase64;
      document.getElementById('usr-photo-preview-container').style.display = 'flex';
      document.getElementById('usr-photo-upload-container').style.display = 'none';
    };
    reader.readAsDataURL(input.files[0]);
  }

  function triggerPhotoUpload(userId) {
    // Remove existing popup if any
    const existing = document.getElementById('photo-choice-popup');
    if (existing) existing.remove();

    // Inject styles once
    if (!document.getElementById('photo-choice-styles')) {
      const st = document.createElement('style');
      st.id = 'photo-choice-styles';
      st.textContent = `
        @keyframes pcFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes pcPopIn  { from{transform:scale(0.8) translateY(20px);opacity:0} to{transform:scale(1) translateY(0);opacity:1} }
        #photo-choice-card { animation: pcPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
        .pc-option-btn {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:10px; padding:24px 20px; border-radius:16px; border:2px solid #e5e7eb;
          background:#f9fafb; cursor:pointer; transition:all 0.2s ease; flex:1;
          font-family:'Segoe UI',sans-serif;
        }
        .pc-option-btn:hover { border-color:#6366f1; background:#eef2ff; transform:translateY(-2px); box-shadow:0 8px 20px rgba(99,102,241,0.15); }
        .pc-option-btn .pc-icon { font-size:36px; }
        .pc-option-btn span.pc-label { font-size:14px; font-weight:700; color:#374151; }
        #pc-cam-stream { width:100%; border-radius:12px; display:none; margin-top:12px; background:#000; }
        #pc-cam-canvas { display:none; }
      `;
      document.head.appendChild(st);
    }

    const overlay = document.createElement('div');
    overlay.id = 'photo-choice-popup';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;animation:pcFadeIn 0.2s ease;';
    overlay.innerHTML = `
      <div id="photo-choice-card" style="background:#fff;border-radius:20px;padding:32px 28px;max-width:420px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.25);font-family:'Segoe UI',sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="margin:0;font-size:18px;font-weight:800;color:#111827;">Add Profile Photo</h3>
          <button onclick="document.getElementById('photo-choice-popup').remove()" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:4px;">
            <span class="material-icons" style="font-size:22px;">close</span>
          </button>
        </div>

        <div style="display:flex;gap:14px;margin-bottom:16px;">
          <button class="pc-option-btn" onclick="Users._pcUploadFile('${userId}')">
            <span class="material-icons pc-icon" style="color:#6366f1;">upload_file</span>
            <span class="pc-label">Upload Photo</span>
            <span style="font-size:11px;color:#6b7280;">Choose from device</span>
          </button>
          <button class="pc-option-btn" onclick="Users._pcStartCamera('${userId}')">
            <span class="material-icons pc-icon" style="color:#10b981;">photo_camera</span>
            <span class="pc-label">Capture Photo</span>
            <span style="font-size:11px;color:#6b7280;">Use live camera</span>
          </button>
        </div>

        <video id="pc-cam-stream" autoplay playsinline></video>
        <canvas id="pc-cam-canvas"></canvas>

        <div id="pc-cam-controls" style="display:none;text-align:center;margin-top:12px;">
          <button onclick="Users._pcSnap('${userId}')" style="background:#6366f1;color:#fff;border:none;border-radius:10px;padding:11px 28px;font-size:14px;font-weight:700;cursor:pointer;">
            <span class="material-icons" style="font-size:16px;vertical-align:middle;">camera</span> Take Photo
          </button>
          <button onclick="Users._pcSwitchCamera('${userId}')" title="Switch Camera" style="background:#e0f2fe;color:#0369a1;border:none;border-radius:10px;padding:11px 14px;font-size:14px;font-weight:700;cursor:pointer;margin-left:8px;">
            <span class="material-icons" style="font-size:18px;vertical-align:middle;">flip_camera_android</span>
          </button>
          <button onclick="Users._pcStopCamera()" style="background:#f3f4f6;color:#374151;border:none;border-radius:10px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer;margin-left:8px;">
            Cancel
          </button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { _pcStopCamera(); overlay.remove(); } });
    document.body.appendChild(overlay);
  }

  // ── Photo Choice Helpers ───────────────────────────────────────────────────

  let _pcStream = null;
  let _pcFacingMode = 'user';
  let _pcCameraIndex = 0;
  let _pcCameraList = [];

  function _pcUploadFile(userId) {
    let input = document.getElementById('inline-photo-upload');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'inline-photo-upload';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
    }
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = ev.target.result;
        const userObj = DB.Users.getById(userId);
        if (userObj) {
          userObj.photo = b64;
          DB.Users.update(userId, userObj);
          App.notify('Photo uploaded successfully!', 'success');
          renderTable();
          if (typeof Checkin !== 'undefined' && Checkin.reloadReferencePhoto) Checkin.reloadReferencePhoto();
          if (document.getElementById('usr-view-modal') && document.getElementById('usr-view-modal').style.display !== 'none') {
            viewUser(userId);
          }
        }
        document.getElementById('photo-choice-popup')?.remove();
      };
      reader.readAsDataURL(file);
      input.value = '';
    };
    input.click();
  }

  async function _pcStartCamera(userId, facingMode) {
    const videoEl = document.getElementById('pc-cam-stream');
    const controls = document.getElementById('pc-cam-controls');
    if (!videoEl) return;
    _pcFacingMode = facingMode || 'user';
    // Stop existing stream before starting new one
    if (_pcStream) { _pcStream.getTracks().forEach(t => t.stop()); _pcStream = null; }
    try {
      _pcStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: _pcFacingMode }, width: { ideal: 640 }, height: { ideal: 480 } }
      });
      videoEl.srcObject = _pcStream;
      videoEl.style.display = 'block';
      if (controls) { controls.style.display = 'flex'; controls.style.justifyContent = 'center'; controls.style.gap = '0'; }
    } catch (err) {
      App.notify('Camera access denied or not available.', 'error');
    }
  }

  async function _pcSwitchCamera(userId) {
    try {
      // Enumerate cameras if not done yet
      if (_pcCameraList.length === 0) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        _pcCameraList = devices.filter(d => d.kind === 'videoinput');
      }
      if (_pcCameraList.length < 2) {
        App.notify('Only one camera found on this device.', 'info');
        return;
      }

      // Cycle to next camera by index
      _pcCameraIndex = (_pcCameraIndex + 1) % _pcCameraList.length;
      const nextCamera = _pcCameraList[_pcCameraIndex];

      // Stop current stream
      if (_pcStream) { _pcStream.getTracks().forEach(t => t.stop()); _pcStream = null; }

      const videoEl = document.getElementById('pc-cam-stream');
      if (!videoEl) return;

      _pcStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextCamera.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
      });
      videoEl.srcObject = _pcStream;
      App.notify(`Camera switched (${_pcCameraIndex + 1}/${_pcCameraList.length})`, 'success');
    } catch (err) {
      // Fallback: toggle facing mode
      try {
        _pcFacingMode = (_pcFacingMode === 'user') ? 'environment' : 'user';
        if (_pcStream) { _pcStream.getTracks().forEach(t => t.stop()); _pcStream = null; }
        const videoEl = document.getElementById('pc-cam-stream');
        if (!videoEl) return;
        _pcStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: _pcFacingMode }, width: { ideal: 640 }, height: { ideal: 480 } }
        });
        videoEl.srcObject = _pcStream;
        App.notify('Camera switched!', 'success');
      } catch (e2) {
        App.notify('Failed to switch camera: ' + e2.message, 'error');
      }
    }
  }

  function _pcStopCamera() {
    if (_pcStream) { _pcStream.getTracks().forEach(t => t.stop()); _pcStream = null; }
    _pcCameraIndex = 0;
    _pcCameraList = [];
    const videoEl = document.getElementById('pc-cam-stream');
    if (videoEl) { videoEl.srcObject = null; videoEl.style.display = 'none'; }
    const controls = document.getElementById('pc-cam-controls');
    if (controls) controls.style.display = 'none';
  }

  function _pcSnap(userId) {
    const videoEl = document.getElementById('pc-cam-stream');
    const canvas = document.getElementById('pc-cam-canvas');
    if (!videoEl || !canvas) return;
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL('image/jpeg', 0.85);
    const userObj = DB.Users.getById(userId);
    if (userObj) {
      userObj.photo = b64;
      DB.Users.update(userId, userObj);
      App.notify('Photo captured and saved!', 'success');
      renderTable();
      if (typeof Checkin !== 'undefined' && Checkin.reloadReferencePhoto) Checkin.reloadReferencePhoto();
      if (document.getElementById('usr-view-modal') && document.getElementById('usr-view-modal').style.display !== 'none') {
        viewUser(userId);
      }
    }
    _pcStopCamera();
    document.getElementById('photo-choice-popup')?.remove();
  }

  function removePhoto() {
    currentPhotoBase64 = null;
    document.getElementById('usr-photo').value = '';
    document.getElementById('usr-photo-preview').src = '';
    document.getElementById('usr-photo-preview-container').style.display = 'none';
  }

  function clearPhoto() {
    currentPhotoBase64 = null;
    document.getElementById('usr-photo').value = '';
    document.getElementById('usr-photo-preview').src = '';
    document.getElementById('usr-photo-preview-container').style.display = 'none';
  }

  async function saveForm(e) {
    e.preventDefault();
    clearFormErrors();

    const id = document.getElementById('usr-id').value;
    const username = document.getElementById('usr-username').value.trim();
    const fullName = document.getElementById('usr-fullname').value.trim();
    const email = document.getElementById('usr-email').value.trim();
    const mobile = document.getElementById('usr-mobile').value.trim();
    const password = document.getElementById('usr-password').value;
    const confirmPwd = document.getElementById('usr-confirm-pwd').value;
    const status = document.getElementById('usr-status').value;
    const userCode = document.getElementById('usr-usercode').value.trim();

    let valid = true;
    if (!username) { document.getElementById('err-usr-username').textContent = 'Username is required.'; valid = false; }
    if (!fullName) { document.getElementById('err-usr-fullname').textContent = 'Full name is required.'; valid = false; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById('err-usr-email').textContent = 'Enter a valid email.'; valid = false;
    }
    if (!id) {
      if (!password) { document.getElementById('err-usr-password').textContent = 'Password is required.'; valid = false; }
      else if (password.length < 8) { document.getElementById('err-usr-password').textContent = 'Minimum 8 characters.'; valid = false; }
    } else if (password) {
      if (password.length < 8) { document.getElementById('err-usr-password').textContent = 'Minimum 8 characters.'; valid = false; }
    }
    if ((password || !id) && password !== confirmPwd) {
      document.getElementById('err-usr-confirm-pwd').textContent = 'Passwords do not match.'; valid = false;
    }
    if (!userCode || userCode === '—') {
      App.notify('Employee ID is required.', 'warning'); valid = false;
    }

    if (!valid) return;

    const saveBtn = document.getElementById('usr-save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="material-icons spin">sync</span> Saving…';

    let passwordHash = undefined;
    if (password) passwordHash = await Auth.hashPassword(password);

    
    
    // Preserve existing role for edit, otherwise default to Employee role
    let finalRoleId = 'role-user';
    if (id) {
      const existingUser = DB.Users.getById(id);
      if (existingUser) {
        finalRoleId = existingUser.roleId || 'role-user';
      }
    }
    
    const data = {
      username, 
      userCode,
      fullName, 
      email, 
      mobileNumber: mobile, 
      roleId: finalRoleId, 
      status, 
      passwordHash, 
      photo: currentPhotoBase64 
    };

    const result = id ? DB.Users.update(id, data) : DB.Users.add(data);

    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span class="material-icons">save</span> Save User';

    if (!result.success) {
      App.notify(result.message, 'error');
      if (result.message.includes('Username')) document.getElementById('err-usr-username').textContent = result.message;
      return;
    }

    if (typeof Auth !== 'undefined' && Auth.updateSession) {
      Auth.updateSession();
    }

    App.notify(`User ${id ? 'updated' : 'added'} successfully.`, 'success');
    closeForm();
    applyFilters();
  }

  function confirmToggle(id, currentStatus, name) {
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    const action = newStatus === 'Inactive' ? 'deactivate' : 'activate';
    showConfirm(
      `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      `Are you sure you want to ${action} <strong>${name}</strong>?`,
      newStatus === 'Inactive' ? 'person_off' : 'how_to_reg',
      () => {
        DB.Users.setStatus(id, newStatus);
        App.notify(`User ${newStatus === 'Active' ? 'activated' : 'deactivated'}.`, 'success');
        applyFilters();
      }
    );
  }

  function confirmResetLocation(id, name) {
    showConfirm(
      'Unlock Location',
      `Are you sure you want to unlock the location for <strong>${name}</strong>? They will be prompted to set it again on their next check-in.`,
      'location_off',
      () => {
        DB.Users.saveRefPosition(id, null, null);
        App.notify(`Location for ${name} has been unlocked.`, 'success');
        applyFilters();
      }
    );
  }

  function confirmDelete(id, name) {
    showConfirm(
      'Delete User',
      `Are you sure you want to permanently delete <strong>${name}</strong>? This action cannot be undone.`,
      'delete_forever',
      () => {
        DB.Users.delete(id);
        App.notify('User deleted.', 'success');
        applyFilters();
      }
    );
  }

  function showConfirm(title, msg, icon, cb) {
    document.getElementById('usr-confirm-title').textContent = title;
    document.getElementById('usr-confirm-msg').innerHTML = msg;
    document.getElementById('usr-confirm-icon').textContent = icon;
    document.getElementById('usr-confirm-btn').onclick = () => { closeConfirm(); cb(); };
    const m = document.getElementById('usr-confirm-modal');
    m.style.display = 'flex';
    setTimeout(() => m.querySelector('.modal').classList.add('modal-in'), 10);
  }

  function closeConfirm() {
    const m = document.getElementById('usr-confirm-modal');
    m.querySelector('.modal').classList.remove('modal-in');
    setTimeout(() => { m.style.display = 'none'; }, 250);
  }

  function viewUser(id) {
    const u = DB.Users.getById(id);
    if (!u) return;
    
    if (!document.getElementById('usr-view-modal')) {
      const div = document.createElement('div');
      div.innerHTML = `
      <div class="modal-overlay" id="usr-view-modal" style="display:none" onclick="if(event.target===this)Users.closeView()">
        <div class="modal modal-lg" style="max-width:560px">
          <div class="modal-header" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 28px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 id="view-fullname" style="margin:0;color:#fff;font-size:1.4rem"></h2>
              <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
                <code id="view-usercode" style="background:rgba(255,255,255,0.2);color:#fff;padding:4px 12px;border-radius:20px;font-size:0.85rem;font-weight:700;letter-spacing:1px"></code>
                <span id="view-status-badge"></span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:24px;">
              <div style="position:relative; cursor:pointer;" onclick="Users.viewFullPhoto()">
                <div id="view-avatar" title="Click to view full photo" style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,0.15); border:2px solid rgba(255,255,255,0.5);"></div>
              </div>
              <button class="modal-close" onclick="Users.closeView()" style="color:#fff; position:static; transform:none; padding:8px; background:rgba(255,255,255,0.1); border-radius:50%;">
                <span class="material-icons">close</span>
              </button>
            </div>
          </div>
          <div class="modal-body" style="padding:24px 28px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Username</label>
                <p id="view-username" style="margin:4px 0 0;font-weight:600;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Employee ID</label>
                <p id="view-usercode2" style="margin:4px 0 0;font-weight:700;color:var(--primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Email</label>
                <p id="view-email" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Mobile</label>
                <p id="view-mobile" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Role</label>
                <p id="view-role" style="margin:4px 0 0"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Location</label>
                <p id="view-location" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Created Date</label>
                <p id="view-created" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
              <div class="view-detail-item">
                <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">Last Updated</label>
                <p id="view-updated" style="margin:4px 0 0;font-weight:500;color:var(--text-primary)"></p>
              </div>
            </div>
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
              <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:600">User ID (System)</label>
              <p id="view-userid" style="margin:4px 0 0;font-family:monospace;font-size:0.78rem;color:var(--text-muted);word-break:break-all"></p>
            </div>
            <div class="modal-actions" style="margin-top:20px">
              <button class="btn btn-primary" id="view-upload-btn">
                <span class="material-icons">add_a_photo</span> Upload Photo
              </button>
              <button type="button" class="btn btn-ghost" onclick="Users.closeView()">Close</button>
            </div>
          </div>
        </div>
      </div>
      `;
      document.body.appendChild(div.firstElementChild);
    }
    
    const uploadBtn = document.getElementById('view-upload-btn');
    if (uploadBtn) {
      uploadBtn.onclick = () => Users.triggerPhotoUpload(id);
    } else {
      const actionsDiv = document.querySelector('#usr-view-modal .modal-actions');
      if (actionsDiv) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.id = 'view-upload-btn';
        btn.innerHTML = `<span class="material-icons">add_a_photo</span> Upload Photo`;
        btn.onclick = () => Users.triggerPhotoUpload(id);
        actionsDiv.prepend(btn);
      }
    }

    const modal = document.getElementById('usr-view-modal');
    
    const avatarEl = document.getElementById('view-avatar');
    // Store photo URL for full-size viewing
    avatarEl.dataset.photo = u.photo || '';
    
    if (u.photo) {
      avatarEl.innerHTML = `<img src="${u.photo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
    } else {
      avatarEl.innerHTML = u.fullName.charAt(0).toUpperCase();
    }
    
    document.getElementById('view-fullname').textContent = u.fullName;
    document.getElementById('view-usercode').textContent = u.userCode || 'EMP-???';
    document.getElementById('view-usercode2').textContent = u.userCode || 'EMP-???';
    document.getElementById('view-status-badge').innerHTML =
      `<span class="badge ${u.status === 'Active' ? 'badge-success' : 'badge-danger'}" style="font-size:0.72rem">${u.status}</span>`;
    document.getElementById('view-username').textContent = u.username;
    document.getElementById('view-email').textContent = u.email || '—';
    document.getElementById('view-mobile').textContent = u.mobileNumber || '—';
    document.getElementById('view-role').innerHTML = `<span class="role-badge">${u.roleName || '—'}</span>`;
    document.getElementById('view-location').textContent = u.locationName || '—';
    document.getElementById('view-created').textContent = formatDate(u.createdDate);
    document.getElementById('view-updated').textContent = formatDate(u.updatedDate);
    document.getElementById('view-userid').textContent = u.userId;
    document.getElementById('view-edit-btn').onclick = () => { closeView(); openForm(id); };
    modal.style.display = 'flex';
    setTimeout(() => modal.querySelector('.modal').classList.add('modal-in'), 10);
  }

  function closeView() {
    const m = document.getElementById('usr-view-modal');
    m.querySelector('.modal').classList.remove('modal-in');
    setTimeout(() => { m.style.display = 'none'; }, 250);
  }

  function viewFullPhoto() {
    const avatarEl = document.getElementById('view-avatar');
    const photoData = avatarEl.dataset.photo;
    if (!photoData) return;
    
    // Create or show full screen image viewer
    let viewer = document.getElementById('photo-fullscreen-viewer');
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.id = 'photo-fullscreen-viewer';
      viewer.style.position = 'fixed';
      viewer.style.top = '0';
      viewer.style.left = '0';
      viewer.style.width = '100%';
      viewer.style.height = '100%';
      viewer.style.backgroundColor = 'rgba(0,0,0,0.85)';
      viewer.style.zIndex = '99999';
      viewer.style.display = 'flex';
      viewer.style.alignItems = 'center';
      viewer.style.justifyContent = 'center';
      viewer.style.cursor = 'zoom-out';
      viewer.onclick = () => { viewer.style.display = 'none'; };
      
      const img = document.createElement('img');
      img.id = 'photo-fullscreen-img';
      img.style.maxWidth = '90%';
      img.style.maxHeight = '90%';
      img.style.borderRadius = '8px';
      img.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      viewer.appendChild(img);
      
      const closeMsg = document.createElement('div');
      closeMsg.textContent = 'Click anywhere to close';
      closeMsg.style.position = 'absolute';
      closeMsg.style.bottom = '20px';
      closeMsg.style.color = '#fff';
      closeMsg.style.fontSize = '14px';
      closeMsg.style.opacity = '0.7';
      viewer.appendChild(closeMsg);
      
      document.body.appendChild(viewer);
    }
    
    document.getElementById('photo-fullscreen-img').src = photoData;
    viewer.style.display = 'flex';
  }

  return { render, applyFilters, openForm, closeForm, saveForm, confirmToggle, confirmDelete, confirmResetLocation, closeConfirm, goPage, checkStrength, togglePwd, viewUser, closeView, clearFormErrors, handlePhotoUpload, triggerPhotoUpload, _pcUploadFile, _pcStartCamera, _pcSwitchCamera, _pcStopCamera, _pcSnap, removePhoto, viewFullPhoto, clearPhoto };
})();
