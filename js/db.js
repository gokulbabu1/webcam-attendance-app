/**
 * db.js — Relational database layer backed by localStorage
 * Tables: bm_roles, bm_locations, bm_users
 */

window.DB = (() => {
  const KEYS = {
    roles: 'bm_roles',
    locations: 'bm_locations',
    users: 'bm_users',
    initialized: 'bm_initialized',
    deletedUsers: 'bm_deleted_users',
    deletedLocations: 'bm_deleted_locations',
  };

  // ── Utility ──────────────────────────────────────────────────────────────

  function uuid() {
    // Use a pure-Math.random approach for maximum compatibility (file://)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function now() {
    return new Date().toISOString();
  }

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  }

  function write(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ── Roles ─────────────────────────────────────────────────────────────────

  const Roles = {
    getAll() { return read(KEYS.roles); },

    getById(id) { return this.getAll().find(r => r.roleId === id) || null; },

    getActive() { return this.getAll().filter(r => r.status === 'Active'); },
  };

  // ── Locations ─────────────────────────────────────────────────────────────

  const Locations = {
    getAll() {
      const list = read(KEYS.locations);
      let deletedLocIds = read(KEYS.deletedLocations);

      // Self-heal: if a location ID is in deletedLocations but the record still
      // physically exists in bm_locations, the delete failed mid-way — remove it
      // from deletedLocations so it becomes visible again.
      const staleDel = deletedLocIds.filter(id =>
        list.some(l => l.locationId === id) &&
        id !== 'loc-hq' && id !== 'loc-branch1' && id !== 'loc-aquasub-1'
      );
      if (staleDel.length > 0) {
        deletedLocIds = deletedLocIds.filter(id => !staleDel.includes(id));
        write(KEYS.deletedLocations, deletedLocIds);
      }

      const filtered = list.filter(l =>
        l.locationId !== 'loc-hq' &&
        l.locationId !== 'loc-branch1' &&
        l.locationId !== 'loc-aquasub-1' &&
        !deletedLocIds.includes(l.locationId)
      );

      let needsRewrite = false;
      const cleaned = filtered.map(l => {
        let city = (l.city || '').trim();
        let state = (l.state || '').trim();

        if (city === 'Tamil Nadu' || city === 'Tamilnadu' || /^\d{4,6}$/.test(city) || !city || city === '—') {
          city = 'Coimbatore';
          needsRewrite = true;
        }
        if (/^\d{4,6}$/.test(state) || !state || state === '—') {
          state = 'Tamil Nadu';
          needsRewrite = true;
        }

        return {
          ...l,
          city: city,
          state: state,
          country: l.country || 'India'
        };
      });

      if (needsRewrite) {
        write(KEYS.locations, cleaned);
      }

      return cleaned;
    },

    getById(id) { return this.getAll().find(l => l.locationId === id) || null; },

    getActive() { return this.getAll().filter(l => l.status === 'Active'); },

    codeExists(code, excludeId = null) {
      return this.getAll().some(
        l => l.locationCode.toLowerCase() === code.toLowerCase() && l.locationId !== excludeId
      );
    },

    create(data) {
      const locations = this.getAll();
      if (this.codeExists(data.locationCode)) {
        return { success: false, message: 'Location code already exists.' };
      }
      const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      const isAdmin = session && session.roleId === 'role-admin';
      
      const newLoc = {
        locationId: 'loc-' + Date.now(),
        locationCode: data.locationCode.trim().toUpperCase(),
        locationName: data.locationName.trim(),
        address: (data.address || '').trim(),
        city: (data.city || '').trim(),
        state: (data.state || '').trim(),
        country: (data.country || '').trim(),
        pincode: (data.pincode || '').trim(),
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        status: isAdmin ? (data.status || 'Active') : 'Pending', // Employees create pending locations
        requestedBy: data.requestedBy || (isAdmin ? null : (session ? session.userId : null)),
        createdDate: now(),
        updatedDate: now(),
      };
      locations.push(newLoc);
      write(KEYS.locations, locations);
      return { success: true, data: newLoc };
    },

    add(data) {
      return this.create(data);
    },

    update(id, data) {
      const locations = this.getAll();
      const idx = locations.findIndex(l => l.locationId === id);
      if (idx === -1) return { success: false, message: 'Location not found.' };
      if (this.codeExists(data.locationCode, id)) {
        return { success: false, message: 'Location code already exists.' };
      }
      locations[idx] = {
        ...locations[idx],
        locationCode: data.locationCode.trim().toUpperCase(),
        locationName: data.locationName.trim(),
        address: (data.address || '').trim(),
        city: (data.city || '').trim(),
        state: (data.state || '').trim(),
        country: (data.country || '').trim(),
        pincode: (data.pincode || '').trim(),
        latitude: data.latitude !== undefined ? data.latitude : locations[idx].latitude,
        longitude: data.longitude !== undefined ? data.longitude : locations[idx].longitude,
        status: data.status || locations[idx].status,
        updatedDate: now(),
      };
      write(KEYS.locations, locations);
      return { success: true, data: locations[idx] };
    },

    delete(id) {
      // Check if any users reference this location FIRST before marking as deleted
      const users = Users.getAll();
      if (users.some(u => u.locationId === id)) {
        return { success: false, message: 'Cannot delete: users are assigned to this location.' };
      }
      // Only mark as deleted AFTER confirming delete will succeed
      const deleted = read(KEYS.deletedLocations);
      if (!deleted.includes(id)) { deleted.push(id); write(KEYS.deletedLocations, deleted); }
      const locations = read(KEYS.locations).filter(l => l.locationId !== id);
      write(KEYS.locations, locations);
      return { success: true };
    },

    setStatus(id, status) {
      const locations = this.getAll();
      const idx = locations.findIndex(l => l.locationId === id);
      if (idx === -1) return { success: false, message: 'Location not found.' };
      locations[idx].status = status;
      locations[idx].updatedDate = now();
      write(KEYS.locations, locations);
      return { success: true, data: locations[idx] };
    },

    approve(id) {
      const locations = this.getAll();
      const idx = locations.findIndex(l => l.locationId === id);
      if (idx === -1) return { success: false, message: 'Location not found.' };
      
      locations[idx].status = 'Active';
      locations[idx].updatedDate = now();
      write(KEYS.locations, locations);
      
      // If an employee requested it, automatically assign it to them
      const requestedBy = locations[idx].requestedBy;
      if (requestedBy) {
        const users = Users.getAll();
        const userIdx = users.findIndex(u => u.userId === requestedBy);
        if (userIdx !== -1) {
          users[userIdx].locationId = id;
          users[userIdx].updatedDate = now();
          write(KEYS.users, users);
        }
      }
      
      return { success: true, data: locations[idx] };
    },

    search(query, statusFilter = '') {
      const q = query.toLowerCase();
      return this.getAll().filter(l => {
        const matchText =
          !q ||
          l.locationCode.toLowerCase().includes(q) ||
          l.locationName.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q) ||
          l.state.toLowerCase().includes(q) ||
          l.country.toLowerCase().includes(q);
        const matchStatus = !statusFilter || l.status === statusFilter;
        return matchText && matchStatus;
      });
    },
  };

  // ── Users ─────────────────────────────────────────────────────────────────

  const Users = {
    getAll() {
      const users = read(KEYS.users);
      const locs = Locations.getAll();
      const firstLocId = locs.length > 0 ? locs[locs.length - 1].locationId : '';

      // Auto-sync users who submitted check-ins into User Master
      if (typeof CheckinsDB !== 'undefined') {
        const checkins = CheckinsDB.Checkins.getAll();
        const deletedIds = read(KEYS.deletedUsers).map(d => d.userId || d);
        let addedNew = false;
        checkins.forEach(c => {
          // Skip if this user was explicitly deleted
          if (deletedIds.includes(c.userId)) return;
          if (c.userId && !users.some(u => u.userId === c.userId || u.username === c.username)) {
            users.push({
              userId: c.userId,
              username: c.username || 'field_user',
              fullName: c.fullName || 'Field Employee',
              email: `${c.username || 'user'}@company.com`,
              mobileNumber: '',
              roleId: 'role-user',
              locationId: c.locationId || firstLocId,
              status: 'Active',
              createdDate: c.timestamp || now(),
              updatedDate: c.timestamp || now()
            });
            addedNew = true;
          }
        });
        if (addedNew) {
          write(KEYS.users, users);
        }
      }

      // Backfill userCode for existing users who don't have one
      let needsWrite = false;
      let empCounter = 0;
      users.forEach(u => {
        if (!u.userCode || !u.userCode.startsWith('EMP-')) {
          empCounter++;
          u.userCode = `EMP-${String(empCounter).padStart(3, '0')}`;
          needsWrite = true;
        } else {
          const n = parseInt(u.userCode.replace('EMP-', ''), 10);
          if (!isNaN(n) && n > empCounter) empCounter = n;
        }
      });
      if (needsWrite) write(KEYS.users, users);

      return users.map(u => {
        let locId = u.locationId;
        if ((locId === 'loc-hq' || locId === 'loc-branch1' || !locId) && firstLocId) {
          locId = firstLocId;
        }
        return {
          ...u,
          locationId: locId
        };
      });
    },

    getById(id) { return this.getAll().find(u => u.userId === id) || null; },

    getByUsername(username) {
      return this.getAll().find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
    },

    usernameExists(username, excludeId = null) {
      return this.getAll().some(
        u => u.username.toLowerCase() === username.toLowerCase() && u.userId !== excludeId
      );
    },

    generateUserCode() {
      const users = read(KEYS.users);
      // Find highest existing EMP-NNN number
      let max = 0;
      users.forEach(u => {
        if (u.userCode && u.userCode.startsWith('EMP-')) {
          const n = parseInt(u.userCode.replace('EMP-', ''), 10);
          if (!isNaN(n) && n > max) max = n;
        }
      });
      const next = String(max + 1).padStart(3, '0');
      return `EMP-${next}`;
    },

    add(data) {
      if (this.usernameExists(data.username)) {
        return { success: false, message: 'Username already exists.' };
      }
      const record = {
        userId: uuid(),
        userCode: data.userCode || this.generateUserCode(),
        username: data.username.trim(),
        passwordHash: data.passwordHash,
        fullName: data.fullName.trim(),
        email: (data.email || '').trim(),
        mobileNumber: (data.mobileNumber || '').trim(),
        photo: data.photo || null,
        roleId: data.roleId || '',
        locationId: data.locationId || '',
        status: data.status || 'Active',
        createdDate: now(),
        updatedDate: now(),
      };
      const users = this.getAll();
      users.push(record);
      write(KEYS.users, users);
      return { success: true, data: record };
    },

    update(id, data) {
      const users = this.getAll();
      const idx = users.findIndex(u => u.userId === id);
      if (idx === -1) return { success: false, message: 'User not found.' };
      if (this.usernameExists(data.username, id)) {
        return { success: false, message: 'Username already exists.' };
      }
      users[idx] = {
        ...users[idx],
        userCode: data.userCode !== undefined ? data.userCode.trim() : users[idx].userCode,
        username: data.username.trim(),
        fullName: data.fullName.trim(),
        email: (data.email || '').trim(),
        mobileNumber: (data.mobileNumber || '').trim(),
        photo: data.photo !== undefined ? data.photo : users[idx].photo,
        roleId: data.roleId || users[idx].roleId,
        locationId: data.locationId !== undefined ? data.locationId : users[idx].locationId,
        refLatitude: data.refLatitude !== undefined ? data.refLatitude : users[idx].refLatitude,
        refLongitude: data.refLongitude !== undefined ? data.refLongitude : users[idx].refLongitude,
        status: data.status || users[idx].status,
        updatedDate: now(),
      };
      if (data.passwordHash) {
        users[idx].passwordHash = data.passwordHash;
      }
      write(KEYS.users, users);
      return { success: true, data: users[idx] };
    },

    delete(id) {
      // Track deleted user IDs so auto-sync won't re-add them
      const deleted = read(KEYS.deletedUsers);
      if (!deleted.includes(id)) { deleted.push(id); write(KEYS.deletedUsers, deleted); }
      const users = read(KEYS.users).filter(u => u.userId !== id);
      write(KEYS.users, users);
      return { success: true };
    },

    // Save or update reference GPS position for a user (first check-in sets it)
    saveRefPosition(userId, lat, lng) {
      const users = this.getAll();
      const idx = users.findIndex(u => u.userId === userId);
      if (idx === -1) return { success: false };
      users[idx].refLatitude  = lat;
      users[idx].refLongitude = lng;
      users[idx].updatedDate  = now();
      write(KEYS.users, users);
      return { success: true };
    },

    setStatus(id, status) {
      const users = this.getAll();
      const idx = users.findIndex(u => u.userId === id);
      if (idx === -1) return { success: false, message: 'User not found.' };
      users[idx].status = status;
      users[idx].updatedDate = now();
      write(KEYS.users, users);
      return { success: true, data: users[idx] };
    },

    updatePassword(id, passwordHash) {
      const users = this.getAll();
      const idx = users.findIndex(u => u.userId === id);
      if (idx === -1) return { success: false };
      users[idx].passwordHash = passwordHash;
      users[idx].updatedDate = now();
      write(KEYS.users, users);
      return { success: true };
    },

    search(query, statusFilter = '', roleFilter = '') {
      const q = query.toLowerCase();
      const allUsers = this.getAll();
      const allLocations = Locations.getAll();
      const allRoles = Roles.getAll();

      return allUsers
        .filter(u => {
          const loc = allLocations.find(l => l.locationId === u.locationId);
          const role = allRoles.find(r => r.roleId === u.roleId);
          const matchText =
            !q ||
            u.username.toLowerCase().includes(q) ||
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.mobileNumber.includes(q) ||
            (loc && loc.locationName.toLowerCase().includes(q)) ||
            (role && role.roleName.toLowerCase().includes(q));
          const matchStatus = !statusFilter || u.status === statusFilter;
          const matchRole = !roleFilter || u.roleId === roleFilter;
          return matchText && matchStatus && matchRole;
        })
        .map(u => {
          let loc = allLocations.find(l => l.locationId === u.locationId);
          if (!loc) {
            const userCheckins = (typeof CheckinsDB !== 'undefined') ? CheckinsDB.Checkins.getByUser(u.userId) : [];
            if (userCheckins.length > 0) {
              const lastCheckin = userCheckins[userCheckins.length - 1];
              loc = { locationName: lastCheckin.selectedLocationName };
            } else if (allLocations.length > 0) {
              loc = allLocations[allLocations.length - 1];
            }
          }
          const role = allRoles.find(r => r.roleId === u.roleId);
          return {
            ...u,
            locationName: loc ? loc.locationName : '—',
            roleName: role ? role.roleName : '—',
          };
        });
    },
  };

  // ── Seed Data ─────────────────────────────────────────────────────────────

  async function seed() {
    // Always ensure roles exist
    const existingRoles = read(KEYS.roles);
    if (existingRoles.length === 0) {
      const roles = [
        { roleId: 'role-admin',   roleName: 'Admin',   status: 'Active' },
        { roleId: 'role-manager', roleName: 'Manager', status: 'Active' },
        { roleId: 'role-user',    roleName: 'User',    status: 'Active' },
      ];
      write(KEYS.roles, roles);
    }

    // Always ensure the correct admin and default employee exist with correct passwords
    const adminHash = await Auth.hashPassword('Admin@123');
    const empHash   = await Auth.hashPassword('recreate');

    const existingUsers = read(KEYS.users);

    // Create Admin user only if it doesn't exist
    const adminIdx = existingUsers.findIndex(u => u.userId === 'user-admin' || u.username.toLowerCase() === 'admin');
    if (adminIdx === -1) {
      existingUsers.push({
        userId:       'user-admin',
        userCode:     'EMP-000',
        username:     'admin',
        passwordHash: adminHash,
        fullName:     'System Administrator',
        email:        'admin@webcam.com',
        mobileNumber: '9999999999',
        photo:        null,
        roleId:       'role-admin',
        locationId:   '',
        status:       'Active',
        createdDate:  new Date().toISOString(),
        updatedDate:  new Date().toISOString(),
      });
    }

    // Create EMP01 user only if it doesn't exist
    const empIdx = existingUsers.findIndex(u => u.userId === 'user-emp01' || u.username.toLowerCase() === 'emp01');
    if (empIdx === -1) {
      existingUsers.push({
        userId:       'user-emp01',
        userCode:     'EMP-001',
        username:     'emp01',
        passwordHash: empHash,
        fullName:     'Employee One',
        email:        'emp01@webcam.com',
        mobileNumber: '',
        photo:        null,
        roleId:       'role-user',
        locationId:   '',
        status:       'Active',
        createdDate:  new Date().toISOString(),
        updatedDate:  new Date().toISOString(),
      });
    }

    write(KEYS.users, existingUsers);
    localStorage.setItem(KEYS.initialized, 'true');
  }

  return { Roles, Locations, Users, seed };
})();

