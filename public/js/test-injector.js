/**
 * GAME TEST INJECTOR — Development & Testing Controller
 * Floating Draggable Controller with Realtime SSE Synchronization
 */

(function () {
  'use strict';

  // Constants & Config
  const API_BASE = '';
  const DEV_SECRET = 'dev-test-token-2026';
  const STORAGE_KEY_POS = 'inj_pos_v2';
  const STORAGE_KEY_VIEW = 'inj_view_mode_v2';
  const STORAGE_KEY_THEME = 'inj_theme_color';
  const STORAGE_KEY_SCALE = 'inj_scale_v2';

  // State
  let viewMode = localStorage.getItem(STORAGE_KEY_VIEW) || 'expanded'; // 'logo' | 'compact' | 'expanded'
  let currentMode = '1min';
  let currentPeriodId = '202610040001';
  let remainingSeconds = 60;
  let targetNumber = 7;
  let targetSize = 'BIG';
  let targetColor = 'RED';
  let activeOverride = null;
  let sseSource = null;
  let connectionState = 'connecting'; // 'connected' | 'connecting' | 'offline'
  let lastSyncTimestamp = '--:--:--';
  let settingsOpen = false;

  // Number Color Rules
  function getDefaultColorForNumber(num) {
    if (num === 0) return 'VIOLET'; // Dual Red/Violet
    if (num === 5) return 'VIOLET'; // Dual Green/Violet
    if ([1, 3, 7, 9].includes(num)) return 'GREEN';
    return 'RED';
  }

  function getDefaultSizeForNumber(num) {
    return num >= 5 ? 'BIG' : 'SMALL';
  }

  // Injector Crown SVG
  const CROWN_SVG = `
    <svg class="inj-logo-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/>
    </svg>
  `;

  // Inject HTML Elements
  const host = document.createElement('div');
  host.className = 'inj-root';
  host.id = 'gameTestInjectorRoot';
  document.body.appendChild(host);

  // Apply saved scale
  const savedScale = localStorage.getItem(STORAGE_KEY_SCALE) || 'm';
  host.classList.add(`scale-${savedScale}`);

  // Render Template
  function renderUI() {
    host.innerHTML = `
      <!-- 1. Minimized Floating Circular Logo -->
      <div class="inj-float-logo" id="injFloatLogo" style="display: ${viewMode === 'logo' ? 'flex' : 'none'};" title="Tap to expand Game Test Injector">
        <div class="inj-pulse-ring"></div>
        ${CROWN_SVG}
        <div class="inj-status-dot-mini ${connectionState === 'offline' ? 'offline' : (activeOverride ? 'injected' : '')}" id="injMiniDot"></div>
      </div>

      <!-- 2. Compact View (Pill Capsule Bar) -->
      <div class="inj-compact-bar" id="injCompactBar" style="display: ${viewMode === 'compact' ? 'flex' : 'none'};">
        <div class="inj-compact-crown-wrap" id="injCompactExpandBtn" title="Open Full Panel">
          <svg class="inj-compact-crown" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/>
          </svg>
        </div>

        <div class="inj-compact-size-badge ${targetSize.toLowerCase()}" id="injCompactSizeBadge">
          <span>${targetSize === 'BIG' ? '↑' : '↓'}</span>
          <span>${targetSize}</span>
        </div>

        <div class="inj-compact-num-badge" id="injCompactNumBadge">${targetNumber}</div>

        <div class="inj-compact-meta">
          <div class="inj-compact-id-row">
            <span>ID: <span id="injCompactPeriodId">${currentPeriodId.slice(-4)}</span></span>
            <span class="inj-compact-live-dot" id="injCompactDot"></span>
          </div>
          <div class="inj-compact-time-row">
            <span id="injCompactTime">--:--:--</span>
            <span>(${remainingSeconds}s)</span>
          </div>
        </div>

        <div class="inj-compact-actions">
          <button class="inj-compact-btn" id="injCompactExpandIcon" title="Full View">⛶</button>
          <button class="inj-compact-btn" id="injCompactCloseBtn" title="Minimize to Icon">✕</button>
        </div>
      </div>

      <!-- 3. Expanded Full Info Panel -->
      <div class="inj-expanded-panel" id="injExpandedPanel" style="display: ${viewMode === 'expanded' ? 'flex' : 'none'};">
        
        <!-- Header -->
        <div class="inj-panel-header" id="injDragHandle">
          <div class="inj-title-group">
            <svg class="inj-title-crown" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/>
            </svg>
            <span class="inj-title-text">Game Test Injector</span>
            <span class="inj-testbed-badge" title="Development Controller Only">DEV TEST</span>
          </div>
          <div class="inj-header-controls">
            <button class="inj-head-btn" id="injBtnCompactMode" title="Switch to Compact Pill Bar">⊟</button>
            <button class="inj-head-btn" id="injBtnMinimize" title="Minimize to Circular Logo">✕</button>
          </div>
        </div>

        <!-- Size Selection (BIG / SMALL) -->
        <div class="inj-size-grid">
          <button class="inj-size-btn size-big ${targetSize === 'BIG' ? 'active' : ''}" id="injBtnBig">
            <span>↑</span> BIG
          </button>
          <button class="inj-size-btn size-small ${targetSize === 'SMALL' ? 'active' : ''}" id="injBtnSmall">
            <span>↓</span> SMALL
          </button>
        </div>

        <!-- Main Info Card -->
        <div class="inj-info-card">
          <div class="inj-top-meta-row">
            <div class="inj-next-num-box">
              <span class="inj-label-mini">Next Number</span>
              <span class="inj-big-target-num" id="injBigNumDisplay">${targetNumber}</span>
            </div>
            <div class="inj-period-info-box">
              <span class="inj-label-mini">Period ID</span>
              <span class="inj-period-val" id="injPeriodVal">${formatPeriodDisplay(currentPeriodId)}</span>
              <div class="inj-countdown-pill ${remainingSeconds <= 5 ? 'urgent' : ''}" id="injCountdownPill">
                Draw in ${remainingSeconds}s
              </div>
            </div>
          </div>

          <div class="inj-datetime-row">
            <div class="inj-dt-item">
              <span>📅</span>
              <span id="injDateDisplay">-- --- ----</span>
            </div>
            <div class="inj-dt-item">
              <span>⏱️</span>
              <strong id="injTimeDisplay">--:--:--</strong>
            </div>
          </div>
        </div>

        <!-- Numbers 0-9 Selector -->
        <div>
          <div class="inj-section-title">
            <span>Target Number (0–9)</span>
            <span style="font-size: 0.65rem; color: var(--inj-violet);" id="injTargetSummary">${targetSize} • ${targetColor}</span>
          </div>
          <div class="inj-num-grid" id="injNumGrid">
            ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `
              <button class="inj-ball-btn ${getNumClass(n)} ${n === targetNumber ? 'selected' : ''}" data-num="${n}">
                ${n}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Color Selector -->
        <div>
          <div class="inj-section-title">
            <span>Target Color</span>
          </div>
          <div class="inj-color-row">
            <button class="inj-col-btn green ${targetColor === 'GREEN' ? 'active' : ''}" data-color="GREEN">
              ● GREEN
            </button>
            <button class="inj-col-btn violet ${targetColor === 'VIOLET' ? 'active' : ''}" data-color="VIOLET">
              ● VIOLET
            </button>
            <button class="inj-col-btn red ${targetColor === 'RED' ? 'active' : ''}" data-color="RED">
              ● RED
            </button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="inj-action-grid">
          <button class="inj-btn-set" id="injBtnSetResult">
            <span>⚡</span> SET RESULT
          </button>
          <button class="inj-btn-reset" id="injBtnReset">
            <span>🔄</span> RESET
          </button>
        </div>

        <!-- Settings Sub-drawer (Toggleable) -->
        <div class="inj-settings-drawer" id="injSettingsDrawer" style="display: ${settingsOpen ? 'flex' : 'none'};">
          <div class="inj-settings-row">
            <span class="inj-settings-label">UI Scale:</span>
            <div class="inj-size-toggles">
              <span class="inj-size-opt ${savedScale === 's' ? 'selected' : ''}" data-scale="s">S</span>
              <span class="inj-size-opt ${savedScale === 'm' ? 'selected' : ''}" data-scale="m">M</span>
              <span class="inj-size-opt ${savedScale === 'l' ? 'selected' : ''}" data-scale="l">L</span>
            </div>
          </div>
          <div class="inj-settings-row">
            <span class="inj-settings-label">Status:</span>
            <span style="color: #A7F3D0;" id="injAuthStatus">Dev Authenticated (SSE)</span>
          </div>
        </div>

        <!-- Footer / Live Sync Status -->
        <div class="inj-panel-footer">
          <div class="inj-live-beacon">
            <span class="inj-live-dot ${connectionState === 'offline' ? 'offline' : ''}"></span>
            <span>Live • Auto Update</span>
          </div>
          <div style="font-size: 0.65rem; color: #94A3B8;">
            <span id="injSyncStatus">${connectionState === 'connected' ? 'Synced' : 'Connecting...'}</span>
          </div>
          <button class="inj-gear-btn" id="injBtnGear" title="Settings">⚙️</button>
        </div>

      </div>
    `;

    attachEventListeners();
    updateDateTime();
  }

  function formatPeriodDisplay(pid) {
    if (!pid) return '----';
    if (pid.length >= 8) {
      return `${pid.slice(0, 8)}-${pid.slice(8)}`;
    }
    return pid;
  }

  function getNumClass(n) {
    if (n === 0) return 'split-0';
    if (n === 5) return 'split-5';
    if ([1, 3, 7, 9].includes(n)) return 'green';
    return 'red';
  }

  // Attach All Event Listeners
  function attachEventListeners() {
    // Mode transitions
    const floatLogo = document.getElementById('injFloatLogo');
    const compactBar = document.getElementById('injCompactBar');
    const compactExpandBtn = document.getElementById('injCompactExpandBtn');
    const compactExpandIcon = document.getElementById('injCompactExpandIcon');
    const compactCloseBtn = document.getElementById('injCompactCloseBtn');
    const btnCompactMode = document.getElementById('injBtnCompactMode');
    const btnMinimize = document.getElementById('injBtnMinimize');

    if (floatLogo) {
      floatLogo.onclick = () => setViewMode('expanded');
    }
    if (compactExpandBtn) {
      compactExpandBtn.onclick = () => setViewMode('expanded');
    }
    if (compactExpandIcon) {
      compactExpandIcon.onclick = () => setViewMode('expanded');
    }
    if (compactCloseBtn) {
      compactCloseBtn.onclick = () => setViewMode('logo');
    }
    if (btnCompactMode) {
      btnCompactMode.onclick = () => setViewMode('compact');
    }
    if (btnMinimize) {
      btnMinimize.onclick = () => setViewMode('logo');
    }

    // Size Selection
    const btnBig = document.getElementById('injBtnBig');
    const btnSmall = document.getElementById('injBtnSmall');
    if (btnBig && btnSmall) {
      btnBig.onclick = () => {
        targetSize = 'BIG';
        updateSelectionVisuals();
      };
      btnSmall.onclick = () => {
        targetSize = 'SMALL';
        updateSelectionVisuals();
      };
    }

    // Numbers 0-9 Selection
    const numGrid = document.getElementById('injNumGrid');
    if (numGrid) {
      numGrid.querySelectorAll('.inj-ball-btn').forEach(btn => {
        btn.onclick = () => {
          const val = parseInt(btn.getAttribute('data-num'), 10);
          targetNumber = val;
          targetSize = getDefaultSizeForNumber(val);
          targetColor = getDefaultColorForNumber(val);
          updateSelectionVisuals();
        };
      });
    }

    // Color buttons
    document.querySelectorAll('.inj-col-btn').forEach(btn => {
      btn.onclick = () => {
        targetColor = btn.getAttribute('data-color');
        updateSelectionVisuals();
      };
    });

    // Set Result Button
    const btnSet = document.getElementById('injBtnSetResult');
    if (btnSet) {
      btnSet.onclick = handleSetResult;
    }

    // Reset Button
    const btnReset = document.getElementById('injBtnReset');
    if (btnReset) {
      btnReset.onclick = handleResetResult;
    }

    // Gear / Settings
    const gearBtn = document.getElementById('injBtnGear');
    if (gearBtn) {
      gearBtn.onclick = () => {
        settingsOpen = !settingsOpen;
        const drawer = document.getElementById('injSettingsDrawer');
        if (drawer) drawer.style.display = settingsOpen ? 'flex' : 'none';
      };
    }

    // Scale buttons in settings
    document.querySelectorAll('.inj-size-opt').forEach(opt => {
      opt.onclick = () => {
        const sc = opt.getAttribute('data-scale');
        host.className = `inj-root scale-${sc}`;
        localStorage.setItem(STORAGE_KEY_SCALE, sc);
        document.querySelectorAll('.inj-size-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      };
    });

    // Setup dragging
    setupDraggable();
  }

  function setViewMode(mode) {
    viewMode = mode;
    localStorage.setItem(STORAGE_KEY_VIEW, mode);
    renderUI();
    clampPositionToViewport();
  }

  function updateSelectionVisuals() {
    // Update Big/Small button states
    const btnBig = document.getElementById('injBtnBig');
    const btnSmall = document.getElementById('injBtnSmall');
    if (btnBig && btnSmall) {
      btnBig.className = `inj-size-btn size-big ${targetSize === 'BIG' ? 'active' : ''}`;
      btnSmall.className = `inj-size-btn size-small ${targetSize === 'SMALL' ? 'active' : ''}`;
    }

    // Update Number Buttons
    const numGrid = document.getElementById('injNumGrid');
    if (numGrid) {
      numGrid.querySelectorAll('.inj-ball-btn').forEach(b => {
        const n = parseInt(b.getAttribute('data-num'), 10);
        b.className = `inj-ball-btn ${getNumClass(n)} ${n === targetNumber ? 'selected' : ''}`;
      });
    }

    // Update Color Buttons
    document.querySelectorAll('.inj-col-btn').forEach(b => {
      const c = b.getAttribute('data-color');
      b.className = `inj-col-btn ${c.toLowerCase()} ${c === targetColor ? 'active' : ''}`;
    });

    // Display Text
    const bigNum = document.getElementById('injBigNumDisplay');
    if (bigNum) bigNum.textContent = targetNumber;

    const summary = document.getElementById('injTargetSummary');
    if (summary) summary.textContent = `${targetSize} • ${targetColor}`;

    // Compact Bar
    const cmpBadge = document.getElementById('injCompactSizeBadge');
    if (cmpBadge) {
      cmpBadge.className = `inj-compact-size-badge ${targetSize.toLowerCase()}`;
      cmpBadge.innerHTML = `<span>${targetSize === 'BIG' ? '↑' : '↓'}</span><span>${targetSize}</span>`;
    }
    const cmpNum = document.getElementById('injCompactNumBadge');
    if (cmpNum) cmpNum.textContent = targetNumber;
  }

  // ----------------------------------------------------------
  // DRAG & DROP ENGINE (TOUCH & MOUSE SUPPORT)
  // ----------------------------------------------------------
  function setupDraggable() {
    const handleLogo = document.getElementById('injFloatLogo');
    const handleCompact = document.getElementById('injCompactBar');
    const handlePanel = document.getElementById('injDragHandle');

    [handleLogo, handleCompact, handlePanel].forEach(handle => {
      if (!handle) return;

      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;
      let hasMoved = false;

      function onStart(clientX, clientY) {
        isDragging = true;
        hasMoved = false;
        startX = clientX;
        startY = clientY;

        const rect = host.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
      }

      function onMove(clientX, clientY) {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;

        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          hasMoved = true;
        }

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const maxLeft = window.innerWidth - host.offsetWidth - 10;
        const maxTop = window.innerHeight - host.offsetHeight - 10;

        newLeft = Math.max(10, Math.min(maxLeft, newLeft));
        newTop = Math.max(10, Math.min(maxTop, newTop));

        host.style.left = `${newLeft}px`;
        host.style.top = `${newTop}px`;
        host.style.right = 'auto';
        host.style.bottom = 'auto';
      }

      function onEnd() {
        if (!isDragging) return;
        isDragging = false;
        if (hasMoved) {
          const rect = host.getBoundingClientRect();
          localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ x: rect.left, y: rect.top }));
        }
      }

      // Mouse Listeners
      handle.addEventListener('mousedown', e => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        onStart(e.clientX, e.clientY);

        function mouseMoveHandler(ev) {
          onMove(ev.clientX, ev.clientY);
        }
        function mouseUpHandler() {
          window.removeEventListener('mousemove', mouseMoveHandler);
          window.removeEventListener('mouseup', mouseUpHandler);
          onEnd();
        }
        window.addEventListener('mousemove', mouseMoveHandler);
        window.addEventListener('mouseup', mouseUpHandler);
      });

      // Touch Listeners
      handle.addEventListener('touchstart', e => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
      }, { passive: true });

      handle.addEventListener('touchmove', e => {
        if (!isDragging) return;
        const t = e.touches[0];
        onMove(t.clientX, t.clientY);
      }, { passive: true });

      handle.addEventListener('touchend', onEnd);
    });
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_POS));
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        host.style.left = `${saved.x}px`;
        host.style.top = `${saved.y}px`;
        host.style.right = 'auto';
        host.style.bottom = 'auto';
        clampPositionToViewport();
        return;
      }
    } catch (e) {}

    // Default position: top right corner with good margin
    host.style.right = '20px';
    host.style.top = '75px';
    host.style.left = 'auto';
    host.style.bottom = 'auto';
  }

  function clampPositionToViewport() {
    requestAnimationFrame(() => {
      const rect = host.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width - 10;
      const maxTop = window.innerHeight - rect.height - 10;

      if (rect.left > maxLeft && maxLeft > 10) {
        host.style.left = `${maxLeft}px`;
      }
      if (rect.top > maxTop && maxTop > 10) {
        host.style.top = `${maxTop}px`;
      }
      if (rect.left < 10) host.style.left = '10px';
      if (rect.top < 10) host.style.top = '10px';
    });
  }

  // ----------------------------------------------------------
  // REALTIME SYNCHRONIZATION ENGINE (SSE + AUTHENTICATED API)
  // ----------------------------------------------------------
  function connectSSE() {
    if (sseSource) {
      try { sseSource.close(); } catch (e) {}
    }

    connectionState = 'connecting';
    updateSyncIndicator();

    try {
      sseSource = new EventSource(`${API_BASE}/api/test/stream`);

      sseSource.addEventListener('INIT', e => {
        try {
          const data = JSON.parse(e.data);
          connectionState = 'connected';
          if (data.modes && data.modes[currentMode]) {
            const m = data.modes[currentMode];
            currentPeriodId = m.periodId;
            remainingSeconds = m.remainingSeconds;
            activeOverride = m.override;
            if (activeOverride) {
              targetNumber = activeOverride.number;
              targetSize = activeOverride.size;
              targetColor = activeOverride.color;
            }
          }
          lastSyncTimestamp = new Date().toLocaleTimeString('en-GB');
          updatePeriodicDisplays();
          updateSelectionVisuals();
          updateSyncIndicator();
        } catch (err) {
          console.error('[TEST INJECTOR] Failed parsing INIT event:', err);
        }
      });

      sseSource.addEventListener('TEST_RESULT_INJECTED', e => {
        try {
          const data = JSON.parse(e.data);
          if (data.mode === currentMode) {
            activeOverride = data;
            targetNumber = data.number;
            targetSize = data.size;
            targetColor = data.color;
            lastSyncTimestamp = new Date().toLocaleTimeString('en-GB');
            updateSelectionVisuals();
            updatePeriodicDisplays();
            updateSyncIndicator();
            flashButtonSuccess();
          }
        } catch (err) {
          console.error('[TEST INJECTOR] SSE INJECT error:', err);
        }
      });

      sseSource.addEventListener('TEST_RESULT_RESET', e => {
        try {
          const data = JSON.parse(e.data);
          if (data.mode === currentMode) {
            activeOverride = null;
            lastSyncTimestamp = new Date().toLocaleTimeString('en-GB');
            updatePeriodicDisplays();
            updateSyncIndicator();
          }
        } catch (err) {}
      });

      sseSource.addEventListener('ROUND_SETTLED', e => {
        try {
          const data = JSON.parse(e.data);
          if (data.mode === currentMode) {
            currentPeriodId = data.nextPeriodId;
            activeOverride = null;
            lastSyncTimestamp = new Date().toLocaleTimeString('en-GB');
            updatePeriodicDisplays();
            updateSyncIndicator();
          }
        } catch (err) {}
      });

      sseSource.addEventListener('HEARTBEAT', () => {
        connectionState = 'connected';
        lastSyncTimestamp = new Date().toLocaleTimeString('en-GB');
        updateSyncIndicator();
      });

      sseSource.onerror = () => {
        connectionState = 'offline';
        updateSyncIndicator();
        // EventSource automatically retries reconnection
      };

    } catch (err) {
      connectionState = 'offline';
      updateSyncIndicator();
      setTimeout(connectSSE, 5000);
    }
  }

  async function handleSetResult() {
    const btn = document.getElementById('injBtnSetResult');
    if (btn) {
      btn.innerHTML = `<span>⏳</span> INJECTING...`;
      btn.disabled = true;
    }

    try {
      const payload = {
        mode: currentMode,
        periodId: currentPeriodId,
        number: targetNumber,
        size: targetSize,
        color: targetColor,
        secretKey: DEV_SECRET
      };

      const res = await fetch(`${API_BASE}/api/test/inject-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-token': DEV_SECRET
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        activeOverride = data.target;
        lastSyncTimestamp = new Date().toLocaleTimeString('en-GB');
        flashButtonSuccess();
      } else {
        alert(`❌ Injection Error: ${data.message}`);
        if (btn) btn.innerHTML = `<span>⚡</span> SET RESULT`;
      }
    } catch (err) {
      alert(`⚠️ Connection Error: Failed communicating with backend test API.`);
      if (btn) btn.innerHTML = `<span>⚡</span> SET RESULT`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleResetResult() {
    try {
      const res = await fetch(`${API_BASE}/api/test/reset-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-token': DEV_SECRET
        },
        body: JSON.stringify({ mode: currentMode, secretKey: DEV_SECRET })
      });
      const data = await res.json();
      if (data.success) {
        activeOverride = null;
        lastSyncTimestamp = new Date().toLocaleTimeString('en-GB');
        updatePeriodicDisplays();
        updateSyncIndicator();
      }
    } catch (e) {
      console.error('Reset error:', e);
    }
  }

  function flashButtonSuccess() {
    const btn = document.getElementById('injBtnSetResult');
    if (!btn) return;
    btn.classList.add('success');
    btn.innerHTML = `<span>✓</span> INJECTED & SYNCED!`;
    setTimeout(() => {
      btn.classList.remove('success');
      btn.innerHTML = `<span>⚡</span> SET RESULT`;
    }, 2200);
  }

  function updateSyncIndicator() {
    const miniDot = document.getElementById('injMiniDot');
    if (miniDot) {
      miniDot.className = `inj-status-dot-mini ${connectionState === 'offline' ? 'offline' : (activeOverride ? 'injected' : '')}`;
    }

    const liveDot = document.querySelector('.inj-live-dot');
    if (liveDot) {
      liveDot.className = `inj-live-dot ${connectionState === 'offline' ? 'offline' : ''}`;
    }

    const syncStatus = document.getElementById('injSyncStatus');
    if (syncStatus) {
      if (connectionState === 'connected') {
        syncStatus.textContent = activeOverride ? `Target Armed (${lastSyncTimestamp})` : `Live Synced (${lastSyncTimestamp})`;
      } else if (connectionState === 'connecting') {
        syncStatus.textContent = 'Connecting...';
      } else {
        syncStatus.textContent = 'Offline (Reconnecting)';
      }
    }

    const cmpDot = document.getElementById('injCompactDot');
    if (cmpDot) {
      cmpDot.style.background = connectionState === 'connected' ? 'var(--inj-green)' : 'var(--inj-red)';
    }
  }

  function updatePeriodicDisplays() {
    const pVal = document.getElementById('injPeriodVal');
    if (pVal) pVal.textContent = formatPeriodDisplay(currentPeriodId);

    const cmpPid = document.getElementById('injCompactPeriodId');
    if (cmpPid) cmpPid.textContent = currentPeriodId.slice(-4);

    const pill = document.getElementById('injCountdownPill');
    if (pill) {
      pill.textContent = `Draw in ${remainingSeconds}s`;
      if (remainingSeconds <= 5) pill.classList.add('urgent');
      else pill.classList.remove('urgent');
    }
  }

  // Real-time Date and Clock Ticker
  function updateDateTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });

    const dDisp = document.getElementById('injDateDisplay');
    if (dDisp) dDisp.textContent = dateStr;

    const tDisp = document.getElementById('injTimeDisplay');
    if (tDisp) tDisp.textContent = timeStr;

    const cTime = document.getElementById('injCompactTime');
    if (cTime) cTime.textContent = timeStr;
  }

  // Periodic Local Clock Tick (1s)
  setInterval(() => {
    updateDateTime();
    if (remainingSeconds > 0) {
      remainingSeconds--;
      updatePeriodicDisplays();
    }
  }, 1000);

  // Poll period state every 6 seconds as a reliable fallback
  setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/game/state?mode=${currentMode}&userId=demo-user`);
      const data = await res.json();
      if (data.success) {
        currentPeriodId = data.periodId;
        remainingSeconds = data.remainingSeconds;
        if (data.testOverride) {
          activeOverride = data.testOverride;
        }
        updatePeriodicDisplays();
      }
    } catch (e) {}
  }, 6000);

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------
  renderUI();
  restorePosition();
  connectSSE();

  // Listen to game mode switches from host page if present
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.getAttribute('data-mode');
      if (m) {
        currentMode = m;
        connectSSE();
      }
    });
  });

  window.addEventListener('resize', clampPositionToViewport);

})();
