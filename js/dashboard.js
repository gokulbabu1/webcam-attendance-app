/**
 * dashboard.js — Dashboard view
 */

window.Dashboard = (() => {
  function render() {
    const session = Auth.getSession();
    const users = DB.Users.getAll();
    const locations = DB.Locations.getAll();
    const activeUsers = users.filter(u => u.status === 'Active').length;
    const activeLocations = locations.filter(l => l.status === 'Active').length;

    // Build recent activity from last 5 modified records
    const allActivity = [
      ...users.map(u => ({
        icon: 'person',
        color: 'blue',
        text: `User <strong>${u.fullName}</strong> ${u.status === 'Active' ? 'is active' : 'was deactivated'}`,
        date: u.updatedDate,
      })),
      ...locations.map(l => ({
        icon: 'location_on',
        color: 'green',
        text: `Location <strong>${l.locationName}</strong> (${l.locationCode}) ${l.status === 'Active' ? 'is active' : 'was deactivated'}`,
        date: l.updatedDate,
      })),
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6);

    const activityHTML = allActivity.length
      ? allActivity
          .map(
            a => `
        <div class="activity-item">
          <div class="activity-icon bg-${a.color}">
            <span class="material-icons">${a.icon}</span>
          </div>
          <div class="activity-body">
            <p>${a.text}</p>
            <small>${formatDate(a.date)}</small>
          </div>
        </div>`
          )
          .join('')
      : '<p class="empty-state">No recent activity.</p>';

    const isAdmin = session.roleName === 'System Administrator';

    if (!isAdmin) {
      // User Dashboard View
      const myVisits = (typeof DB.FieldVisits !== 'undefined') ? DB.FieldVisits.getAll().filter(v => v.userId === session.userId) : [];
      const me = DB.Users.getById(session.userId);
      const myStatus = me ? me.status : 'Inactive';

      App.setContent(`
        <div class="page-header">
          <div>
            <h1 class="page-title">Dashboard</h1>
            <p class="page-subtitle">Welcome back, <strong>${session.fullName}</strong>! Here's your overview.</p>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon bg-blue">
              <span class="material-icons">assignment_turned_in</span>
            </div>
            <div class="stat-info">
              <span class="stat-value">${myVisits.length}</span>
              <span class="stat-label">Total Reports</span>
            </div>
            <div class="stat-footer">
              <span class="badge badge-info">All time</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon ${myStatus === 'Active' ? 'bg-green' : 'bg-red'}">
              <span class="material-icons">${myStatus === 'Active' ? 'check_circle' : 'cancel'}</span>
            </div>
            <div class="stat-info">
              <span class="stat-value">${myStatus}</span>
              <span class="stat-label">Account Status</span>
            </div>
            <div class="stat-footer">
              <span class="badge ${myStatus === 'Active' ? 'badge-success' : 'badge-danger'}">${session.roleName}</span>
            </div>
          </div>
        </div>

        <div class="dashboard-grid" style="grid-template-columns: 1fr;">
          <div class="card">
            <div class="card-header">
              <span class="material-icons">info</span>
              My Profile Info
            </div>
            <div class="card-body">
              <div class="info-row">
                <span class="material-icons">account_circle</span>
                <div>
                  <strong>${session.fullName}</strong>
                  <small>${session.username}</small>
                </div>
              </div>
              <div class="info-row">
                <span class="material-icons">badge</span>
                <div>
                  <strong>Role</strong>
                  <small>${session.roleName}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);
      return;
    }

    // Admin Dashboard View
    App.setContent(`
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Welcome back, <strong>${session.fullName}</strong>! Here's your overview.</p>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon bg-blue">
            <span class="material-icons">people</span>
          </div>
          <div class="stat-info">
            <span class="stat-value">${users.length}</span>
            <span class="stat-label">Total Users</span>
          </div>
          <div class="stat-footer">
            <span class="badge badge-success">${activeUsers} Active</span>
            <span class="badge badge-danger">${users.length - activeUsers} Inactive</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-green">
            <span class="material-icons">location_on</span>
          </div>
          <div class="stat-info">
            <span class="stat-value">${locations.length}</span>
            <span class="stat-label">Total Locations</span>
          </div>
          <div class="stat-footer">
            <span class="badge badge-success">${activeLocations} Active</span>
            <span class="badge badge-danger">${locations.length - activeLocations} Inactive</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-purple">
            <span class="material-icons">admin_panel_settings</span>
          </div>
          <div class="stat-info">
            <span class="stat-value">${DB.Roles.getActive().length}</span>
            <span class="stat-label">Active Roles</span>
          </div>
          <div class="stat-footer">
            <span class="badge badge-info">${session.roleName}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-orange">
            <span class="material-icons">verified_user</span>
          </div>
          <div class="stat-info">
            <span class="stat-value">${activeUsers}</span>
            <span class="stat-label">Active Users</span>
          </div>
          <div class="stat-footer">
            <div class="progress-bar-wrap">
              <div class="progress-bar" style="width:${users.length ? Math.round((activeUsers / users.length) * 100) : 0}%"></div>
            </div>
            <small>${users.length ? Math.round((activeUsers / users.length) * 100) : 0}% active</small>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <span class="material-icons">history</span>
            Recent Activity
          </div>
          <div class="card-body activity-list">
            ${activityHTML}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="material-icons">info</span>
            Quick Info
          </div>
          <div class="card-body">
            <div class="info-row">
              <span class="material-icons">account_circle</span>
              <div>
                <strong>${session.fullName}</strong>
                <small>${session.username}</small>
              </div>
            </div>
            <div class="info-row">
              <span class="material-icons">badge</span>
              <div>
                <strong>Role</strong>
                <small>${session.roleName}</small>
              </div>
            </div>
            <div class="info-row">
              <span class="material-icons">schedule</span>
              <div>
                <strong>Session</strong>
                <small>Active — expires in 8h</small>
              </div>
            </div>
            <div class="quick-actions">
              <button class="btn btn-primary btn-sm" onclick="Router.navigate('master/users')">
                <span class="material-icons">person_add</span> Add User
              </button>
              <button class="btn btn-success btn-sm" onclick="Router.navigate('master/locations')">
                <span class="material-icons">add_location</span> Add Location
              </button>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return { render };
})();
