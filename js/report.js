/**
 * report.js — Simple Visit Report: Person → Locations Visited with Time
 */

window.Report = (() => {
  let selectedUserId = '';
  let dateFrom = '';
  let dateTo   = '';

  function getLocalDateString(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }

  function defaultDates() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    dateFrom = getLocalDateString(firstDay);
    dateTo = getLocalDateString(lastDay);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    if (!dateFrom) defaultDates();
    const currentUser = Auth.getSession() || { roleId: 'role-user' };
    const isAdmin = currentUser.roleId === 'role-admin';

    // Non-admin users always see only their own records
    const users = isAdmin ? DB.Users.getAll() : DB.Users.getAll().filter(u => u.userId === currentUser.userId);
    if (!isAdmin && !selectedUserId) selectedUserId = currentUser.userId;

    App.setContent(`
      <div class="page-header no-print">
        <div>
          <h1 class="page-title">Visit Report</h1>
          <p class="page-subtitle">Select a person to see all locations they visited</p>
        </div>
        <div style="display:flex; gap:10px;">
          ${isAdmin ? `<button class="btn btn-outline" style="color:var(--error); border-color:var(--error);" onclick="Report.deleteAllCheckins()">
            <span class="material-icons">delete_sweep</span> Delete All
          </button>` : ''}
          <button class="btn btn-ghost" onclick="Report.downloadCSV()">
            <span class="material-icons">download</span> Download CSV
          </button>
          <button class="btn btn-primary" onclick="window.print()">
            <span class="material-icons">print</span> Print / PDF
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="card no-print" style="margin-bottom:20px;">
        <div class="card-body" style="padding:16px;">
          <div class="form-grid">
            ${isAdmin ? `
            <div class="form-group" style="grid-column:span 2;">
              <label for="rep-search">Search Employee (Name or ID)</label>
              <input type="text" id="rep-search" list="emp-datalist" placeholder="Type Name or EMP Code..." autocomplete="off" onchange="Report.handleSearch()" value="${selectedUserId ? (() => { const u = DB.Users.getById(selectedUserId); return u ? `${u.userCode ? `[${u.userCode}] ` : ''}${u.fullName}` : ''; })() : ''}" />
              <datalist id="emp-datalist">
                ${users.map(u => `<option value="${u.userCode ? `[${u.userCode}] ` : ''}${u.fullName}" data-id="${u.userId}"></option>`).join('')}
              </datalist>
            </div>` : `
            <div class="form-group" style="grid-column:span 2;">
              <label>Employee</label>
              <input type="text" value="${(() => { const u = DB.Users.getById(currentUser.userId); return u ? `${u.userCode ? `[${u.userCode}] ` : ''}${u.fullName}` : currentUser.fullName; })()}" readonly style="background:var(--bg-elevated);cursor:not-allowed;" />
            </div>`}
            <div class="form-group">
              <label for="rep-from">From Date</label>
              <input type="date" id="rep-from" value="${dateFrom}" onchange="Report.applyFilters()" />
            </div>
            <div class="form-group">
              <label for="rep-to">To Date</label>
              <input type="date" id="rep-to" value="${dateTo}" onchange="Report.applyFilters()" />
            </div>
          </div>
        </div>
      </div>

      <!-- Report Table -->
      <div id="report-output"></div>
    `);

    buildReport();
  }

  function applyFilters() {
    const currentUser = Auth.getSession() || { roleId: 'role-user' };
    const isAdmin = currentUser.roleId === 'role-admin';
    // Non-admins always show only their own records
    if (!isAdmin) selectedUserId = currentUser.userId;
    dateFrom = document.getElementById('rep-from')?.value || dateFrom;
    dateTo   = document.getElementById('rep-to')?.value   || dateTo;
    buildReport();
  }

  function handleSearch() {
    const currentUser = Auth.getSession() || { roleId: 'role-user' };
    const isAdmin = currentUser.roleId === 'role-admin';
    // Non-admins cannot change the selected user
    if (!isAdmin) { selectedUserId = currentUser.userId; applyFilters(); return; }

    const val = document.getElementById('rep-search')?.value.trim();
    if (!val) {
      selectedUserId = '';
      applyFilters();
      return;
    }

    // Find the corresponding userId from the datalist
    const list = document.getElementById('emp-datalist');
    if (list) {
      const option = Array.from(list.options).find(opt => opt.value === val);
      if (option) {
        selectedUserId = option.getAttribute('data-id');
        applyFilters();
        return;
      }
    }

    // Fallback: If they manually typed an exact ID or Name without selecting from list
    const users = DB.Users.getAll();
    const found = users.find(u =>
      (u.userCode && u.userCode.toLowerCase() === val.toLowerCase()) ||
      u.fullName.toLowerCase() === val.toLowerCase()
    );

    if (found) {
      selectedUserId = found.userId;
      document.getElementById('rep-search').value = `${found.userCode ? `[${found.userCode}] ` : ''}${found.fullName}`;
      applyFilters();
    }
  }

  // ── Build Report ───────────────────────────────────────────────────────────

  function buildReport() {
    const currentUser = Auth.getSession() || { roleId: 'role-admin' }; // Safe fallback
    const isAdmin = currentUser.roleId === 'role-admin';

    const output = document.getElementById('report-output');
    if (!output) return;

    if (!selectedUserId) {
      output.innerHTML = `
        <div class="card">
          <div class="card-body" style="text-align:center; padding:60px 20px; color:var(--text-secondary);">
            <span class="material-icons" style="font-size:64px; color:var(--border); display:block; margin-bottom:12px;">person_search</span>
            <p>Select a person above to view their visit report.</p>
          </div>
        </div>`;
      return;
    }

    const user   = DB.Users.getById(selectedUserId);
    if (!user) return;

    const visits = CheckinsDB.Checkins.getJoinedCheckins()
      .filter(c => {
        const d = getLocalDateString(c.timestamp);
        const matchUser = c.userId === selectedUserId || (c.username && user.username.toLowerCase() === c.username.toLowerCase());
        return matchUser && d >= dateFrom && d <= dateTo;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    output.innerHTML = `
      <div id="print-area" style="background:#fff; color:#111; padding:32px; border-radius:8px;
           border:1px solid var(--border); font-family:'Segoe UI',sans-serif;">

        <!-- Print Header (shows on print only, hidden in screen view via CSS) -->
        <div class="print-header" style="display:none; margin-bottom:24px; border-bottom:2px solid #1e3a8a; padding-bottom:16px;">
          <div style="font-size:20px; font-weight:800; color:#1e3a8a;">WEBCAM</div>
          <div style="font-size:14px; font-weight:700; margin-top:4px;">Visit Report — ${user.fullName}</div>
          <div style="font-size:11px; color:#555; margin-top:2px;">Period: ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}</div>
        </div>

        <!-- Person Summary (visible on screen) -->
        <div class="no-print" style="display:flex; align-items:center; gap:16px; margin-bottom:20px;
             padding:16px; background:var(--bg-elevated); border-radius:8px; border:1px solid var(--border);">
          <div style="width:48px; height:48px; border-radius:50%; background:var(--primary);
               display:flex; align-items:center; justify-content:center;
               font-size:20px; font-weight:800; color:#fff; flex-shrink:0;">
            ${user.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-size:16px; font-weight:700;">${user.fullName}</div>
            <div style="font-size:12px; color:var(--text-secondary);">@${user.username}</div>
          </div>
          <div style="margin-left:auto; text-align:right;">
            <div style="font-size:28px; font-weight:800; color:var(--primary);">${visits.length}</div>
            <div style="font-size:11px; color:var(--text-muted);">Total Visits</div>
          </div>
        </div>

        <!-- Report Table -->
        ${visits.length === 0 ? `
          <div style="text-align:center; padding:40px; color:#888;">
            No visits found for this period.
          </div>
        ` : `
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="background:#1e3a8a; color:#fff;">
                <th style="padding:10px 12px; text-align:center; width:40px;">#</th>
                <th style="padding:10px 12px; text-align:center; width:60px;">Photo</th>
                <th style="padding:10px 12px; text-align:left; width:100px;">Date</th>
                <th style="padding:10px 12px; text-align:left; width:90px;">Time</th>
                <th style="padding:10px 12px; text-align:left; width:180px;">Location / Unit Name</th>
                <th style="padding:10px 12px; text-align:left; width:130px;">50m Geofence</th>
                <th style="padding:10px 12px; text-align:left;">Geo-Location Address</th>
                <th style="padding:10px 12px; text-align:left; width:120px;">GPS</th>
                ${isAdmin ? `<th class="no-print" style="padding:10px 12px; text-align:center; width:60px;">Action</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${visits.map((v, i) => {
                const dist = v.distanceMeters !== null && v.distanceMeters !== undefined ? `${v.distanceMeters}m` : '';
                const isInRange = v.geofenceStatus === 'IN_RANGE';
                const geofenceBadge = v.distanceMeters !== null && v.distanceMeters !== undefined
                  ? (isInRange
                      ? `<span style="display:inline-block; padding:2px 8px; border-radius:12px; background:#d1fae5; color:#065f46; font-size:11px; font-weight:700;">✅ In Range (${dist})</span>`
                      : `<span style="display:inline-block; padding:2px 8px; border-radius:12px; background:#fee2e2; color:#991b1b; font-size:11px; font-weight:700;">⚠️ Out of Range (${dist})</span>`)
                  : `<span style="font-size:11px; color:#6b7280;">—</span>`;

                return `
                  <tr style="border-bottom:1px solid #e5e7eb; background:${i%2===0?'#fff':'#f9fafb'};">
                    <td style="padding:10px 12px; text-align:center; color:#888; font-weight:600;">${i+1}</td>
                    <td style="padding:8px 12px; text-align:center;">
                      <img src="${v.photo}" style="width:44px; height:44px; border-radius:6px;
                           object-fit:cover; border:1px solid #ddd;" />
                    </td>
                    <td style="padding:10px 12px; font-weight:600;">${fmtDate(v.timestamp)}</td>
                    <td style="padding:10px 12px; font-weight:800; color:#1e3a8a; font-size:14px;">
                      ${fmtTime(v.timestamp)}
                    </td>
                    <td style="padding:10px 12px; font-weight:700; color:#0f766e;">
                      ${v.selectedLocationName || 'Field Location'}
                    </td>
                    <td style="padding:10px 12px;">${geofenceBadge}</td>
                    <td style="padding:10px 12px; line-height:1.5; color:#333;">${v.address || '—'}</td>
                    <td style="padding:10px 12px;">
                      <code style="font-size:10px; color:#555;">
                        ${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}
                      </code>
                    </td>
                    ${isAdmin ? `<td class="no-print" style="padding:10px 12px; text-align:center;">
                      <button class="btn btn-icon btn-sm" onclick="Report.deleteCheckin('${v.checkinId}')" style="color:#ef4444;" title="Delete Check-in">
                        <span class="material-icons" style="font-size:18px;">delete</span>
                      </button>
                    </td>` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="background:#f3f4f6; font-weight:700; border-top:2px solid #1e3a8a;">
                <td colspan="2" style="padding:10px 12px; text-align:right; color:#555;">Total:</td>
                <td colspan="${isAdmin ? 7 : 6}" style="padding:10px 12px; font-size:15px; color:#1e3a8a;">
                  ${visits.length} location${visits.length !== 1 ? 's' : ''} visited
                  &nbsp;|&nbsp; ${fmtDate(visits[0]?.timestamp)} — ${fmtDate(visits[visits.length-1]?.timestamp)}
                </td>
              </tr>
            </tfoot>
          </table>
        `}
      </div>
    `;
  }

  // ── CSV Download ────────────────────────────────────────────────────────────

  function downloadCSV() {
    if (!selectedUserId) { App.notify('Select a person first.', 'warning'); return; }

    const user   = DB.Users.getById(selectedUserId);
    const visits = CheckinsDB.Checkins.getJoinedCheckins()
      .filter(c => {
        const d = new Date(c.timestamp).toISOString().split('T')[0];
        return c.userId === selectedUserId && d >= dateFrom && d <= dateTo;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (!visits.length) { App.notify('No visits found to download.', 'info'); return; }

    const rows = [
      ['#', 'Name', 'Username', 'Date', 'Time', 'Location / Unit Name', '50m Geofence Status', 'Distance (Meters)', 'GPS Address', 'Latitude', 'Longitude'],
      ...visits.map((v, i) => [
        i+1,
        `"${user.fullName}"`,
        `"${user.username}"`,
        `"${fmtDate(v.timestamp)}"`,
        `"${fmtTime(v.timestamp)}"`,
        `"${(v.selectedLocationName || 'Field Location').replace(/"/g,"'")}"`,
        `"${v.geofenceStatus || 'IN_RANGE'}"`,
        v.distanceMeters !== null && v.distanceMeters !== undefined ? v.distanceMeters : 'N/A',
        `"${(v.address||'').replace(/"/g,"'")}"`,
        v.latitude.toFixed(6),
        v.longitude.toFixed(6)
      ])
    ];

    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `VisitReport_${user.username}_${dateFrom}_${dateTo}.csv`,
      style: 'display:none'
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.notify(`Downloaded ${visits.length} visits for ${user.fullName}`, 'success');
  }

  function showConfirmModal(title, message, onConfirm) {
    const existing = document.getElementById('report-confirm-modal');
    if (existing) existing.remove();

    if (!document.getElementById('report-confirm-styles')) {
      const style = document.createElement('style');
      style.id = 'report-confirm-styles';
      style.textContent = `
        @keyframes rcFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes rcPopIn  { from{transform:scale(0.8) translateY(20px);opacity:0} to{transform:scale(1) translateY(0);opacity:1} }
        #report-confirm-card { animation: rcPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'report-confirm-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;animation:rcFadeIn 0.2s ease;';

    overlay.innerHTML = `
      <div id="report-confirm-card" style="
        background:var(--bg-card,#fff);
        border-radius:16px;
        padding:32px 28px;
        max-width:420px;
        width:100%;
        text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,0.3);
        font-family:'Segoe UI',sans-serif;
      ">
        <div style="width:64px;height:64px;border-radius:50%;background:#fef2f2;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <span class="material-icons" style="font-size:32px;color:#dc2626;">delete_forever</span>
        </div>
        <h3 style="margin:0 0 8px;font-size:18px;font-weight:800;color:var(--text-primary,#111);">${title}</h3>
        <p style="margin:0 0 24px;font-size:13px;color:var(--text-secondary,#555);line-height:1.6;">${message}</p>
        <div style="display:flex;gap:10px;">
          <button id="rc-cancel-btn" style="flex:1;padding:11px;border-radius:8px;border:1px solid var(--border,#ddd);background:transparent;font-size:14px;font-weight:600;cursor:pointer;color:var(--text-primary,#333);">Cancel</button>
          <button id="rc-confirm-btn" style="flex:1;padding:11px;border-radius:8px;border:none;background:#dc2626;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('rc-cancel-btn').onclick = () => overlay.remove();
    document.getElementById('rc-confirm-btn').onclick = () => { overlay.remove(); onConfirm(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  function deleteCheckin(id) {
    showConfirmModal(
      'Delete Check-in?',
      'Are you sure you want to delete this check-in record? This action cannot be undone.',
      () => {
        if (typeof CheckinsDB !== 'undefined' && CheckinsDB.Checkins.delete) {
          CheckinsDB.Checkins.delete(id);
          App.notify('Check-in deleted successfully.', 'success');
          buildReport();
        }
      }
    );
  }

  function deleteAllCheckins() {
    if (!selectedUserId) {
      App.notify('Please select a user first to delete their records.', 'warning');
      return;
    }
    const user = DB.Users.getById(selectedUserId);

    const visits = CheckinsDB.Checkins.getJoinedCheckins().filter(c => {
      const d = getLocalDateString(c.timestamp);
      const matchUser = c.userId === selectedUserId || (c.username && user.username.toLowerCase() === c.username.toLowerCase());
      return matchUser && d >= dateFrom && d <= dateTo;
    });

    if (visits.length === 0) {
      App.notify('No records found to delete for the selected date range.', 'info');
      return;
    }

    showConfirmModal(
      'Delete All Records?',
      `You are about to delete <strong>${visits.length} check-in records</strong> for <strong>${user.fullName}</strong> between <strong>${dateFrom}</strong> and <strong>${dateTo}</strong>.<br/><br/>This action cannot be undone.`,
      () => {
        if (typeof CheckinsDB !== 'undefined' && CheckinsDB.Checkins.delete) {
          visits.forEach(v => CheckinsDB.Checkins.delete(v.checkinId));
          App.notify(`Deleted ${visits.length} records successfully.`, 'success');
          buildReport();
        }
      }
    );
  }

  return { render, applyFilters, handleSearch, downloadCSV, deleteCheckin, deleteAllCheckins };
})();
