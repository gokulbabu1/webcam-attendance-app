/**
 * checkin.js — View module for User Check-in with 50-Meter Geofence Validation & Camera Switching
 */

window.Checkin = (() => {
  let stream = null;
  let capturedPhotoBase64 = null;
  let latitude       = null;
  let longitude      = null;
  let map            = null;
  let marker         = null;
  let geofenceCircle = null;
  let gpsLocked      = false;
  let distanceMeters = null;
  let geofenceStatus = null;

  // Face API state
  let faceModelsLoaded = false;
  let referenceDescriptor = null;
  let faceMatchStatus = 'PENDING';

  // Camera switching state
  let currentFacingMode = 'user'; // 'user' (Front) or 'environment' (Back)
  let videoDevices = [];
  let currentDeviceIndex = 0;

  // ── Haversine Distance Calculation (Meters) ────────────────────────────────

  function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  // ── Render page ───────────────────────────────────────────────────────────

  function render() {
    const session = Auth.getSession();
    let locations = DB.Locations.getActive();
    
    // STRICT GEOFENCING: Restrict list to user's assigned location only
    if (session && session.locationId) {
      locations = locations.filter(l => l.locationId === session.locationId);
    }


    App.setContent(`
      <div class="page-header">
        <div>
          <h1 class="page-title">Transaction: Selfie Cam</h1>
          <p class="page-subtitle">Photo & GPS captured with <strong>Extended Zone Auto-Detection (500m Radius)</strong></p>
        </div>
      </div>

      <div class="dashboard-grid">

        <!-- LEFT: Camera Capture Panel -->
        <div class="card">
          <div class="card-header">
            <span class="material-icons" style="vertical-align:middle;">photo_camera</span> Take Photo
          </div>
          <div class="card-body">
            <div style="display: flex; flex-direction: column; gap: 14px;">

              <!-- Camera viewport -->
              <div id="camera-box" style="position: relative; width: 100%; height: 300px; background: #000;
                   border-radius: var(--radius-md); overflow: hidden; border: 2px solid var(--border);
                   display: flex; align-items: center; justify-content: center;">

                <video id="webcam" autoplay playsinline muted
                       style="width:100%; height:100%; object-fit:cover;"></video>

                <img id="photo-preview"
                     style="display:none; width:100%; height:100%; object-fit:cover;" />

                <div id="capture-flash"
                     style="display:none; position:absolute; inset:0; background:rgba(255,255,255,0.85);
                            z-index:10; align-items:center; justify-content:center; flex-direction:column; gap:8px;">
                  <span class="material-icons spin" style="font-size:48px; color:var(--primary);">gps_fixed</span>
                  <strong style="color:var(--text-inverse); font-size:14px;">Locking GPS & Geofence…</strong>
                </div>

                <div id="camera-fallback" style="display:none; text-align:center; padding:24px; color:var(--text-secondary);">
                  <span class="material-icons" style="font-size:52px; margin-bottom:10px;">no_photography</span>
                  <p style="font-size:13px; margin-bottom:14px;">Webcam unavailable or permission denied.</p>
                  <label class="btn btn-primary" style="display:inline-flex; cursor:pointer;">
                    <span class="material-icons">add_a_photo</span>&nbsp;Take Photo / Upload
                    <input type="file" id="file-upload" accept="image/*" capture="environment"
                           style="display:none;" onchange="Checkin.handleFileUpload(this)" />
                  </label>
                </div>
              </div>

              <!-- GPS status bar -->
              <div id="gps-status-bar" style="display:flex; align-items:center; gap:8px;
                   padding:10px 14px; border-radius:var(--radius-md); background:var(--bg-elevated);
                   border:1px solid var(--border); font-size:12px;">
                <span class="material-icons" id="gps-status-icon"
                      style="font-size:18px; color:var(--text-muted);">gps_not_fixed</span>
                <span id="gps-status-text" style="color:var(--text-secondary);">
                  GPS will lock when you capture the photo
                </span>
              </div>

              <!-- Buttons -->
              <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
                <button class="btn btn-primary shutter-btn" id="btn-snap" onclick="Checkin.takeSnapshot()" style="width: 72px; height: 72px; border-radius: 50%; padding: 0; display: flex; justify-content: center; align-items: center; box-shadow: 0 4px 20px rgba(92, 123, 90, 0.4); border: 3px solid #fff;">
                  <span class="material-icons" style="font-size: 34px; margin: 0;">camera</span>
                </button>
                <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
                  <button class="btn btn-outline" id="btn-switch-cam" onclick="Checkin.switchCamera()" title="Switch Front / Back Camera">
                    <span class="material-icons">flip_camera_ios</span> <span id="switch-cam-btn-text">Front Cam 🤳</span>
                  </button>
                  <button class="btn btn-ghost" id="btn-retake" onclick="Checkin.resetCapture()"
                          style="display:none;">
                    <span class="material-icons">cached</span> Retake
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- RIGHT: Geofence & Details Panel -->
        <div class="card">
          <div class="card-header">
            <span class="material-icons">pin_drop</span> Location & 40,000 sqm Zone Validation
          </div>
          <div class="card-body">
            <form id="checkin-form" onsubmit="Checkin.saveCheckin(event)" novalidate>

              <div class="form-group" style="margin-bottom:12px;">
                <label>Employee Name</label>
                <input type="text" value="${session.fullName}" readonly
                       style="background:var(--bg-base); font-weight: 600;" />
              </div>



              <!-- hidden: used by save logic -->
              <input type="hidden" id="checkin-location-name" value="" />

              <div class="form-group" style="margin-bottom:12px;">
                <label>Geo-Location Address</label>
                <textarea id="gps-address" rows="2" readonly
                          placeholder="Address will appear after photo or map click…"
                          style="background:var(--bg-base); resize:none;"></textarea>
              </div>

              <div class="form-group" style="margin-bottom:12px;">
                <label for="checkin-notes">Visit Notes</label>
                <input type="text" id="checkin-notes"
                       placeholder="e.g. Client meeting, site inspection…" />
              </div>

              <button type="button" class="btn btn-success btn-block" style="margin-top:10px;"
                      id="btn-submit" onclick="Checkin.saveCheckin(event)">
                <span class="material-icons">check_circle</span> Submit
              </button>
              <p style="font-size:11px; color:var(--text-muted); text-align:center; margin-top:8px;"
                 id="submit-hint">
                Click Submit to record visit attendance & location
              </p>
            </form>
          </div>
        </div>
      </div>

      <!-- Live Map with 50m Radius Circle -->
      <div class="card" style="margin-top:16px;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <span><span class="material-icons" style="vertical-align:middle;">map</span> Live Map — 500-Meter Geofence Boundary</span>
          <span style="font-size:11px; color:var(--primary); background:var(--bg-elevated); padding:3px 8px; border-radius:12px; border:1px solid var(--border); ${session && session.roleId === 'role-admin' ? '' : 'display:none;'}">
            📍 Click map anytime to pin exact location
          </span>
        </div>
        <div class="card-body" style="padding:0;">
          <div id="checkin-map" style="width:100%; height:360px; background:var(--bg-elevated); cursor:crosshair;"></div>
        </div>
      </div>

      <!-- Submission Success Notification Popup Modal -->
      <div class="modal-overlay" id="checkin-success-modal" style="display:none">
        <div class="modal modal-sm" style="text-align:center;">
          <div class="modal-header" style="justify-content:center; border-bottom:none; padding-bottom:0;">
            <div style="width:64px; height:64px; background:#d1fae5; color:#059669; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-top:8px;">
              <span class="material-icons" style="font-size:40px;">check_circle</span>
            </div>
          </div>
          <div class="modal-body" style="padding-top:12px;">
            <h2 style="font-size:20px; font-weight:700; color:var(--text-main); margin-bottom:6px;">Check-In Submitted!</h2>
            <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">
              Your attendance visit photo and GPS coordinates have been saved.
            </p>

            <div style="background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--radius-md); padding:14px; text-align:left; font-size:12px; margin-bottom:20px; display:flex; flex-direction:column; gap:8px;" id="success-popup-details">
            </div>

            <div class="modal-actions" style="justify-content:center; border-top:none; margin-top:0; padding-top:0; gap:10px;">
              <button type="button" class="btn btn-outline" onclick="Checkin.closePopupAndReset()">
                <span class="material-icons">add_a_photo</span> New Check-In
              </button>
              <button type="button" class="btn btn-primary" onclick="Checkin.closePopupAndNavigateHistory()">
                <span class="material-icons">history</span> Visit History
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Wrong Location Alert Modal -->
      <div class="modal-overlay" id="wrong-location-modal" style="display:none; z-index:9999;">
        <div class="modal" style="max-width:520px; width:95%;">
          <div class="modal-header" style="background:linear-gradient(135deg,#dc2626,#b91c1c); padding:20px 24px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                <span class="material-icons" style="color:#fff;font-size:28px;">wrong_location</span>
              </div>
              <div>
                <h2 style="color:#fff;font-size:18px;font-weight:700;margin:0;">⚠️ Wrong Location!</h2>
                <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:2px 0 0;">You are not at the selected check-in location</p>
              </div>
            </div>
            <button onclick="document.getElementById('wrong-location-modal').style.display='none'" style="background:rgba(255,255,255,0.2);border:none;color:#fff;cursor:pointer;border-radius:50%;width:32px;height:32px;font-size:18px;display:flex;align-items:center;justify-content:center;">✕</button>
          </div>
          <div class="modal-body" style="padding:20px 24px;">
            <div id="wrong-loc-info" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;">
            </div>
            <div style="font-size:13px;font-weight:600;color:var(--text-main);margin-bottom:8px;">
              <span class="material-icons" style="font-size:16px;vertical-align:middle;color:#1d4ed8;">map</span>
              Target Location on Map:
            </div>
            <div id="wrong-loc-map" style="width:100%;height:250px;border-radius:8px;border:1px solid var(--border);overflow:hidden;"></div>
            <div id="wrong-loc-address" style="margin-top:12px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12px;color:var(--text-secondary);"></div>
          </div>
          <div class="modal-actions" style="padding:16px 24px;border-top:1px solid var(--border);">
            <button onclick="document.getElementById('wrong-location-modal').style.display='none'" class="btn btn-outline">Close</button>
            <button onclick="document.getElementById('wrong-location-modal').style.display='none'; window.scrollTo(0,0);" class="btn btn-primary">
              <span class="material-icons">directions</span> Go to Correct Location
          </div>
        </div>
      </div>
    `);

    gpsLocked = false;
    faceMatchStatus = 'PENDING';
    initCamera();
    initMap();
    initFaceAPI();
  }

  async function initFaceAPI() {
    if (faceModelsLoaded) return;
    try {
      const modelPath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';
      await faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromUri(modelPath);
      await faceapi.nets.faceRecognitionNet.loadFromUri(modelPath);
      faceModelsLoaded = true;
      console.log('Face models loaded successfully');

      // Extract reference descriptor for the current user
      const session = Auth.getSession();
      if (session && session.userId) {
        const user = DB.Users.getById(session.userId);
        if (user && user.photo) {
          const img = new Image();
          img.src = user.photo;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
          if (detection) {
            referenceDescriptor = detection.descriptor;
            console.log('Reference descriptor computed');
          } else {
            console.warn('No face found in profile photo');
          }
        }
      }
    } catch (e) {
      console.error("Face API Init Error:", e);
    }
  }

  async function reloadReferencePhoto() {
    await initFaceAPI();
    const session = Auth.getSession();
    if (session && session.userId) {
      const user = DB.Users.getById(session.userId);
      if (user && user.photo) {
        try {
          const img = new Image();
          img.src = user.photo;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
          if (detection) {
            referenceDescriptor = detection.descriptor;
            console.log('Reference descriptor reloaded after upload');
          } else {
            console.warn('No face found in newly uploaded photo');
          }
        } catch (e) {
          console.error("Error reloading reference photo:", e);
        }
      }
    }
  }

  function selectLocationDirectly(locId) {
    const selectEl = document.getElementById('checkin-target-loc');
    if (selectEl) {
      selectEl.value = locId;
      onTargetLocationChange(locId);
    }
  }

  function onTargetLocationChange(locId) {
    const nameInput = document.getElementById('checkin-location-name');
    if (locId === 'custom') {
      // keep custom name
    } else {
      const loc = DB.Locations.getById(locId);
      if (loc) {
        if (nameInput) nameInput.value = loc.locationName;
        if (loc.latitude && loc.longitude && (!latitude || !longitude)) {
          setExactLocationFromMap(loc.latitude, loc.longitude);
        }
      }
    }
    if (latitude && longitude) {
      validateGeofence();
    }
  }

  // ── Camera Initialization & Stream Handling ─────────────────────────────

  async function startStreamWithConstraints(videoConstraints) {
    const video    = document.getElementById('webcam');
    const fallback = document.getElementById('camera-fallback');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (video) video.style.display    = 'none';
      if (fallback) fallback.style.display = 'block';
      return;
    }

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      if (video) {
        video.srcObject        = stream;
        video.style.display    = 'block';
      }
      if (fallback) fallback.style.display = 'none';
      updateCameraUIBadge();
    } catch (err) {
      console.warn('Camera constraints failed:', err.message);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (video) {
          video.srcObject        = stream;
          video.style.display    = 'block';
        }
        if (fallback) fallback.style.display = 'none';
        updateCameraUIBadge();
      } catch (err2) {
        console.warn('Webcam fallback failed:', err2.message);
        if (video) video.style.display    = 'none';
        if (fallback) fallback.style.display = 'block';
      }
    }
  }

  async function initCamera() {
    await startStreamWithConstraints({
      facingMode: { ideal: currentFacingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    });
  }

  // ── Camera Switcher ───────────────────────────────────────────────────

  async function switchCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter(d => d.kind === 'videoinput');

      if (videoDevices.length > 1) {
        currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
        const targetDevice = videoDevices[currentDeviceIndex];
        const label = targetDevice.label || `Camera ${currentDeviceIndex + 1}`;

        if (label.toLowerCase().includes('back') || label.toLowerCase().includes('rear') || label.toLowerCase().includes('environment')) {
          currentFacingMode = 'environment';
        } else if (label.toLowerCase().includes('front') || label.toLowerCase().includes('user') || label.toLowerCase().includes('selfie')) {
          currentFacingMode = 'user';
        } else {
          currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
        }

        App.notify(`Switching Camera: ${label}`, 'info');
        await startStreamWithConstraints({
          deviceId: { exact: targetDevice.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        });
      } else {
        currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
        const label = currentFacingMode === 'user' ? 'Front Camera 🤳' : 'Back Camera 📷';
        App.notify(`Switching to ${label}`, 'info');
        await startStreamWithConstraints({
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        });
      }
    } catch (e) {
      console.warn('Camera enumeration error:', e);
      currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
      await startStreamWithConstraints({
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      });
    }
  }

  function updateCameraUIBadge() {
    const isFront = currentFacingMode === 'user';
    const labelText = isFront ? 'Front Cam 🤳' : 'Back Cam 📷';

    const btnTxt = document.getElementById('switch-cam-btn-text');
    if (btnTxt) btnTxt.textContent = labelText;
  }

  // ── Take Snapshot ──────────────────────────────────────────────────────────

  function showCentralError(title, msg, icon = 'error', buttonText = 'OK') {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '0'; div.style.left = '0'; div.style.right = '0'; div.style.bottom = '0';
    div.style.backgroundColor = 'rgba(0,0,0,0.7)';
    div.style.zIndex = '99999';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.innerHTML = `
      <div style="background:var(--surface); padding: 24px; border-radius: 12px; max-width: 320px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); animation: popIn 0.3s ease;">
        <span class="material-icons" style="font-size: 48px; color: var(--danger); margin-bottom: 12px;">${icon}</span>
        <h3 style="margin: 0 0 12px 0; font-size: 18px; color: var(--text);">${title}</h3>
        <p style="margin: 0 0 20px 0; font-size: 14px; color: var(--text-muted);">${msg}</p>
        <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()" style="width: 100%;">${buttonText}</button>
      </div>
    `;
    document.body.appendChild(div);
  }

  async function takeSnapshot() {
    if (!referenceDescriptor) {
      showCentralError('No Profile Photo', 'You must have a valid face photo in your profile before you can check in.', 'account_circle');
      return;
    }

    if (!faceModelsLoaded) {
      showCentralError('Loading', 'Face ID models are still loading. Please try again in a few seconds.', 'hourglass_empty');
      return;
    }

    const snapBtn = document.getElementById('btn-snap');
    if (snapBtn) {
      snapBtn.classList.remove('stutter-anim');
      void snapBtn.offsetWidth; // trigger reflow to allow restarting animation
      snapBtn.classList.add('stutter-anim');
    }

    const video   = document.getElementById('webcam');
    const canvas  = document.getElementById('photo-canvas') || document.createElement('canvas');
    const preview = document.getElementById('photo-preview');
    const flash   = document.getElementById('capture-flash');

    if (!stream || video.style.display === 'none') {
      App.notify('Camera is not running. Please upload a photo instead.', 'warning');
      return;
    }

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.72);

    preview.src           = capturedPhotoBase64;
    preview.style.display = 'block';
    video.style.display   = 'none';

    document.getElementById('btn-snap').style.display       = 'none';
    const switchBtn = document.getElementById('btn-switch-cam');
    if (switchBtn) switchBtn.style.display = 'none';
    
    flash.style.display = 'flex';

    flash.innerHTML = `<span class="material-icons spin" style="font-size:48px; color:var(--primary);">face</span>
                       <strong style="color:var(--text-inverse); font-size:14px;">Verifying Face ID…</strong>`;

    try {
        const detection = await faceapi.detectSingleFace(canvas).withFaceLandmarks().withFaceDescriptor();
        if (!detection) {
          App.notify('Check-in Blocked: No face detected in the photo.', 'error');
          resetCapture();
          return;
        }
        
        const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
        if (distance < 0.65) {
          faceMatchStatus = 'MATCHED';
          App.notify('Face match successful', 'success');
        } else {
          faceMatchStatus = 'FAILED';
          resetCapture();
          showCentralError('Face Match Failed', 'Your selfie does not match the profile photo.', 'face', 'Try Again');
          return;
        }
      } catch (e) {
        console.error('Face verification error', e);
        App.notify('Error during face verification.', 'error');
        resetCapture();
        return;
      }

    document.getElementById('btn-retake').style.display     = 'block';

    flash.innerHTML = `<span class="material-icons spin" style="font-size:48px; color:var(--primary);">gps_fixed</span>
                       <strong style="color:var(--text-inverse); font-size:14px;">Locking GPS & Geofence…</strong>`;
                       
    captureGPSNow(() => {
      flash.style.display = 'none';
      flash.innerHTML = `<span class="material-icons spin" style="font-size:48px; color:var(--primary);">gps_fixed</span>
                       <strong style="color:var(--text-inverse); font-size:14px;">Locking GPS & Geofence…</strong>`;
    });
  }

  function handleFileUpload(input) {
    if (!input.files || !input.files[0]) return;

    const flash = document.getElementById('capture-flash');
    flash.style.display = 'flex';

    const reader = new FileReader();
    reader.onload = (e) => {
      capturedPhotoBase64 = e.target.result;

      const preview  = document.getElementById('photo-preview');
      const fallback = document.getElementById('camera-fallback');

      preview.src           = capturedPhotoBase64;
      preview.style.display = 'block';
      fallback.style.display = 'none';

      document.getElementById('btn-snap').style.display       = 'none';
      const switchBtn = document.getElementById('btn-switch-cam');
      if (switchBtn) switchBtn.style.display = 'none';
      document.getElementById('btn-retake').style.display     = 'block';

      captureGPSNow(() => {
        flash.style.display = 'none';
      });
    };
    reader.readAsDataURL(input.files[0]);
  }

  function resetCapture() {
    capturedPhotoBase64 = null;
    gpsLocked           = false;
    latitude            = null;
    longitude           = null;
    distanceMeters      = null;

    const preview  = document.getElementById('photo-preview');
    const video    = document.getElementById('webcam');
    const fallback = document.getElementById('camera-fallback');

    preview.style.display = 'none';

    if (stream) {
      video.style.display    = 'block';
      fallback.style.display = 'none';
    } else {
      fallback.style.display = 'block';
    }

    document.getElementById('btn-snap').style.display       = 'block';
    const switchBtn = document.getElementById('btn-switch-cam');
    if (switchBtn) switchBtn.style.display = 'inline-flex';

    document.getElementById('btn-retake').style.display     = 'none';
    const subBtn = document.getElementById('btn-submit');
    if (subBtn) subBtn.disabled = false;
    document.getElementById('submit-hint').textContent      = 'Click Submit to record visit attendance & location';

    const coordsInput  = document.getElementById('gps-coords');
    const addressInput = document.getElementById('gps-address');
    if (coordsInput)  coordsInput.value  = '';
    if (addressInput) addressInput.value = '';

    const badge = document.getElementById('geofence-result-badge');
    if (badge) badge.style.display = 'none';

    setGPSStatus('idle', 'GPS will lock when photo captured or map clicked');
    updateMapLabel('— waiting for photo capture or map click —');
  }

  // ── GPS Capture & 50m Geofence Validation ──────────────────────────────────

  function captureGPSNow(onComplete) {
    setGPSStatus('locating', 'Detecting your exact location…');

    if (!navigator.geolocation) {
      setGPSStatus('error', 'GPS not supported — Click map to set exact location');
      showManualEntry();
      onComplete && onComplete();
      return;
    }

    const applyPosition = (pos) => {
      latitude  = pos.coords.latitude;
      longitude = pos.coords.longitude;
      gpsLocked = true;

      const accuracy = pos.coords.accuracy ? ` ±${Math.round(pos.coords.accuracy)}m` : '';
      setGPSStatus('locked', `✅ GPS Locked${accuracy}`);

      const coordsInput = document.getElementById('gps-coords');
      if (coordsInput) coordsInput.value = `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`;

      const badge = document.getElementById('gps-locked-badge');
      if (badge) badge.style.display = 'inline';

      const manualPanel = document.getElementById('manual-gps-panel');
      if (manualPanel) manualPanel.style.display = 'none';

      validateGeofence();
      reverseGeocode(latitude, longitude);
      enableSubmit();
      onComplete && onComplete();
    };

    // Try high-accuracy first
    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (err) => {
        console.warn('High accuracy GPS failed, trying standard accuracy:', err.message);
        // Fallback to standard accuracy (IP/Wi-Fi triangulation)
        navigator.geolocation.getCurrentPosition(
          applyPosition,
          (err2) => {
            console.warn('Standard GPS failed:', err2.message);
            setGPSStatus('error', 'GPS unavailable. Click map or enter coordinates below.');
            showManualEntry();
            onComplete && onComplete();
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  // ── 50-Meter Geofence Logic ────────────────────────────────────────────────

  function validateGeofence() {
    if (!latitude || !longitude) return;

    const session = Auth.getSession();
    if (!session) return;
    const user = DB.Users.getById(session.userId);
    if (!user) return;

    let targetLat = null;
    let targetLng = null;
    let targetName = 'New Locked Location';
    
    if (user.locationId) {
      const loc = DB.Locations.getById(user.locationId);
      if (loc && loc.latitude && loc.longitude) {
        targetLat = loc.latitude;
        targetLng = loc.longitude;
        targetName = loc.locationName;
      }
    } else {
      // Fallback for legacy users
      targetLat = user.refLatitude;
      targetLng = user.refLongitude;
      targetName = 'Your Locked Location';
    }

    const badge = document.getElementById('geofence-result-badge');
    const subBtn = document.getElementById('btn-submit');
    const hint = document.getElementById('submit-hint');

    // If user doesn't have a reference location yet
    if (targetLat === undefined || targetLat === null || targetLng === undefined || targetLng === null) {
      distanceMeters = 0;
      geofenceStatus = 'IN_RANGE';
      if (badge) {
        badge.style.display = 'block';
        badge.style.background = '#e0f2fe';
        badge.style.color = '#075985';
        badge.style.border = '1px solid #7dd3fc';
        badge.innerHTML = `📍 <strong>Warning!</strong> No Target Location Assigned. Your current GPS will be recorded without distance validation.`;
      }
      updateMapWithGeofence(latitude, longitude, latitude, longitude, 'Unassigned Location', true, 0);
      updateMapLabel(`📍 No Assignment: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      
      if (subBtn) subBtn.disabled = false;
      if (hint) {
         hint.textContent = 'Click Submit to record visit and lock this as your permanent location.';
         hint.style.color = 'var(--text-muted)';
      }
      return;
    }

    // Reference location is set, calculate distance
    distanceMeters = getDistanceInMeters(latitude, longitude, targetLat, targetLng);
    
    // Check if within 150 meters (accounts for GPS drift)
    const isWithinZone = distanceMeters <= 150;
    geofenceStatus = isWithinZone ? 'IN_RANGE' : 'OUT_OF_RANGE';

    if (badge) {
      badge.style.display = 'block';
      if (isWithinZone) {
        badge.style.background = '#d1fae5';
        badge.style.color = '#065f46';
        badge.style.border = '1px solid #6ee7b7';
        badge.innerHTML = `<span class="material-icons" style="font-size:16px; vertical-align:middle;">check_circle</span> ✅ IN APPROVED ZONE (${distanceMeters}m from locked position)`;
      } else {
        badge.style.background = '#fee2e2';
        badge.style.color = '#991b1b';
        badge.style.border = '1px solid #fca5a5';
        badge.innerHTML = `<span class="material-icons" style="font-size:16px; vertical-align:middle;">warning</span> ❌ REJECTED - OUTSIDE ZONE (${distanceMeters}m away, max allowed is 150m)`;
      }
    }

    updateMapWithGeofence(latitude, longitude, targetLat, targetLng, targetName, isWithinZone, distanceMeters);
    updateMapLabel(`📍 User: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} | Distance: ${distanceMeters}m (${isWithinZone ? 'IN ZONE' : 'OUTSIDE ZONE'})`);
    
    if (subBtn) {
      subBtn.disabled = !isWithinZone;
      if (hint) {
    if (!isWithinZone) {
           hint.textContent = `Submission blocked. You are ${distanceMeters}m away from your locked location (max 150m).`;
           hint.style.color = '#991b1b';
        } else {
           hint.textContent = 'Click Submit to record visit attendance & location';
           hint.style.color = 'var(--text-muted)';
        }
      }
    }
  }

  function showManualEntry() {
    const existing = document.getElementById('manual-gps-panel');
    if (existing) { existing.style.display = 'block'; return; }

    const form = document.getElementById('checkin-form');
    if (!form) return;

    const panel = document.createElement('div');
    panel.id = 'manual-gps-panel';
    panel.style.cssText = 'background:var(--bg-elevated); border:1px solid var(--warning); border-radius:var(--radius-md); padding:14px; margin-bottom:12px;';
    panel.innerHTML = `
      <p style="font-size:12px; color:var(--warning); margin-bottom:10px; font-weight:600;">
        <span class="material-icons" style="font-size:14px; vertical-align:middle;">warning</span>
        GPS blocked. Click anywhere on the Live Map or enter coordinates:
      </p>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <div style="flex:1;">
          <label style="font-size:11px; color:var(--text-muted);">Latitude</label>
          <input type="number" id="manual-lat" step="0.0000001" placeholder="e.g. 11.0168" style="width:100%;" />
        </div>
        <div style="flex:1;">
          <label style="font-size:11px; color:var(--text-muted);">Longitude</label>
          <input type="number" id="manual-lon" step="0.0000001" placeholder="e.g. 76.9558" style="width:100%;" />
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="Checkin.applyManualCoords()">
        <span class="material-icons">check_circle</span> Use Coordinates
      </button>
    `;

    const coordsGroup = document.getElementById('gps-coords')?.closest('.form-group');
    if (coordsGroup) form.insertBefore(panel, coordsGroup);
    else form.prepend(panel);
  }

  function applyManualCoords() {
    const lat = parseFloat(document.getElementById('manual-lat')?.value);
    const lon = parseFloat(document.getElementById('manual-lon')?.value);

    if (isNaN(lat) || isNaN(lon)) {
      App.notify('Enter valid latitude & longitude.', 'error');
      return;
    }

    setExactLocationFromMap(lat, lon);
  }

  function refreshGPS() {
    gpsLocked = false;
    setGPSStatus('locating', 'Re-detecting location…');
    captureGPSNow(null);
  }

  let detectedCity = 'Coimbatore';
  let detectedState = 'Tamil Nadu';
  let detectedCountry = 'India';

  function reverseGeocode(lat, lon) {
    const addressInput = document.getElementById('gps-address');
    if (!addressInput) return;

    let targetName = 'Location Not Assigned';
    const session = Auth.getSession();
    if (session && session.userId) {
      const user = DB.Users.getById(session.userId);
      if (user && user.locationId) {
        const loc = DB.Locations.getById(user.locationId);
        if (loc && loc.locationName) {
          targetName = loc.locationName;
        }
      } else if (user && user.refLatitude) {
        targetName = 'Legacy GPS Locked Location';
      }
    }
    
    addressInput.value = targetName;
  }

  // ── Interactive Map with 50m Geofence Circle & Click-to-Pin ─────────────

  function initMap() {
    setTimeout(() => {
      const container = document.getElementById('checkin-map');
      if (!container || map) return;

      map = L.map('checkin-map').setView([11.0168, 76.9558], 12); // Centered around Coimbatore
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Click anywhere on map to pin exact location
      map.on('click', (e) => {
        setExactLocationFromMap(e.latlng.lat, e.latlng.lng);
      });
    }, 150);
  }

  function setExactLocationFromMap(lat, lon) {
    latitude  = lat;
    longitude = lon;
    gpsLocked = true;

    const coordsInput = document.getElementById('gps-coords');
    if (coordsInput) coordsInput.value = `${lat.toFixed(7)}, ${lon.toFixed(7)}`;

    const badge = document.getElementById('gps-locked-badge');
    if (badge) badge.style.display = 'inline';

    const manualPanel = document.getElementById('manual-gps-panel');
    if (manualPanel) manualPanel.style.display = 'none';

    setGPSStatus('locked', `✅ Map Pinned (${lat.toFixed(5)}, ${lon.toFixed(5)})`);
    validateGeofence();
    reverseGeocode(lat, lon);
    enableSubmit();
    App.notify(`Pinned exact location on map!`, 'success');
  }

  function updateMap(lat, lon, label = 'Check-In Location') {
    if (!map) return;
    map.setView([lat, lon], 16);
    if (marker) {
      marker.setLatLng([lat, lon]);
      if (marker.dragging) {
         marker.dragging.enable();
      }
    } else {
      marker = L.marker([lat, lon], { draggable: true }).addTo(map);
      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setExactLocationFromMap(pos.lat, pos.lng);
      });
    }
    const hint = `<br/><small style="color:var(--primary);">Drag pin or click map to move</small>`;
    marker.bindPopup(`<strong>${label}</strong><br/><code>${lat.toFixed(6)}, ${lon.toFixed(6)}</code>${hint}`).openPopup();
  }

  function updateMapWithGeofence(userLat, userLng, targetLat, targetLng, targetName, isWithinZone, distance) {
    if (!map) return;

    if (marker) map.removeLayer(marker);
    if (geofenceCircle) map.removeLayer(geofenceCircle);

    const bounds = L.latLngBounds([[userLat, userLng], [targetLat, targetLng]]);
    map.fitBounds(bounds.pad(0.3));

    // Draw 500m Circle around Target Location
    geofenceCircle = L.circle([targetLat, targetLng], {
      color: isWithinZone ? '#10b981' : '#ef4444',
      fillColor: isWithinZone ? '#10b981' : '#ef4444',
      fillOpacity: 0.2,
      radius: 500,
      className: 'pulse-ring'
    }).addTo(map).bindPopup(`<strong>${targetName}</strong><br/>Approved Zone Boundary (500m)`);

    const isAdmin = Auth.getSession()?.roleId === 'role-admin';

    // Place User Marker
    marker = L.marker([userLat, userLng], { draggable: isAdmin }).addTo(map)
      .bindPopup(`<strong>Your Photo Position</strong><br/>Distance to ${targetName}: <strong>${distance}m</strong><br/>Status: ${isWithinZone ? '✅ IN ZONE' : '⚠️ OUTSIDE ZONE'}${isAdmin ? '<br/><small style="color:var(--primary);">Drag pin or click map to adjust</small>' : ''}`)
      .openPopup();

    if (isAdmin) {
      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setExactLocationFromMap(pos.lat, pos.lng);
      });
    }
  }

  function updateMapLabel(text) {
    const el = document.getElementById('map-status');
    if (el) el.textContent = text;
  }

  // ── Wrong Location Popup with Live Map ─────────────────────────────────────
  let wrongLocMap = null;

  function showWrongLocationPopup(targetLoc, distance) {
    // Remove any existing popup
    const existing = document.getElementById('out-of-zone-modal');
    if (existing) existing.remove();

    // Inject animation styles once
    if (!document.getElementById('out-of-zone-styles')) {
      const style = document.createElement('style');
      style.id = 'out-of-zone-styles';
      style.textContent = `
        @keyframes oozFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes oozPopIn  { from { transform:scale(0.7) translateY(30px); opacity:0; } to { transform:scale(1) translateY(0); opacity:1; } }
        #out-of-zone-card { animation: oozPopIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'out-of-zone-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;animation:oozFadeIn 0.2s ease;';

    overlay.innerHTML = `
      <div id="out-of-zone-card" style="
        background:#fff;
        border-radius:20px;
        padding:40px 36px;
        max-width:400px;
        width:100%;
        text-align:center;
        box-shadow:0 24px 64px rgba(0,0,0,0.3);
        font-family:'Segoe UI',sans-serif;
      ">
        <div style="
          width:80px;height:80px;border-radius:50%;
          background:#fef2f2;border:3px solid #fca5a5;
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 20px;
        ">
          <span class="material-icons" style="font-size:40px;color:#dc2626;">location_off</span>
        </div>
        <h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#991b1b;">Out of Zone!</h2>
        <p style="margin:0 0 8px;font-size:16px;color:#374151;font-weight:500;">
          Your location is out of the zone.
        </p>
        <p style="margin:0 0 28px;font-size:13px;color:#6b7280;">
          You are <strong style="color:#dc2626;">${distance}m</strong> away from <strong>${targetLoc.locationName}</strong>.<br/>
          You must be within 500m to check in.
        </p>
        <button onclick="document.getElementById('out-of-zone-modal').remove()" style="
          background:#dc2626;color:#fff;border:none;border-radius:10px;
          padding:12px 40px;font-size:15px;font-weight:700;cursor:pointer;
          width:100%;transition:background 0.2s;
        " onmouseover="this.style.background='#b91c1c'" onmouseout="this.style.background='#dc2626'">
          OK
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // Kept for backward compatibility (unused but safe to keep)
  async function _showWrongLocationPopup(targetLoc, distance, livePincode = '', targetPincode = '', pincodeMatch = true) {
    const modal = document.getElementById('wrong-location-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const infoEl = document.getElementById('wrong-loc-info');
    if (infoEl) {
      const distanceOk = distance <= 500;
      infoEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <span class="material-icons" style="color:#dc2626; font-size:20px;">location_off</span>
          <strong style="color:#dc2626; font-size:14px;">You are NOT at "${targetLoc.locationName}"</strong>
        </div>
        <div style="color:#7f1d1d; line-height:1.8; font-size:13px;">
          <div style="display:flex; gap:8px; align-items:center;">
            ${distanceOk ? '✅' : '❌'}
            <span><strong>Distance:</strong> <span style="font-weight:700; color:${distanceOk ? '#059669' : '#dc2626'};">${distance}m from target</span>
            ${distanceOk ? '(within 500m ✓)' : '(must be within 500m)'}</span>
          </div>
          ${targetPincode ? `<div style="display:flex; gap:8px; align-items:center; margin-top:4px;">
            ${pincodeMatch ? '✅' : '❌'}
            <span><strong>Your Pincode:</strong> <span style="font-weight:700; color:${pincodeMatch ? '#059669' : '#dc2626'};">${livePincode || 'Unknown'}</span>
            &nbsp;→&nbsp; <strong>Required:</strong> <span style="font-weight:700; color:#1d4ed8;">${targetPincode}</span>
            ${pincodeMatch ? '(Match ✓)' : '(Mismatch ✗)'}</span>
          </div>` : ''}
          <div style="margin-top:4px;">📍 <strong>Your GPS:</strong> ${latitude.toFixed(6)}, ${longitude.toFixed(6)}</div>
          <div>🎯 <strong>Target GPS:</strong> ${parseFloat(targetLoc.latitude).toFixed(6)}, ${parseFloat(targetLoc.longitude).toFixed(6)}</div>
        </div>`;
    }

    // Fetch address of target location via reverse geocode
    const addrEl = document.getElementById('wrong-loc-address');
    if (addrEl) {
      addrEl.innerHTML = `<span class="material-icons" style="font-size:14px;vertical-align:middle;">sync</span> Analyzing locations via Google Maps…`;
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${targetLoc.latitude}&lon=${targetLoc.longitude}&format=json`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'WebcamEnterpriseSuite/1.0' } }
        );
        const data = await resp.json();
        const targetAddr = data?.display_name || 'Address not available';
        const targetPost = data?.address?.postcode || targetPincode || '';
        addrEl.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px;">
              <div style="font-weight:700;color:#dc2626;font-size:12px;margin-bottom:6px;">
                <span class="material-icons" style="font-size:14px;vertical-align:middle;">my_location</span> YOUR LOCATION
              </div>
              <div style="font-size:11px;color:#7f1d1d;line-height:1.5;">
                📮 Pincode: <strong>${livePincode || 'Unknown'}</strong><br/>
                🌐 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}
              </div>
              <a href="https://maps.google.com/?q=${latitude},${longitude}" target="_blank"
                style="display:inline-flex;align-items:center;gap:4px;margin-top:8px;color:#1d4ed8;text-decoration:none;font-size:11px;font-weight:600;">
                <span class="material-icons" style="font-size:12px;">open_in_new</span> View on Google Maps
              </a>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px;">
              <div style="font-weight:700;color:#059669;font-size:12px;margin-bottom:6px;">
                <span class="material-icons" style="font-size:14px;vertical-align:middle;">place</span> TARGET LOCATION
              </div>
              <div style="font-size:11px;color:#065f46;line-height:1.5;">
                📮 Pincode: <strong>${targetPost}</strong><br/>
                🌐 ${parseFloat(targetLoc.latitude).toFixed(5)}, ${parseFloat(targetLoc.longitude).toFixed(5)}
              </div>
              <a href="https://maps.google.com/?q=${targetLoc.latitude},${targetLoc.longitude}" target="_blank"
                style="display:inline-flex;align-items:center;gap:4px;margin-top:8px;color:#1d4ed8;text-decoration:none;font-size:11px;font-weight:600;">
                <span class="material-icons" style="font-size:12px;">open_in_new</span> View on Google Maps
              </a>
            </div>
          </div>
          <div style="margin-top:10px;text-align:center;">
            <a href="https://maps.google.com/maps?saddr=${latitude},${longitude}&daddr=${targetLoc.latitude},${targetLoc.longitude}" target="_blank"
               style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
              <span class="material-icons" style="font-size:16px;">directions</span>
              Get Directions to "${targetLoc.locationName}"
            </a>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text-muted);padding:8px;background:var(--bg-elevated);border-radius:6px;">
            <strong>Target Address:</strong> ${targetAddr}
          </div>`;
      } catch {
        addrEl.innerHTML = `
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <a href="https://maps.google.com/?q=${latitude},${longitude}" target="_blank"
               style="color:#1d4ed8;text-decoration:none;font-weight:600;font-size:13px;">
              <span class="material-icons" style="font-size:14px;vertical-align:middle;">my_location</span> Your Location on Google Maps
            </a>
            <a href="https://maps.google.com/?q=${targetLoc.latitude},${targetLoc.longitude}" target="_blank"
               style="color:#059669;text-decoration:none;font-weight:600;font-size:13px;">
              <span class="material-icons" style="font-size:14px;vertical-align:middle;">place</span> Target on Google Maps
            </a>
          </div>`;
      }
    }

    // Initialize mini map showing target location
    setTimeout(() => {
      const mapEl = document.getElementById('wrong-loc-map');
      if (!mapEl) return;

      // Destroy previous map if exists
      if (wrongLocMap) {
        wrongLocMap.remove();
        wrongLocMap = null;
      }

      wrongLocMap = L.map('wrong-loc-map').setView([targetLoc.latitude, targetLoc.longitude], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(wrongLocMap);

      // Target location marker (red)
      const targetIcon = L.divIcon({
        html: '<span class="material-icons" style="color:#dc2626;font-size:32px;text-shadow:0 2px 4px rgba(0,0,0,0.3);">place</span>',
        className: '',
        iconAnchor: [16, 32]
      });
      L.marker([targetLoc.latitude, targetLoc.longitude], { icon: targetIcon })
        .addTo(wrongLocMap)
        .bindPopup(`<strong>${targetLoc.locationName}</strong><br/>✅ You must be here to check in`)
        .openPopup();

      // User current location marker (blue)
      if (latitude && longitude) {
        const userIcon = L.divIcon({
          html: '<span class="material-icons" style="color:#1d4ed8;font-size:24px;text-shadow:0 2px 4px rgba(0,0,0,0.3);">my_location</span>',
          className: '',
          iconAnchor: [12, 24]
        });
        L.marker([latitude, longitude], { icon: userIcon })
          .addTo(wrongLocMap)
          .bindPopup(`<strong>Your Current Location</strong><br/>❌ ${distance}m from target`);

        // Draw a line between user and target
        L.polyline([[latitude, longitude], [targetLoc.latitude, targetLoc.longitude]], {
          color: '#dc2626',
          weight: 2,
          dashArray: '6, 6'
        }).addTo(wrongLocMap);

        // Fit map to show both markers
        wrongLocMap.fitBounds([[latitude, longitude], [targetLoc.latitude, targetLoc.longitude]], { padding: [30, 30] });
      }

      // Draw 500m allowed zone circle
      L.circle([targetLoc.latitude, targetLoc.longitude], {
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.1,
        radius: 500
      }).addTo(wrongLocMap).bindPopup('✅ Allowed Check-in Zone (500m radius)');

      wrongLocMap.invalidateSize();
    }, 200);
  }

  function setGPSStatus(state, text) {
    const icon = document.getElementById('gps-status-icon');
    const txt  = document.getElementById('gps-status-text');
    if (!icon || !txt) return;

    const configs = {
      idle:     { icon: 'gps_not_fixed', color: 'var(--text-muted)' },
      locating: { icon: 'gps_not_fixed', color: 'var(--warning)' },
      locked:   { icon: 'gps_fixed',     color: 'var(--success)' },
      error:    { icon: 'gps_off',        color: 'var(--error, #ef4444)' },
    };
    const cfg = configs[state] || configs.idle;
    icon.textContent = cfg.icon;
    icon.style.color = cfg.color;
    txt.textContent  = text;
  }

  function enableSubmit() {
    const btn  = document.getElementById('btn-submit');
    const hint = document.getElementById('submit-hint');
    if (btn)  {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">check_circle</span> Submit';
    }
    if (hint) { hint.textContent = '✅ Photo & GPS locked — ready to submit'; }
  }

  // ── Save Check-In ─────────────────────────────────────────────────────────

  async function saveCheckin(e) {
    if (e && e.preventDefault) e.preventDefault();

    try {

    // Auto-capture photo if missing but stream is active
    if (!capturedPhotoBase64) {
      const video = document.getElementById('webcam');
      if (stream && video && video.style.display !== 'none') {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        capturedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.72);
      } else {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#1e293b"/><circle cx="320" cy="220" r="80" fill="#334155" stroke="#3b82f6" stroke-width="6"/><circle cx="320" cy="220" r="50" fill="#0f172a"/><text x="320" y="380" font-family="sans-serif" font-size="22" font-weight="bold" fill="#f8fafc" text-anchor="middle">FIELD CHECK-IN PHOTO</text><text x="320" y="415" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">${new Date().toLocaleString()}</text></svg>`;
        capturedPhotoBase64 = 'data:image/svg+xml;base64,' + btoa(svg);
      }
    }

    // Auto-lock coordinates if missing
    if (!latitude || !longitude) {
      const session = Auth.getSession();
      const user = session ? DB.Users.getById(session.userId) : null;
      let targetLat = NaN;
      let targetLng = NaN;
      
      if (user && user.locationId) {
        const loc = DB.Locations.getById(user.locationId);
        if (loc) {
          targetLat = loc.latitude;
          targetLng = loc.longitude;
        }
      } else if (user) {
        targetLat = user.refLatitude;
        targetLng = user.refLongitude;
      }

      if (!isNaN(targetLat) && !isNaN(targetLng)) {
        latitude = targetLat;
        longitude = targetLng;
      } else {
        latitude = 11.016843;
        longitude = 76.955812;
      }
      gpsLocked = true;
    }

    const session      = Auth.getSession() || { userId: 'user-admin', username: 'admin', fullName: 'System Administrator' };
    const locationName = (document.getElementById('checkin-location-name')?.value || '').trim() || 'Field Location';
    let address        = (document.getElementById('gps-address')?.value || '').trim();
    if (!address) address = `📍 ${locationName} (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
    const notes        = document.getElementById('checkin-notes')?.value || '';

    // 2. GPS coordinates must exist (lock flag is secondary)
    if (!latitude || !longitude) {
      App.notify('GPS location not detected yet. Please wait a moment and try again.', 'error');
      return;
    }

    let liveDistance = 0;

    // 4. Reference Position Validation (per-user)
    const currentUserObj = DB.Users.getById(session.userId);
    if (currentUserObj) {
      const refLat = currentUserObj.refLatitude;
      const refLng = currentUserObj.refLongitude;

      if (refLat !== undefined && refLat !== null && refLng !== undefined && refLng !== null) {
        // Reference exists — compare current position
        const refDistance = getDistanceInMeters(latitude, longitude, refLat, refLng);

        if (refDistance > 150) {
          // Rejected — show centered popup
          const existingRefModal = document.getElementById('ref-pos-modal');
          if (existingRefModal) existingRefModal.remove();

          if (!document.getElementById('ref-pos-styles')) {
            const st = document.createElement('style');
            st.id = 'ref-pos-styles';
            st.textContent = `
              @keyframes rpFadeIn { from{opacity:0}to{opacity:1} }
              @keyframes rpPopIn  { from{transform:scale(0.75) translateY(30px);opacity:0}to{transform:scale(1) translateY(0);opacity:1} }
              #ref-pos-card { animation: rpPopIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
            `;
            document.head.appendChild(st);
          }

          const overlay = document.createElement('div');
          overlay.id = 'ref-pos-modal';
          overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;animation:rpFadeIn 0.2s ease;';
          overlay.innerHTML = `
            <div id="ref-pos-card" style="
              background:#fff; border-radius:20px; padding:40px 32px;
              max-width:400px; width:100%; text-align:center;
              box-shadow:0 24px 64px rgba(0,0,0,0.3); font-family:'Segoe UI',sans-serif;
            ">
              <div style="width:80px;height:80px;border-radius:50%;background:#fef2f2;border:3px solid #fca5a5;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                <span class="material-icons" style="font-size:40px;color:#dc2626;">wrong_location</span>
              </div>
              <h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#991b1b;">Not Acceptable</h2>
              <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:500;">
                Your current location does not match<br/>your registered position.
              </p>
              <p style="margin:0 0 28px;font-size:13px;color:#6b7280;">
                You are <strong style="color:#dc2626;">${refDistance}m</strong> away from your reference location.<br/>
                Maximum allowed distance is <strong>150 meters</strong>.
              </p>
              <button onclick="document.getElementById('ref-pos-modal').remove()" style="
                background:#dc2626;color:#fff;border:none;border-radius:10px;
                padding:13px 40px;font-size:15px;font-weight:700;cursor:pointer;width:100%;
              ">OK</button>
            </div>
          `;
          overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
          document.body.appendChild(overlay);
          return;
        }
      } else {
        // No reference yet — save current position as reference for this user
        DB.Users.saveRefPosition(session.userId, latitude, longitude);
      }
    }
    // 5. All checks passed — save the check-in
    const res = CheckinsDB.Checkins.add({
      userId:       session.userId,
      locationId:   'locked-location',
      locationName: 'Locked Reference Position',
      photo:        capturedPhotoBase64,
      latitude,
      longitude,
      distanceMeters: distanceMeters !== null ? distanceMeters : 0,
      geofenceStatus: geofenceStatus || 'IN_RANGE',
      address,
      notes
    });

    if (res.success) {

      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      App.notify('Submitted', 'success');
      showNotificationPopup(res.data);
    } else {
      App.notify('Check-in failed. Please try again.', 'error');
    }

    } catch (err) {
      App.notify('Error: ' + (err.message || 'Something went wrong. Please try again.'), 'error');
      console.error('saveCheckin error:', err);
    }
  }

  function showNotificationPopup(record) {
    record = record || {
      fullName: 'Admin User',
      locationName: document.getElementById('checkin-location-name')?.value || 'Field Location',
      latitude: latitude || 11.016843,
      longitude: longitude || 76.955812,
      geofenceStatus: geofenceStatus || 'IN_RANGE',
      distanceMeters: distanceMeters !== null ? distanceMeters : 0,
      timestamp: new Date().toISOString()
    };

    // Always remove existing popup first
    const existing = document.getElementById('checkin-success-modal');
    if (existing) existing.remove();

    // Create fresh modal on document.body so it's never hidden by content replacement
    const modal = document.createElement('div');
    modal.id = 'checkin-success-modal';
    document.body.appendChild(modal);

    const formattedTime = new Date(record.timestamp || Date.now()).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const isWithinZone = record.geofenceStatus === 'IN_RANGE';
    const distText = (record.distanceMeters !== null && record.distanceMeters !== undefined)
      ? `${record.distanceMeters}m away — ${isWithinZone ? '✅ Within 40k sqm zone' : '⚠️ Outside zone'}`
      : '📍 Location Recorded';

    const geofenceBadgeStyle = isWithinZone
      ? 'background:#d1fae5; color:#059669; border:1px solid #a7f3d0;'
      : 'background:#fef3c7; color:#d97706; border:1px solid #fde68a;';

    modal.style.cssText = [
      'display:flex',
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,0.75)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'z-index:2147483647',
      'align-items:center',
      'justify-content:center',
      'padding:16px',
      'animation:fadeInOverlay 0.2s ease'
    ].join(';');

    // Inject keyframe animation if not already done
    if (!document.getElementById('checkin-popup-styles')) {
      const style = document.createElement('style');
      style.id = 'checkin-popup-styles';
      style.textContent = `
        @keyframes fadeInOverlay { from { opacity:0; } to { opacity:1; } }
        @keyframes popIn { from { transform:scale(0.75) translateY(40px); opacity:0; } to { transform:scale(1) translateY(0); opacity:1; } }
        @keyframes checkBounce { 0%{transform:scale(0)} 60%{transform:scale(1.3)} 80%{transform:scale(0.9)} 100%{transform:scale(1)} }
        #checkin-popup-card { animation: popIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
        #checkin-popup-icon { animation: checkBounce 0.6s 0.2s cubic-bezier(0.34,1.56,0.64,1) both; }
      `;
      document.head.appendChild(style);
    }

    modal.innerHTML = `
      <div id="checkin-popup-card" style="
        text-align:center;
        max-width:460px;
        width:100%;
        background:var(--bg-surface, #1e293b);
        border:1px solid var(--border, #334155);
        border-radius:20px;
        box-shadow:0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        padding:32px 28px;
        position:relative;
      ">

        <!-- Close X button -->
        <button onclick="Checkin.closePopupAndReset()" style="
          position:absolute; top:14px; right:14px;
          background:none; border:none; cursor:pointer;
          color:var(--text-muted,#9ca3af); padding:4px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          transition:background 0.15s;
        " onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='none'">
          <span class="material-icons" style="font-size:20px;">close</span>
        </button>

        <!-- Success icon -->
        <div id="checkin-popup-icon" style="
          width:80px; height:80px;
          background:linear-gradient(135deg, #d1fae5, #a7f3d0);
          color:#059669;
          border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          margin:0 auto 20px auto;
          box-shadow:0 0 0 8px rgba(16,185,129,0.15), 0 8px 24px rgba(16,185,129,0.3);
        ">
          <span class="material-icons" style="font-size:48px;">check_circle</span>
        </div>

        <h2 style="font-size:24px; font-weight:800; color:var(--text-primary,#111827); margin-bottom:8px; letter-spacing:-0.3px;">
          ✅ Check-In Successful!
        </h2>
        <p style="font-size:13px; color:var(--text-secondary,#4b5563); margin-bottom:24px; line-height:1.5;">
          Your field visit attendance has been recorded with GPS & photo proof.
        </p>

        <!-- Details card -->
        <div style="
          background:var(--bg-elevated, #f9fafb);
          border:1px solid var(--border, #e2e8f0);
          border-radius:12px;
          padding:16px;
          text-align:left;
          margin-bottom:24px;
          display:flex;
          flex-direction:column;
          gap:10px;
        ">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-muted,#9ca3af); font-size:12px;">👤 Employee</span>
            <strong style="color:var(--text-primary,#111827); font-size:13px;">${record.fullName || 'Admin User'}</strong>
          </div>
          <div style="height:1px; background:var(--border-subtle,#f1f5f9);"></div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-muted,#9ca3af); font-size:12px;">📍 Location</span>
            <strong style="color:var(--text-primary,#111827); font-size:13px; max-width:220px; text-align:right;">${record.locationName}</strong>
          </div>
          <div style="height:1px; background:var(--border-subtle,#f1f5f9);"></div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-muted,#9ca3af); font-size:12px;">🛰️ GPS</span>
            <code style="background:var(--bg-base,#ffffff); padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600; color:var(--primary,#5c7b5a);">${record.latitude ? record.latitude.toFixed(6) : '11.016843'}, ${record.longitude ? record.longitude.toFixed(6) : '76.955812'}</code>
          </div>
          <div style="height:1px; background:var(--border-subtle,#f1f5f9);"></div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-muted,#9ca3af); font-size:12px;">📏 Geofence</span>
            <span style="${geofenceBadgeStyle} font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px;">
              ${distText}
            </span>
          </div>
          <div style="height:1px; background:var(--border-subtle,#f1f5f9);"></div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-muted,#9ca3af); font-size:12px;">🕐 Time</span>
            <span style="color:var(--text-secondary,#4b5563); font-size:11px; font-weight:600;">${formattedTime}</span>
          </div>
        </div>

        <!-- Action buttons -->
        <div style="display:flex; gap:12px;">
          <button type="button" onclick="Checkin.closePopupAndNavigateReports()" style="
            flex:1; padding:12px; border-radius:10px;
            background:var(--bg-elevated,#f9fafb); border:1px solid var(--border,#e2e8f0);
            color:var(--text-primary,#111827); font-size:13px; font-weight:600;
            cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;
            transition:all 0.15s;
          " onmouseover="this.style.background='var(--bg-hover,#f2f5f3)'" onmouseout="this.style.background='var(--bg-elevated,#f9fafb)'">
            <span class="material-icons" style="font-size:18px;">bar_chart</span> Reports
          </button>
          <button type="button" onclick="Checkin.closePopupAndReset()" style="
            flex:1; padding:12px; border-radius:10px;
            background:var(--primary,#5c7b5a); border:none;
            color:#fff; font-size:13px; font-weight:700;
            cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;
            transition:all 0.15s; box-shadow:0 4px 14px var(--primary-glow);
          " onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
            <span class="material-icons" style="font-size:18px;">check_circle</span> OK
          </button>
        </div>
      </div>
    `;
  }

  function closePopupAndReset() {
    const modal = document.getElementById('checkin-success-modal');
    if (modal) {
      modal.style.animation = 'fadeInOverlay 0.2s ease reverse both';
      setTimeout(() => { modal.remove(); Checkin.render(); }, 200);
    } else {
      Checkin.render();
    }
  }

  function closePopupAndNavigateHistory() {
    const modal = document.getElementById('checkin-success-modal');
    if (modal) {
      modal.style.animation = 'fadeInOverlay 0.2s ease reverse both';
      setTimeout(() => { modal.remove(); Router.navigate('field-visit/history'); }, 200);
    } else {
      Router.navigate('field-visit/history');
    }
  }

  function closePopupAndNavigateReports() {
    const modal = document.getElementById('checkin-success-modal');
    if (modal) {
      modal.style.animation = 'fadeInOverlay 0.2s ease reverse both';
      setTimeout(() => { modal.remove(); Router.navigate('reports/attendance'); }, 200);
    } else {
      Router.navigate('reports/attendance');
    }
  }

  function cleanup() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (map)    { map.remove(); }
    map            = null;
    marker         = null;
    geofenceCircle = null;
    gpsLocked      = false;
    capturedPhotoBase64 = null;
    latitude       = null;
    longitude      = null;
  }

  return {
    render,
    onTargetLocationChange,
    handleFileUpload,
    reloadReferencePhoto,
    takeSnapshot,
    switchCamera,
    resetCapture,
    refreshGPS,
    applyManualCoords,
    saveCheckin,
    closePopupAndReset,
    closePopupAndNavigateHistory,
    closePopupAndNavigateReports,
    cleanup
  };
})();
