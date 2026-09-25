/**
 * checkins-db.js — Data Access Object for check-in records in localStorage
 */

window.CheckinsDB = (() => {
  const KEY = 'bm_checkins';

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  }

  function write(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  const Checkins = {
    getAll() {
      const list = read();
      let users = [];
      try {
        users = JSON.parse(localStorage.getItem('bm_users')) || [];
      } catch (e) {}
      let updated = false;

      list.forEach(c => {
        let u = users.find(user => user.userId === c.userId);
        if (!u) {
          if (c.userId === 'admin' || c.userId === 'user-admin') {
            u = users.find(user => user.username === 'admin');
          }
          if (u) {
            c.userId = u.userId;
            updated = true;
          }
        }
        if (u) {
          if (!c.username || c.username !== u.username) { c.username = u.username; updated = true; }
          if (!c.fullName || c.fullName !== u.fullName) { c.fullName = u.fullName; updated = true; }
        }
      });

      if (updated) {
        write(list);
      }
      return list;
    },

    getById(id) {
      return this.getAll().find(c => c.checkinId === id) || null;
    },

    add(data) {
      const list = this.getAll();
      const session = (typeof Auth !== 'undefined') ? Auth.getSession() : null;
      const record = {
        checkinId: uuid(),
        userId: data.userId,
        username: session ? session.username : '',
        fullName: session ? session.fullName : '',
        locationId: data.locationId || '', 
        locationName: data.locationName || '', 
        photo: data.photo, // base64 string
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        distanceMeters: data.distanceMeters !== undefined ? Math.round(data.distanceMeters) : null,
        geofenceStatus: data.geofenceStatus || 'IN_RANGE', // 'IN_RANGE' (<=50m) or 'OUT_OF_RANGE' (>50m)
        address: data.address || 'Unknown Address',
        notes: data.notes || '',
        timestamp: new Date().toISOString()
      };
      list.push(record);
      write(list);
      return { success: true, data: record };
    },

    delete(id) {
      const list = this.getAll().filter(c => c.checkinId !== id);
      write(list);
      return { success: true };
    },

    getByUser(userId) {
      const u = (typeof DB !== 'undefined') ? DB.Users.getById(userId) : null;
      return this.getAll().filter(c => {
        if (c.userId === userId) return true;
        if (u && c.username && u.username.toLowerCase() === c.username.toLowerCase()) return true;
        return false;
      });
    },

    getJoinedCheckins() {
      const checkins = this.getAll();
      const users = DB.Users.getAll();
      const locations = DB.Locations.getAll();

      return checkins.map(c => {
        const u = users.find(user => user.userId === c.userId || (c.username && user.username.toLowerCase() === c.username.toLowerCase()));
        const l = locations.find(loc => loc.locationId === c.locationId);
        const assignedLoc = u ? locations.find(loc => loc.locationId === u.locationId) : null;
        return {
          ...c,
          username: u ? u.username : (c.username || 'Unknown'),
          fullName: u ? u.fullName : (c.fullName || 'Unknown User'),
          assignedLocationName: assignedLoc ? assignedLoc.locationName : 'None',
          selectedLocationName: c.locationName || (l ? l.locationName : 'Field Location')
        };
      }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
  };

  return { Checkins };
})();
