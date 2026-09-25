/**
 * locations.js — Location Master CRUD view
 */

window.Locations = (() => {
  let currentPage = 1;
  const pageSize = 10;
  let filteredData = [];
  let locMap = null;
  let locMarker = null;

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function render() {
    const session = Auth.getSession();
    const isAdmin = session && session.roleId === 'role-admin';

    App.setContent(`
      <div class="page-header">
        <div>
          <h1 class="page-title">Location Master</h1>
          <p class="page-subtitle">Manage all locations and branches</p>
        </div>
        ${isAdmin ? `<button class="btn btn-primary" id="btn-add-location" onclick="Locations.openForm()">
          <span class="material-icons">add_location</span> Add Location
        </button>` : ''}
      </div>

      <div class="card">
        <div class="card-toolbar">
          <div class="search-box">
            <span class="material-icons">search</span>
            <input type="text" id="loc-search" placeholder="Search locations…" oninput="Locations.applyFilters()" />
          </div>
          <div class="filter-group">
            <select id="loc-status-filter" onchange="Locations.applyFilters()">
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <span id="loc-count" class="record-count"></span>
        </div>

        <div class="table-wrapper">
          <table class="data-table" id="loc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Location ID</th>
                <th>Code</th>
                <th>Location Name</th>
                <th>City</th>
                <th>State</th>
                <th>Country</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="loc-tbody"></tbody>
          </table>
        </div>
        <div class="table-footer">
          <div id="loc-pagination" class="pagination"></div>
        </div>
      </div>

      <!-- Location Form Modal -->
      <div class="modal-overlay" id="loc-modal" style="display:none">
        <div class="modal">
          <div class="modal-header">
            <h2 id="loc-modal-title">Add Location</h2>
            <button class="modal-close" onclick="Locations.closeForm()">
              <span class="material-icons">close</span>
            </button>
          </div>
          <div class="modal-body">
            <form id="loc-form" onsubmit="Locations.saveForm(event)" novalidate>
              <input type="hidden" id="loc-id" />
              <div class="form-grid">
                <div class="form-group">
                  <label for="loc-code">Location Code <span class="req">*</span></label>
                  <input type="text" id="loc-code" placeholder="e.g. HQ" maxlength="20" required />
                  <span class="field-error" id="err-loc-code"></span>
                </div>
                <div class="form-group">
                  <label for="loc-name">Location Name <span class="req">*</span></label>
                  <input type="text" id="loc-name" placeholder="e.g. Headquarters" maxlength="100" required />
                  <span class="field-error" id="err-loc-name"></span>
                </div>
                <div class="form-group form-full">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <label style="margin:0;">Pin Location on Map <span class="req">*</span></label>
                    <div style="display:flex; gap:8px;">
                      <button type="button" class="btn btn-outline btn-sm" onclick="Locations.getCurrentLocation()" style="padding:4px 8px; font-size:12px;">
                        <span class="material-icons" style="font-size:14px; margin-right:4px;">my_location</span> Get Current
                      </button>
                      <button type="button" class="btn btn-outline btn-sm" onclick="Locations.searchMap()" style="padding:4px 8px; font-size:12px;">
                        <span class="material-icons" style="font-size:14px; margin-right:4px;">search</span> Auto-Locate
                      </button>
                    </div>
                  </div>
                  <p style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">Use "Get Current" for your GPS, Map click to pin manually, or "Auto-Locate" to search.</p>
                  <div id="loc-master-map" style="height:250px; border-radius:var(--radius-md); border:1px solid var(--border); background:#e2e8f0; position:relative; z-index:1;"></div>
                  <div style="display:flex; gap:10px; margin-top:8px;">
                    <div style="flex:1;">
                      <label style="font-size:11px; color:var(--text-muted);">Latitude</label>
                      <input type="text" id="loc-lat" readonly style="background:var(--bg-body);" />
                    </div>
                    <div style="flex:1;">
                      <label style="font-size:11px; color:var(--text-muted);">Longitude</label>
                      <input type="text" id="loc-lng" readonly style="background:var(--bg-body);" />
                    </div>
                  </div>
                </div>
                <div class="form-group form-full">
                  <label for="loc-address">Address</label>
                  <input type="text" id="loc-address" placeholder="Street address" maxlength="200" />
                </div>
                <div class="form-group">
                  <label for="loc-city">City</label>
                  <input type="text" id="loc-city" placeholder="City" maxlength="100" />
                </div>
                <div class="form-group">
                  <label for="loc-state">State</label>
                  <input type="text" id="loc-state" placeholder="State" maxlength="100" />
                </div>
                <div class="form-group">
                  <label for="loc-country">Country</label>
                  <input type="text" id="loc-country" placeholder="Country" maxlength="100" />
                </div>
                <div class="form-group">
                  <label for="loc-pincode">Pincode <span style="color:var(--text-muted);font-size:11px;">(for location verification)</span></label>
                  <input type="text" id="loc-pincode" placeholder="e.g. 641201" maxlength="10" />
                </div>
                <div class="form-group">
                  <label for="loc-status">Status</label>
                  <select id="loc-status">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-ghost" onclick="Locations.closeForm()">Cancel</button>
                <button type="submit" class="btn btn-primary" id="loc-save-btn">
                  <span class="material-icons">save</span> Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Confirm Modal -->
      <div class="modal-overlay" id="loc-confirm-modal" style="display:none">
        <div class="modal modal-sm">
          <div class="modal-header danger">
            <h2 id="loc-confirm-title">Confirm Action</h2>
            <button class="modal-close" onclick="Locations.closeConfirm()">
              <span class="material-icons">close</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="confirm-icon">
              <span class="material-icons" id="loc-confirm-icon">warning</span>
            </div>
            <p id="loc-confirm-msg" class="confirm-msg"></p>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" onclick="Locations.closeConfirm()">Cancel</button>
              <button type="button" class="btn btn-danger" id="loc-confirm-btn">Confirm</button>
            </div>
          </div>
        </div>
      </div>
    `);

    applyFilters();
  }

  function applyFilters() {
    const session = Auth.getSession();
    const isAdmin = session && session.roleId === 'role-admin';

    const q = (document.getElementById('loc-search')?.value || '').toLowerCase();
    const status = document.getElementById('loc-status-filter')?.value || '';
    
    let baseData = DB.Locations.search(q, status);
    
    // Allow all users to see all active locations, or just all locations
    if (!isAdmin) {
      filteredData = baseData.filter(l => l.status === 'Active');
    } else {
      filteredData = baseData;
    }
    
    currentPage = 1;
    renderTable();
  }

  function extractCityState(loc) {
    let city = (loc.city || '').trim();
    let state = (loc.state || '').trim();

    // If city is Tamil Nadu or a pincode, fix it to Coimbatore
    if (city === 'Tamil Nadu' || city === 'Tamilnadu' || /^\d{4,6}$/.test(city)) {
      city = 'Coimbatore';
    }
    // If state is a pincode (like 641001 or 641002), fix it to Tamil Nadu
    if (/^\d{4,6}$/.test(state) || !state || state === '—') {
      state = 'Tamil Nadu';
    }
    if (!city || city === '—') {
      city = 'Coimbatore';
    }

    return {
      city: city,
      state: state
    };
  }

  function renderTable() {
    const tbody = document.getElementById('loc-tbody');
    const countEl = document.getElementById('loc-count');
    if (!tbody) return;

    const total = filteredData.length;
    const start = (currentPage - 1) * pageSize;
    const page = filteredData.slice(start, start + pageSize);

    countEl && (countEl.textContent = `${total} record${total !== 1 ? 's' : ''}`);

    const session = Auth.getSession();
    const isAdmin = session && session.roleId === 'role-admin';

    if (page.length === 0) {
      const msg = isAdmin ? 'No locations found.' : 'You have not requested any locations yet. Click "Add Location" to request one.';
      tbody.innerHTML = `<tr><td colspan="11" class="empty-row">${msg}</td></tr>`;
      renderPagination(total);
      return;
    }

    tbody.innerHTML = page
      .map((loc, i) => {
        const cs = extractCityState(loc);
        let actionHtml = '';
        
        if (isAdmin) {
          if (loc.status === 'Pending') {
            actionHtml = `
              <button class="btn btn-sm btn-primary" title="Approve this location" onclick="Locations.approveLocation('${loc.locationId}')" style="font-size:12px; padding:4px 8px;">
                Approve
              </button>
              <button class="icon-btn danger" title="Delete" onclick="Locations.confirmDelete('${loc.locationId}', '${loc.locationName}')">
                <span class="material-icons">delete</span>
              </button>
            `;
          } else {
            actionHtml = `
              <button class="icon-btn edit" title="Edit" onclick="Locations.openForm('${loc.locationId}')">
                <span class="material-icons">edit</span>
              </button>
              <button class="icon-btn ${loc.status === 'Active' ? 'warn' : 'success'}" title="${loc.status === 'Active' ? 'Deactivate' : 'Activate'}"
                onclick="Locations.confirmToggle('${loc.locationId}', '${loc.status}', '${loc.locationName}')">
                <span class="material-icons">${loc.status === 'Active' ? 'block' : 'check_circle'}</span>
              </button>
              <button class="icon-btn danger" title="Delete" onclick="Locations.confirmDelete('${loc.locationId}', '${loc.locationName}')">
                <span class="material-icons">delete</span>
              </button>
            `;
          }
        } else {
          // Employee actions
          actionHtml = `<span style="font-size:12px; color:var(--text-muted);">View Only</span>`;
        }

        return `
        <tr>
          <td>${start + i + 1}</td>
          <td><code class="id-chip">${loc.locationId.substring(0, 8)}…</code></td>
          <td><span class="code-badge">${loc.locationCode}</span></td>
          <td><strong>${loc.locationName}</strong></td>
          <td><strong style="color:var(--text-main);">${cs.city}</strong></td>
          <td><strong style="color:var(--text-main);">${cs.state}</strong></td>
          <td>${loc.country || 'India'}</td>
          <td><span class="badge ${loc.status === 'Active' ? 'badge-success' : (loc.status === 'Pending' ? 'badge-warn' : 'badge-danger')}">${loc.status}</span></td>
          <td>${formatDate(loc.createdDate)}</td>
          <td>${formatDate(loc.updatedDate)}</td>
          <td>
            <div class="action-btns">
              ${actionHtml}
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    renderPagination(total);
  }

  function renderPagination(total) {
    const pag = document.getElementById('loc-pagination');
    if (!pag) return;
    const pages = Math.ceil(total / pageSize);
    if (pages <= 1) { pag.innerHTML = ''; return; }

    let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="Locations.goPage(${currentPage - 1})">
      <span class="material-icons">chevron_left</span></button>`;
    for (let p = 1; p <= pages; p++) {
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="Locations.goPage(${p})">${p}</button>`;
    }
    html += `<button class="page-btn" ${currentPage === pages ? 'disabled' : ''} onclick="Locations.goPage(${currentPage + 1})">
      <span class="material-icons">chevron_right</span></button>`;
    pag.innerHTML = html;
  }

  function goPage(p) { currentPage = p; renderTable(); }

  function openForm(id = null) {
    const session = Auth.getSession();
    const isAdmin = session && session.roleId === 'role-admin';
    const modal = document.getElementById('loc-modal');
    const title = document.getElementById('loc-modal-title');
    
    // Hide fields for employees
    const statusGroup = document.getElementById('loc-status').closest('.form-group');
    const codeGroup = document.getElementById('loc-code').closest('.form-group');
    if (!isAdmin) {
      statusGroup.style.display = 'none';
      codeGroup.style.display = 'none';
    } else {
      statusGroup.style.display = 'block';
      codeGroup.style.display = 'block';
    }
    clearFormErrors();

    let lat = 11.0168; // Default Coimbatore
    let lng = 76.9558;

    if (id) {
      const loc = DB.Locations.getById(id);
      if (!loc) return;
      title.textContent = 'Edit Location';
      document.getElementById('loc-id').value = loc.locationId;
      document.getElementById('loc-code').value = loc.locationCode;
      document.getElementById('loc-name').value = loc.locationName;
      document.getElementById('loc-address').value = loc.address || '';
      document.getElementById('loc-city').value = loc.city || '';
      document.getElementById('loc-state').value = loc.state || '';
      document.getElementById('loc-country').value = loc.country || '';
      document.getElementById('loc-pincode').value = loc.pincode || '';
      document.getElementById('loc-status').value = loc.status;
      if (loc.latitude && loc.longitude) {
        lat = loc.latitude;
        lng = loc.longitude;
      }
      document.getElementById('loc-lat').value = lat;
      document.getElementById('loc-lng').value = lng;
    } else {
      title.textContent = 'Add Location';
      document.getElementById('loc-form').reset();
      document.getElementById('loc-id').value = '';
      document.getElementById('loc-code').value = isAdmin ? '' : 'REQ-' + Date.now().toString().slice(-6);
      document.getElementById('loc-lat').value = lat;
      document.getElementById('loc-lng').value = lng;
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      modal.querySelector('.modal').classList.add('modal-in');
      initMap(lat, lng);
    }, 10);
    document.getElementById('loc-code').focus();
  }

  function initMap(lat, lng) {
    if (!locMap) {
      locMap = L.map('loc-master-map').setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(locMap);
      locMarker = L.marker([lat, lng]).addTo(locMap);

      locMap.on('click', async (e) => {
        const clat = e.latlng.lat;
        const clng = e.latlng.lng;
        locMarker.setLatLng([clat, clng]);
        document.getElementById('loc-lat').value = clat.toFixed(6);
        document.getElementById('loc-lng').value = clng.toFixed(6);

        // Reverse Geocoding to auto-fill address
        try {
          const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${clat}&lon=${clng}&format=json`, {
            headers: { 'Accept-Language': 'en', 'User-Agent': 'WebcamEnterpriseSuite/1.0' }
          });
          const data = await resp.json();
          if (data && data.address) {
            const addr = data.address;
            if (addr.road || addr.suburb) document.getElementById('loc-address').value = `${addr.road || ''} ${addr.suburb || ''}`.trim();
            if (addr.city || addr.town || addr.village) document.getElementById('loc-city').value = addr.city || addr.town || addr.village;
            if (addr.state) document.getElementById('loc-state').value = addr.state;
            if (addr.country) document.getElementById('loc-country').value = addr.country;
            if (addr.postcode) document.getElementById('loc-pincode').value = addr.postcode;
          }
        } catch (err) {
          console.warn('Reverse geocoding failed', err);
        }
      });
    } else {
      locMap.setView([lat, lng], 15);
      locMarker.setLatLng([lat, lng]);
      setTimeout(() => {
        if (locMap) locMap.invalidateSize();
      }, 300);
    }
  }

  async function searchMap() {
    const query = document.getElementById('loc-name').value.trim();
    
    if (!query) {
      App.notify('Please enter a Location Name to search.', 'warning');
      return;
    }

    App.notify('Searching map...', 'info');
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'WebcamEnterpriseSuite/1.0' }
      });
      const data = await resp.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        if (locMap && locMarker) {
          locMap.setView([lat, lon], 16);
          locMarker.setLatLng([lat, lon]);
          document.getElementById('loc-lat').value = lat.toFixed(6);
          document.getElementById('loc-lng').value = lon.toFixed(6);
          
          // trigger the click event manually to reverse-geocode
          locMap.fire('click', { latlng: { lat: lat, lng: lon } });
        }
        App.notify('Location found and pinned!', 'success');
      } else {
        App.notify('Location not found on map. Please try a different name or pin manually.', 'error');
      }
    } catch (e) {
      App.notify('Search failed. Check your internet connection.', 'error');
    }
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      App.notify('Geolocation is not supported by your browser.', 'error');
      return;
    }
    App.notify('Fetching your current location...', 'info');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        if (locMap && locMarker) {
          locMap.setView([lat, lon], 16);
          locMarker.setLatLng([lat, lon]);
          document.getElementById('loc-lat').value = lat.toFixed(6);
          document.getElementById('loc-lng').value = lon.toFixed(6);
          
          // trigger the click event manually to reverse-geocode and fill address fields
          locMap.fire('click', { latlng: { lat: lat, lng: lon } });
        }
        App.notify('Current location acquired!', 'success');
      },
      (err) => {
        console.error(err);
        App.notify('Failed to get location: ' + err.message, 'error');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  function closeForm() {
    const modal = document.getElementById('loc-modal');
    modal.querySelector('.modal').classList.remove('modal-in');
    setTimeout(() => { modal.style.display = 'none'; }, 250);
  }

  function clearFormErrors() {
    ['err-loc-code', 'err-loc-name'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  }

  async function saveForm(e) {
    e.preventDefault();
    clearFormErrors();
    const id = document.getElementById('loc-id').value;
    const code = document.getElementById('loc-code').value.trim();
    const name = document.getElementById('loc-name').value.trim();

    let valid = true;
    if (!code) { 
      document.getElementById('err-loc-code').textContent = 'Location code is required.'; 
      App.notify('Location code is required.', 'warning');
      valid = false; 
    }
    if (!name) { 
      document.getElementById('err-loc-name').textContent = 'Location name is required.'; 
      App.notify('Location name is required.', 'warning');
      valid = false; 
    }
    if (!valid) return;

    const data = {
      locationCode: code,
      locationName: name,
      address: document.getElementById('loc-address').value,
      city: document.getElementById('loc-city').value,
      state: document.getElementById('loc-state').value,
      country: document.getElementById('loc-country').value,
      pincode: document.getElementById('loc-pincode').value,
      status: document.getElementById('loc-status').value,
      latitude: parseFloat(document.getElementById('loc-lat').value) || null,
      longitude: parseFloat(document.getElementById('loc-lng').value) || null,
    };

    const result = id ? DB.Locations.update(id, data) : DB.Locations.add(data);
    if (!result.success) {
      App.notify(result.message, 'error');
      if (result.message.includes('code')) document.getElementById('err-loc-code').textContent = result.message;
      return;
    }

    App.notify(`Location ${id ? 'updated' : 'added'} successfully.`, 'success');
    closeForm();
    applyFilters();
  }

  function confirmToggle(id, currentStatus, name) {
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    const action = newStatus === 'Inactive' ? 'deactivate' : 'activate';
    showConfirm(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Location`,
      `Are you sure you want to ${action} <strong>${name}</strong>?`,
      newStatus === 'Inactive' ? 'warning' : 'check_circle',
      () => {
        const result = DB.Locations.setStatus(id, newStatus);
        if (result.success) {
          App.notify(`Location ${newStatus === 'Active' ? 'activated' : 'deactivated'}.`, 'success');
          applyFilters();
        } else {
          App.notify(result.message, 'error');
        }
      }
    );
  }

  function confirmDelete(id, name) {
    showConfirm(
      'Delete Location',
      `Are you sure you want to permanently delete <strong>${name}</strong>? This action cannot be undone.`,
      'delete_forever',
      () => {
        const result = DB.Locations.delete(id);
        if (result.success) {
          App.notify('Location deleted.', 'success');
          applyFilters();
        } else {
          App.notify(result.message, 'error');
        }
      }
    );
  }

  function approveLocation(id) {
    showConfirm(
      'Approve Location',
      'Are you sure you want to approve this location? This will activate the location and assign it to the requesting employee.',
      'check_circle',
      () => {
        const result = DB.Locations.approve(id);
        if (result.success) {
          App.notify('Location approved and assigned successfully!', 'success');
          applyFilters();
        } else {
          App.notify(result.message, 'error');
        }
      }
    );
  }

  let _confirmCb = null;
  function showConfirm(title, msg, icon, cb) {
    _confirmCb = cb;
    document.getElementById('loc-confirm-title').textContent = title;
    document.getElementById('loc-confirm-msg').innerHTML = msg;
    document.getElementById('loc-confirm-icon').textContent = icon;
    document.getElementById('loc-confirm-btn').onclick = () => { closeConfirm(); cb(); };
    const m = document.getElementById('loc-confirm-modal');
    m.style.display = 'flex';
    setTimeout(() => m.querySelector('.modal').classList.add('modal-in'), 10);
  }

  function closeConfirm() {
    const m = document.getElementById('loc-confirm-modal');
    m.querySelector('.modal').classList.remove('modal-in');
    setTimeout(() => { m.style.display = 'none'; }, 250);
  }

  return { render, applyFilters, openForm, closeForm, saveForm, confirmToggle, confirmDelete, approveLocation, closeConfirm, goPage, searchMap, getCurrentLocation };
})();
