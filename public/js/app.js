// KrishanaPredi Client Application Engine
(function() {
  'use strict';

  // Cached User Initialization from LocalStorage
  let cachedUser = null;
  try {
    const rawUser = localStorage.getItem('kp_user');
    if (rawUser) cachedUser = JSON.parse(rawUser);
  } catch (e) {}

  // State Management
  const state = {
    user: cachedUser,
    token: localStorage.getItem('kp_token') || null,
    selectedPlan: null,
    pendingRequestId: localStorage.getItem('kp_pending_req') || null,
    approvedKey: localStorage.getItem('kp_approved_key') || null,
    activatedPlan: JSON.parse(localStorage.getItem('kp_activated_plan') || 'null'),
    gameLinkData: JSON.parse(localStorage.getItem('kp_game_link') || 'null'),
    currentQrMode: 'dynamic', // 'dynamic' or 'official'
    qrData: null,
    pollingInterval: null
  };

  // Helper: Escape HTML strings
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Handle Clean User Logout
  function handleLogout() {
    localStorage.removeItem('kp_token');
    localStorage.removeItem('kp_user');
    localStorage.removeItem('kp_activated_plan');
    localStorage.removeItem('kp_game_link');
    state.user = null;
    state.token = null;
    state.activatedPlan = null;
    state.gameLinkData = null;
    updateUserTag();
    updateNavVisibility();
    showToast('Logged out successfully', 'success');
    switchView('auth');
  }

  // DOM Elements
  const views = {
    auth: document.getElementById('authView'),
    plans: document.getElementById('plansView'),
    payment: document.getElementById('paymentView'),
    status: document.getElementById('statusView'),
    pasteKey: document.getElementById('pasteKeyView'),
    gameLink: document.getElementById('gameLinkView'),
    dashboard: document.getElementById('dashboardView'),
    wallet: document.getElementById('walletView')
  };

  const navBtns = {
    plans: document.getElementById('navPlansBtn'),
    key: document.getElementById('navKeyBtn'),
    game: document.getElementById('navGameBtn'),
    dash: document.getElementById('navDashBtn'),
    wallet: document.getElementById('navWalletBtn')
  };

  // Toast Notification Function (Single active toast, no stacking)
  let toastTimeout = null;
  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Immediately clear any existing toasts to prevent multiple popups stacking
    container.innerHTML = '';
    if (toastTimeout) clearTimeout(toastTimeout);

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span style="color: ${type === 'error' ? 'var(--red-accent)' : 'var(--neon-green)'}; font-size: 1.1rem;">
        ${type === 'error' ? '✕' : '✓'}
      </span>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    toastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }

  // Switch View (Enforces Login / Sign Up as mandatory 1st Page!)
  function switchView(viewName) {
    const isLoggedIn = !!(state.user && !state.user.isGuest);

    // If not logged in, user CANNOT access any protected views; must login/signup first!
    if (!isLoggedIn && viewName !== 'auth') {
      viewName = 'auth';
    }

    Object.keys(views).forEach(k => {
      if (views[k]) views[k].classList.remove('active');
    });

    if (views[viewName]) {
      views[viewName].classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update bottom nav highlights
    Object.keys(navBtns).forEach(k => {
      if (navBtns[k]) navBtns[k].classList.remove('active');
    });

    if (viewName === 'plans' || viewName === 'payment') navBtns.plans?.classList.add('active');
    if (viewName === 'pasteKey' || viewName === 'status') navBtns.key?.classList.add('active');
    if (viewName === 'gameLink') navBtns.game?.classList.add('active');
    if (viewName === 'dashboard') navBtns.dash?.classList.add('active');
    if (viewName === 'wallet') navBtns.wallet?.classList.add('active');

    // Bottom nav bar is ONLY shown when user is logged in and not on auth view
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) {
      bottomNav.style.display = (isLoggedIn && viewName !== 'auth') ? 'flex' : 'none';
    }
  }

  // Update User Status Tag in Header (Displays Logged-in Username + ✕ Logout Option)
  function updateUserTag() {
    const userPill = document.getElementById('userPill');
    if (!userPill) return;

    if (state.user && !state.user.isGuest && state.user.username) {
      userPill.className = 'user-status-pill logged-in';
      userPill.removeAttribute('role');
      userPill.title = `Logged in as ${state.user.username} (Click ✕ to logout)`;
      userPill.onclick = null;
      userPill.innerHTML = `
        <span class="user-avatar-dot"></span>
        <span class="pill-username" title="${escapeHtml(state.user.username)}">${escapeHtml(state.user.username)}</span>
        <button type="button" class="pill-close-btn" id="inlineLogoutBtn" title="Logout" aria-label="Logout">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      const inlineLogoutBtn = document.getElementById('inlineLogoutBtn');
      if (inlineLogoutBtn) {
        inlineLogoutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleLogout();
        });
      }
    } else {
      userPill.className = 'user-status-pill is-guest';
      userPill.setAttribute('role', 'button');
      userPill.title = 'Click to Login or Sign Up';
      userPill.innerHTML = `
        <span class="user-avatar-dot is-guest-dot"></span>
        <span class="pill-username">Login / Sign Up</span>
      `;
      userPill.onclick = () => {
        switchView('auth');
      };
    }
  }

  // Check / Verify Active Session from Server
  async function checkAuth() {
    if (!state.token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      const data = await res.json();
      if (data.success && data.user) {
        state.user = {
          id: data.user.id,
          username: data.user.username,
          isGuest: !!data.user.isGuest
        };
        localStorage.setItem('kp_user', JSON.stringify(state.user));
        updateUserTag();
      } else if (res.status === 401) {
        localStorage.removeItem('kp_token');
        localStorage.removeItem('kp_user');
        state.user = null;
        state.token = null;
        updateUserTag();
      }
    } catch (e) {
      console.warn('Session verification fallback', e);
    }
  }

  // Update Navigation Bar, Game Link, and Dashboard Visibility
  function updateNavVisibility() {
    const bottomNav = document.getElementById('bottomNav');
    const navGameBtn = document.getElementById('navGameBtn');
    const navDashBtn = document.getElementById('navDashBtn');
    const isLoggedIn = !!(state.user && !state.user.isGuest);

    // Hide entire bottom navigation when on Auth page or when not logged in
    if (bottomNav) {
      const isAuthActive = views.auth && views.auth.classList.contains('active');
      bottomNav.style.display = (isLoggedIn && !isAuthActive) ? 'flex' : 'none';
    }

    // Game Link is STRICTLY HIDDEN until valid key is activated
    if (state.activatedPlan) {
      if (navGameBtn) navGameBtn.style.display = 'flex';
      const badge = document.getElementById('activeKeyPlanBadge');
      if (badge) badge.textContent = `${state.activatedPlan.planName} (${state.activatedPlan.durationDays} Days)`;
    } else {
      if (navGameBtn) navGameBtn.style.display = 'none';
    }

    // Dashboard is STRICTLY HIDDEN until both key is activated AND game link submitted
    if (state.activatedPlan && state.gameLinkData) {
      if (navDashBtn) navDashBtn.style.display = 'flex';
      populateDashboard();
    } else {
      if (navDashBtn) navDashBtn.style.display = 'none';
    }
  }

  // Initialize or Restore Guest Session (Never overwrites logged-in user!)
  async function initGuestSession() {
    if (state.user && !state.user.isGuest) return state.user;
    if (state.user && state.user.isGuest) return state.user;
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        state.user = data.user;
        state.token = data.token;
        localStorage.setItem('kp_token', data.token);
        localStorage.setItem('kp_user', JSON.stringify(data.user));
        updateUserTag();
        return state.user;
      }
    } catch (e) {
      console.error('Guest init error', e);
    }
  }

  // Load Plans
  async function loadPlans() {
    try {
      const res = await fetch('/api/plans');
      const data = await res.json();
      if (!data.success) return;

      const container = document.getElementById('plansGrid');
      if (!container) return;
      container.innerHTML = '';

      data.plans.forEach((plan, index) => {
        const card = document.createElement('div');
        card.className = `plan-card ${index === 3 ? 'featured' : ''}`;
        card.innerHTML = `
          ${plan.badge ? `<span class="plan-badge">${plan.badge}</span>` : ''}
          <div class="plan-header">
            <h3 class="plan-title">${plan.name}</h3>
            <div class="plan-price-row">
              <span class="plan-price">₹${plan.price.toLocaleString('en-IN')}</span>
              <span class="plan-duration">/ ${plan.durationDays} Days</span>
            </div>
          </div>

          <div class="plan-meta-stats">
            <div class="stat-item">
              <span class="stat-label">Daily Signals</span>
              <span class="stat-val">${plan.dailyPredictions} Predictions/Day</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Validity</span>
              <span class="stat-val">${plan.durationDays} Active Days</span>
            </div>
          </div>

          <div class="plan-perf-notice">
            <strong>Platform Accuracy:</strong> ${plan.performance}
          </div>

          <ul class="plan-benefits">
            ${plan.benefits.map(b => `<li>${b}</li>`).join('')}
          </ul>

          <button type="button" class="btn-primary buy-plan-btn" data-plan-id="${plan.id}" data-plan-price="${plan.price}">
            <span>BUY NOW — ₹${plan.price}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        `;
        container.appendChild(card);
      });

      // Attach Buy Event Listeners
      document.querySelectorAll('.buy-plan-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const planId = btn.getAttribute('data-plan-id');
          const plan = data.plans.find(p => p.id === planId);
          if (plan) selectPlanAndOpenPayment(plan);
        });
      });
    } catch (err) {
      console.error('Error fetching plans:', err);
    }
  }

  // Select Plan & Open Payment Flow
  async function selectPlanAndOpenPayment(plan) {
    state.selectedPlan = plan;
    if (!state.user) {
      await initGuestSession();
    }

    // Populate Payment View
    document.getElementById('checkoutPlanName').textContent = plan.name;
    document.getElementById('checkoutAmountDisplay').textContent = `₹${plan.price.toLocaleString('en-IN')}`;
    const userDisplay = (state.user && !state.user.isGuest) ? `USER: ${state.user.username.toUpperCase()}` : 'GUEST CHECKOUT';
    document.getElementById('checkoutUserTag').textContent = userDisplay;

    // Fetch Dynamic QR Code from Server
    await loadPaymentQr(plan.price);

    switchView('payment');
  }

  // Load Payment QR and configure App Deep Links
  async function loadPaymentQr(amount) {
    try {
      const res = await fetch(`/api/payment/qr?amount=${amount}`);
      const data = await res.json();
      if (data.success) {
        state.qrData = data;
        
        // Single Pure Dynamic QR
        const qrImg = document.getElementById('qrDisplayImg');
        if (qrImg) qrImg.src = data.qrDataUrl;

        // Configure Deep Links for Mobile Apps
        setupUpiAppLinks(data.amount);
      }
    } catch (err) {
      console.error('QR fetch error:', err);
    }
  }

  // Helper: Build precise Android Intent, iOS Scheme, and Universal UPI links
  function buildUpiUrls(amount, note) {
    const upiId = 'antaryami12@upi';
    const payeeName = 'KrishanaPredi';
    const amt = String(amount || 300);
    const tn = note || 'KrishanaPredi';

    const standardUpi = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amt)}&cu=INR&tn=${encodeURIComponent(tn)}`;

    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    let phonepeUri, gpayUri, paytmUri;

    if (isAndroid) {
      // Android Intent format launches the APK directly without browser prompt errors
      phonepeUri = `intent://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amt)}&cu=INR&tn=${encodeURIComponent(tn)}#Intent;scheme=upi;package=com.phonepe.app;end`;
      gpayUri = `intent://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amt)}&cu=INR&tn=${encodeURIComponent(tn)}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;
      paytmUri = `intent://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amt)}&cu=INR&tn=${encodeURIComponent(tn)}#Intent;scheme=upi;package=net.one97.paytm;end`;
    } else if (isIOS) {
      phonepeUri = `phonepe://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amt)}&cu=INR&tn=${encodeURIComponent(tn)}`;
      gpayUri = `tez://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amt)}&cu=INR&tn=${encodeURIComponent(tn)}`;
      paytmUri = `paytmmp://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amt)}&cu=INR&tn=${encodeURIComponent(tn)}`;
    } else {
      // Desktop / Mac Simulator
      phonepeUri = standardUpi;
      gpayUri = standardUpi;
      paytmUri = standardUpi;
    }

    return { standardUpi, phonepeUri, gpayUri, paytmUri, upiId };
  }

  // Helper: Attach UPI Link to Button
  function attachAppOpener(elementId, appUri, standardUpi, upiId, appName) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isMacDesktop = navigator.platform?.toUpperCase().indexOf('MAC') >= 0 && !isIOS;

    // Set href directly to ensure mobile browsers treat it as user navigation
    el.href = appUri;

    el.onclick = (e) => {
      // Always copy UPI ID to clipboard as immediate safeguard
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(upiId).catch(() => {});
      }

      if (isMacDesktop) {
        // Desktop Mac does not have PhonePe/GPay APKs installed
        e.preventDefault();
        showToast(`UPI ID (${upiId}) copied! Please scan the QR code with your phone.`, 'success');
        return false;
      }

      showToast(`Opening ${appName}... (UPI ID: ${upiId} copied)`, 'success');
      // On real mobile (Android & iPhone), let native browser navigation launch the app!
      return true;
    };
  }

  // Setup Plan Purchase Deep Links
  function setupUpiAppLinks(amount) {
    const urls = buildUpiUrls(amount, 'Plan_Purchase');
    attachAppOpener('payPhonePeBtn', urls.phonepeUri, urls.standardUpi, urls.upiId, 'PhonePe');
    attachAppOpener('payGPayBtn', urls.gpayUri, urls.standardUpi, urls.upiId, 'Google Pay');
    attachAppOpener('payPaytmBtn', urls.paytmUri, urls.standardUpi, urls.upiId, 'Paytm');
    attachAppOpener('openUpiAppBtn', urls.standardUpi, urls.standardUpi, urls.upiId, 'UPI App');
  }

  // Setup Wallet Deposit Deep Links & Dynamic QR
  async function setupWalletUpiAppLinks(amount) {
    const amt = amount || 300;
    const urls = buildUpiUrls(amt, 'Wallet_Deposit');

    attachAppOpener('walletPayPhonePeBtn', urls.phonepeUri, urls.standardUpi, urls.upiId, 'PhonePe');
    attachAppOpener('walletPayGPayBtn', urls.gpayUri, urls.standardUpi, urls.upiId, 'Google Pay');
    attachAppOpener('walletPayPaytmBtn', urls.paytmUri, urls.standardUpi, urls.upiId, 'Paytm');
    attachAppOpener('walletOpenUpiAppBtn', urls.standardUpi, urls.standardUpi, urls.upiId, 'UPI App');

    // Also fetch dynamic QR code for this wallet amount
    try {
      const res = await fetch(`/api/payment/qr?amount=${amt}`);
      const data = await res.json();
      if (data.success) {
        const qrImg = document.getElementById('walletQrImg');
        if (qrImg) qrImg.src = data.qrDataUrl;
        const qrAmt = document.getElementById('walletQrAmtDisplay');
        if (qrAmt) qrAmt.textContent = `₹${Number(amt).toLocaleString('en-IN')}`;
      }
    } catch(err) {
      console.warn('Wallet QR fetch error', err);
    }
  }

  // Check Pending Payment Status
  async function checkPendingStatus() {
    if (!state.pendingRequestId) return;

    try {
      const res = await fetch(`/api/payment/status/${state.pendingRequestId}`);
      const data = await res.json();
      if (!data.success) return;

      if (data.status === 'APPROVED' && data.generatedKey) {
        // Owner Approved!
        state.approvedKey = data.generatedKey;
        localStorage.setItem('kp_approved_key', data.generatedKey);
        clearInterval(state.pollingInterval);

        // Show Approved UI
        document.getElementById('statusPendingState').style.display = 'none';
        document.getElementById('statusApprovedState').style.display = 'block';
        document.getElementById('displayApprovedKey').textContent = data.generatedKey;

        showToast('Payment Verified by Admin! Key Generated.', 'success');
      } else if (data.status === 'REJECTED') {
        clearInterval(state.pollingInterval);
        showToast('Payment verification rejected by admin: ' + (data.rejectReason || 'Invalid screenshot'), 'error');
      }
    } catch (err) {
      console.error('Status check error:', err);
    }
  }

  function startStatusPolling(requestId) {
    state.pendingRequestId = requestId;
    localStorage.setItem('kp_pending_req', requestId);

    if (state.pollingInterval) clearInterval(state.pollingInterval);

    // Initial check and then interval
    checkPendingStatus();
    state.pollingInterval = setInterval(checkPendingStatus, 4000);
  }

  // Populate Dashboard UI
  function populateDashboard() {
    if (!state.activatedPlan) return;

    const p = state.activatedPlan;
    document.getElementById('dashPlanName').textContent = p.planName;
    document.getElementById('dashRemainingDays').textContent = `${p.durationDays} Days`;
    document.getElementById('dashActiveKeyText').textContent = p.key;

    if (state.gameLinkData) {
      document.getElementById('dashSelectedGame').textContent = state.gameLinkData.game;
      document.getElementById('dashGameLinkPreview').textContent = state.gameLinkData.gameLink;
    }

    loadPredictionHistory(p.key);
  }

  // Load History
  async function loadPredictionHistory(key) {
    try {
      const res = await fetch(`/api/predictions/history?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!data.success) return;

      const container = document.getElementById('predictionHistoryList');
      if (!container) return;

      if (data.history.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 12px;">No signals generated yet.</div>';
        return;
      }

      container.innerHTML = data.history.map(item => {
        const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const val = item.data.targetMultiplier || item.data.predictedColor || item.data.favoredSide || (item.data.recommendedSpots ? item.data.recommendedSpots.join(', ') : 'SIGNAL');
        return `
          <div class="history-item">
            <div>
              <div style="font-weight: 700; color: #fff; font-size: 0.85rem;">${item.game} — <span style="color: var(--neon-green);">${val}</span></div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Seed: ${item.seedHash} • ${time}</div>
            </div>
            <div style="font-size: 0.75rem; color: var(--neon-accent); font-weight: 700;">
              ${item.data.estimatedConfidence || 'Verified'}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('History load error:', e);
    }
  }

  // Wallet Balance & Transaction History
  async function loadWallet() {
    if (!state.user) await initGuestSession();
    try {
      const res = await fetch(`/api/wallet?userId=${state.user?.id}`);
      const data = await res.json();
      if (data.success) {
        document.getElementById('walletBalanceDisplay').textContent = `₹${(data.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        
        const txList = document.getElementById('walletTxList');
        if (txList) {
          if (!data.transactions || data.transactions.length === 0) {
            txList.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 12px;">No transactions recorded yet.</div>';
          } else {
            txList.innerHTML = data.transactions.map(t => `
              <div class="history-item">
                <div>
                  <div style="font-weight: 700; color: #fff; font-size: 0.85rem;">
                    ${t.type === 'DEPOSIT' ? 'Deposit (+2% Daily)' : (t.type === 'WITHDRAWAL' ? 'Withdrawal' : t.type)}
                  </div>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${new Date(t.createdAt).toLocaleString()} ${t.utr ? '• Ref: ' + t.utr : ''}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 0.9rem; font-weight: 800; color: ${t.type === 'DEPOSIT' ? 'var(--neon-green)' : 'var(--neon-accent)'};">
                    ${t.type === 'DEPOSIT' ? '+' : '-'}₹${Number(t.amount).toLocaleString('en-IN')}
                  </div>
                  <span class="user-status-pill" style="font-size: 0.65rem; padding: 2px 6px;">${t.status || 'COMPLETED'}</span>
                </div>
              </div>
            `).join('');
          }
        }
      }
    } catch (e) {
      console.error('Wallet error:', e);
    }
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS INITIALIZATION
  // -------------------------------------------------------------
  function setupEventListeners() {

    // Brand Click -> Plans
    document.getElementById('brandHomeBtn')?.addEventListener('click', () => {
      if (state.activatedPlan && state.gameLinkData) {
        switchView('dashboard');
      } else {
        switchView('plans');
      }
    });

    // Auth Tabs
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    tabLoginBtn?.addEventListener('click', () => {
      tabLoginBtn.classList.add('active');
      tabRegisterBtn.classList.remove('active');
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
    });

    tabRegisterBtn?.addEventListener('click', () => {
      tabRegisterBtn.classList.add('active');
      tabLoginBtn.classList.remove('active');
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
    });

    // Login Form Submit (Instant AJAX without page reload)
    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('loginUsername');
      const passwordInput = document.getElementById('loginPassword');
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (!username || !password) {
        showToast('Please enter username and password', 'error');
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>LOGGING IN...</span>`;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success && data.token) {
          state.user = {
            id: data.user.id,
            username: data.user.username,
            isGuest: false
          };
          state.token = data.token;
          localStorage.setItem('kp_token', data.token);
          localStorage.setItem('kp_user', JSON.stringify(state.user));
          updateUserTag();
          updateNavVisibility();
          showToast(`Welcome back, ${state.user.username}! Choose your prediction plan below.`, 'success');

          // Transition directly to Buy Key / Plans page
          switchView('plans');
        } else {
          showToast(data.message || 'Login failed', 'error');
        }
      } catch (err) {
        console.error('Login error:', err);
        showToast('Network error during login', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });

    // Register Form Submit (Instant AJAX without page reload)
    registerForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('regUsername').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;

      if (!username || !password) {
        showToast('Please choose a username and password', 'error');
        return;
      }

      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>CREATING ACCOUNT...</span>`;

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();

        if (data.success && data.token) {
          state.user = {
            id: data.user.id,
            username: data.user.username,
            isGuest: false
          };
          state.token = data.token;
          localStorage.setItem('kp_token', data.token);
          localStorage.setItem('kp_user', JSON.stringify(state.user));
          updateUserTag();
          updateNavVisibility();
          showToast(data.message || 'Account created successfully!', 'success');
          switchView('plans');
        } else {
          showToast(data.message || 'Registration failed', 'error');
        }
      } catch (err) {
        console.error('Register error:', err);
        showToast('Network error during registration', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });

    // Logout Button Handler (supports external or fallback logout triggers)
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    // Continue as Guest: DIRECTLY allows user to purchase a plan
    document.getElementById('guestBtn')?.addEventListener('click', async () => {
      if (!state.user || state.user.isGuest) {
        await initGuestSession();
      }
      showToast('Continuing as Guest session.', 'success');
      switchView('plans');
    });

    // Quick Paste Key Banners
    document.getElementById('quickPasteBanner')?.addEventListener('click', () => switchView('pasteKey'));
    document.getElementById('haveKeyBanner')?.addEventListener('click', () => switchView('pasteKey'));

    // Navigation Tabs
    navBtns.plans?.addEventListener('click', () => switchView('plans'));
    navBtns.key?.addEventListener('click', () => switchView('pasteKey'));
    navBtns.game?.addEventListener('click', () => {
      if (!state.activatedPlan) {
        showToast('Please activate your key first!', 'error');
        switchView('pasteKey');
      } else {
        switchView('gameLink');
      }
    });
    navBtns.dash?.addEventListener('click', () => {
      if (!state.activatedPlan || !state.gameLinkData) {
        showToast('Active key and game link required!', 'error');
      } else {
        switchView('dashboard');
      }
    });
    navBtns.wallet?.addEventListener('click', () => {
      loadWallet();
      switchView('wallet');
    });

    // Back to Plans from Payment
    document.getElementById('backToPlansBtn')?.addEventListener('click', () => switchView('plans'));

    // Copy Wallet UPI ID
    document.getElementById('copyWalletUpiBtn')?.addEventListener('click', () => {
      const upiText = 'antaryami12@upi';
      navigator.clipboard.writeText(upiText).then(() => {
        showToast('UPI ID copied: ' + upiText, 'success');
      }).catch(() => showToast('Copied: ' + upiText));
    });

    // Wallet Tabs Switcher: Global + Event listeners
    window.switchWalletTab = function(tabName) {
      const tabDepositBtn = document.getElementById('tabDepositBtn');
      const tabWithdrawBtn = document.getElementById('tabWithdrawBtn');
      const walletDepositSection = document.getElementById('walletDepositSection');
      const walletWithdrawSection = document.getElementById('walletWithdrawSection');

      if (tabName === 'deposit') {
        tabDepositBtn?.classList.add('active');
        tabWithdrawBtn?.classList.remove('active');
        if (walletDepositSection) walletDepositSection.style.display = 'block';
        if (walletWithdrawSection) walletWithdrawSection.style.display = 'none';
      } else {
        tabWithdrawBtn?.classList.add('active');
        tabDepositBtn?.classList.remove('active');
        if (walletWithdrawSection) walletWithdrawSection.style.display = 'block';
        if (walletDepositSection) walletDepositSection.style.display = 'none';
        loadWallet();
      }
    };

    document.getElementById('tabDepositBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.switchWalletTab('deposit');
    });
    document.getElementById('tabWithdrawBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.switchWalletTab('withdraw');
    });

    // Amount Quick Selection: Global + Event listeners
    window.selectDepositAmount = function(amt) {
      const numAmt = Number(amt) || 300;
      
      // Update .amount-select-card active class
      document.querySelectorAll('.amount-select-card').forEach(card => {
        if (Number(card.getAttribute('data-amt')) === numAmt) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });

      // Update input
      const input = document.getElementById('depositAmount');
      if (input) {
        input.value = numAmt;
      }

      // Update live daily return text
      const dailyReturnEl = document.getElementById('dailyReturnAmount');
      if (dailyReturnEl) {
        const returnVal = (numAmt * 0.02).toFixed(2);
        dailyReturnEl.textContent = `+₹${returnVal} / day`;
      }

      // Update UPI app badges
      ['phonepeAmtTag', 'gpayAmtTag', 'paytmAmtTag', 'upiAmtTag'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = `₹${numAmt}`;
      });

      // Update submit button text
      const btnText = document.getElementById('depositBtnText');
      if (btnText) {
        btnText.textContent = `CONFIRM DEPOSIT OF ₹${numAmt.toLocaleString('en-IN')} (+2% DAILY)`;
      }

      setupWalletUpiAppLinks(numAmt);
      showToast(`Selected ₹${numAmt} (Daily Return: +₹${(numAmt * 0.02).toFixed(1)}/day)`, 'success');
    };

    // Attach click and touchend on amount cards
    document.querySelectorAll('.amount-select-card').forEach(card => {
      ['click', 'touchend'].forEach(evtName => {
        card.addEventListener(evtName, (e) => {
          e.preventDefault();
          const amt = Number(card.getAttribute('data-amt')) || 300;
          window.selectDepositAmount(amt);
        });
      });
    });

    // Dynamic input change updates UPI deep links & live returns
    document.getElementById('depositAmount')?.addEventListener('input', (e) => {
      const amt = Number(e.target.value);
      if (amt >= 300) {
        document.querySelectorAll('.amount-select-card').forEach(card => {
          if (Number(card.getAttribute('data-amt')) === amt) {
            card.classList.add('active');
          } else {
            card.classList.remove('active');
          }
        });

        const dailyReturnEl = document.getElementById('dailyReturnAmount');
        if (dailyReturnEl) {
          const returnVal = (amt * 0.02).toFixed(2);
          dailyReturnEl.textContent = `+₹${returnVal} / day`;
        }

        ['phonepeAmtTag', 'gpayAmtTag', 'paytmAmtTag', 'upiAmtTag'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = `₹${amt}`;
        });

        const btnText = document.getElementById('depositBtnText');
        if (btnText) {
          btnText.textContent = `CONFIRM DEPOSIT OF ₹${amt.toLocaleString('en-IN')} (+2% DAILY)`;
        }

        setupWalletUpiAppLinks(amt);
      }
    });

    // Strict Numeric Enforcement on UTR Inputs (0-9 only, completely silent without popups)
    function enforceNumericOnly(inputId) {
      const el = document.getElementById(inputId);
      if (!el) return;

      // Realtime input event: silently strip all non-digits, no annoying popups while typing
      el.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 12);
      });

      // Paste event: silently sanitize to max 12 digits
      el.addEventListener('paste', function() {
        setTimeout(() => {
          this.value = this.value.replace(/\D/g, '').slice(0, 12);
        }, 0);
      });
    }

    enforceNumericOnly('paymentUtr');
    enforceNumericOnly('depositUtr');

    // Wallet Deposit Form Submission
    document.getElementById('walletDepositForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('depositAmount').value;
      const utr = (document.getElementById('depositUtr').value || '').trim();

      const numAmount = Number(amount);
      if (!amount || isNaN(numAmount) || numAmount < 300) {
        showToast('Minimum deposit amount is ₹300.', 'error');
        return;
      }

      if (!/^\d{12}$/.test(utr)) {
        showToast('Invalid UTR! Please enter exact 12-digit numeric reference number.', 'error');
        return;
      }

      const btn = document.getElementById('depositSubmitBtn');
      btn.disabled = true;
      btn.innerHTML = `<span>PROCESSING DEPOSIT...</span>`;

      try {
        const res = await fetch('/api/wallet/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: state.user?.id || 'GUEST_' + Date.now(),
            amount,
            utr
          })
        });
        const data = await res.json();

        if (data.success) {
          showToast(data.message, 'success');
          document.getElementById('depositAmount').value = '';
          document.getElementById('depositUtr').value = '';
          loadWallet();
        } else {
          showToast(data.message || 'Deposit failed', 'error');
        }
      } catch (err) {
        showToast('Network error during deposit', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `
          <span>CONFIRM DEPOSIT (+2% DAILY)</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        `;
      }
    });

    // Copy UPI ID
    document.getElementById('copyUpiBtn')?.addEventListener('click', () => {
      const upiText = document.getElementById('upiIdText')?.textContent || 'antaryami12@upi';
      navigator.clipboard.writeText(upiText).then(() => {
        showToast('UPI ID copied to clipboard: ' + upiText, 'success');
      }).catch(() => {
        showToast('Copied: ' + upiText);
      });
    });

    // Dropzone for Payment Screenshot
    const dropzoneBox = document.getElementById('dropzoneBox');
    const screenshotFileInput = document.getElementById('screenshotFile');
    const screenshotPreview = document.getElementById('screenshotPreview');
    const dropzoneText = document.getElementById('dropzoneText');

    dropzoneBox?.addEventListener('click', () => screenshotFileInput.click());

    screenshotFileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          screenshotPreview.src = re.target.result;
          screenshotPreview.style.display = 'block';
          dropzoneText.style.display = 'none';
        };
        reader.readAsDataURL(file);
      }
    });

    // Submit Payment Form
    document.getElementById('paymentSubmitForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = screenshotFileInput.files[0];
      if (!file) {
        showToast('Please select a payment screenshot', 'error');
        return;
      }

      const utr = (document.getElementById('paymentUtr').value || '').trim();
      if (!/^\d{12}$/.test(utr)) {
        showToast('Invalid UTR! Please enter exact 12-digit numeric UTR number.', 'error');
        return;
      }

      const submitBtn = document.getElementById('submitPaymentBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>SUBMITTING...</span>`;

      try {
        const formData = new FormData();
        formData.append('screenshot', file);
        formData.append('planId', state.selectedPlan ? state.selectedPlan.id : 'plan_589');
        formData.append('amount', state.selectedPlan ? state.selectedPlan.price : 589);
        formData.append('utr', document.getElementById('paymentUtr').value || '');
        formData.append('userId', state.user?.id || 'GUEST_' + Date.now());

        const res = await fetch('/api/payment/submit', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (data.success) {
          showToast('Payment submitted for verification!', 'success');
          // Update Status View Elements
          document.getElementById('statusReqId').textContent = data.requestId;
          document.getElementById('statusPlanName').textContent = state.selectedPlan ? state.selectedPlan.name : 'Starter';
          document.getElementById('statusAmount').textContent = `₹${state.selectedPlan ? state.selectedPlan.price : 589}`;

          document.getElementById('statusPendingState').style.display = 'block';
          document.getElementById('statusApprovedState').style.display = 'none';

          startStatusPolling(data.requestId);
          switchView('status');
        } else {
          showToast(data.message || 'Submission failed', 'error');
        }
      } catch (err) {
        console.error('Payment submit error:', err);
        showToast('Network error submitting payment', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <span>SUBMIT FOR VERIFICATION</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        `;
      }
    });

    // Copy Approved Key Button
    document.getElementById('copyApprovedKeyBtn')?.addEventListener('click', () => {
      const key = document.getElementById('displayApprovedKey')?.textContent || state.approvedKey;
      if (key) {
        navigator.clipboard.writeText(key).then(() => {
          showToast('Key copied: ' + key, 'success');
        });
      }
    });

    // Proceed to Activate Key Button
    document.getElementById('proceedToActivateKeyBtn')?.addEventListener('click', () => {
      const key = document.getElementById('displayApprovedKey')?.textContent || state.approvedKey;
      if (key) {
        document.getElementById('inputLicenseKey').value = key;
      }
      switchView('pasteKey');
    });

    // Paste from Clipboard helper
    document.getElementById('pasteFromClipboardBtn')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          document.getElementById('inputLicenseKey').value = text.trim();
          showToast('Pasted from clipboard', 'success');
        }
      } catch (err) {
        showToast('Please paste manually using Ctrl+V / Cmd+V', 'error');
      }
    });

    // Key Activation Form (Server-Side Validation)
    document.getElementById('keyActivationForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = document.getElementById('inputLicenseKey').value.trim();
      if (!key) return;

      const submitBtn = document.getElementById('activateKeySubmitBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>VALIDATING KEY...</span>`;

      try {
        const res = await fetch('/api/keys/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, userId: state.user?.id })
        });
        const data = await res.json();

        if (data.success) {
          state.activatedPlan = data.plan;
          localStorage.setItem('kp_activated_plan', JSON.stringify(data.plan));
          showToast('Plan Activated Successfully! Now select your game.', 'success');

          // Reveal Game Link tab and switch to it!
          updateNavVisibility();
          switchView('gameLink');
        } else {
          showToast(data.message || 'Key activation failed', 'error');
        }
      } catch (err) {
        console.error('Key activation error:', err);
        showToast('Server communication error', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>ACTIVATE KEY</span>
        `;
      }
    });

    // Game Link Input Preview
    const selectGame = document.getElementById('selectGame');
    const inputGameLink = document.getElementById('inputGameLink');
    const previewCard = document.getElementById('gameLinkPreviewCard');
    const previewGameTitle = document.getElementById('previewGameTitle');
    const previewGameUrl = document.getElementById('previewGameUrl');

    function updateGamePreview() {
      const url = inputGameLink.value.trim();
      if (url) {
        previewCard.style.display = 'flex';
        previewGameTitle.textContent = selectGame.value;
        previewGameUrl.textContent = url;
      } else {
        previewCard.style.display = 'none';
      }
    }

    selectGame?.addEventListener('change', updateGamePreview);
    inputGameLink?.addEventListener('input', updateGamePreview);

    // Game Link Form Submission
    document.getElementById('gameLinkSubmitForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.activatedPlan) {
        showToast('Please activate key first', 'error');
        switchView('pasteKey');
        return;
      }

      const game = selectGame.value;
      const gameLink = inputGameLink.value.trim();

      try {
        const res = await fetch('/api/game-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: state.activatedPlan.key,
            game,
            gameLink,
            userId: state.user?.id
          })
        });
        const data = await res.json();

        if (data.success) {
          state.gameLinkData = data.gameLink;
          localStorage.setItem('kp_game_link', JSON.stringify(data.gameLink));
          showToast('Game Synchronized! Prediction Engine Unlocked.', 'success');

          updateNavVisibility();
          switchView('dashboard');
        } else {
          showToast(data.message || 'Error saving game link', 'error');
        }
      } catch (err) {
        console.error('Game link error:', err);
        showToast('Network error saving game link', 'error');
      }
    });

    // Prediction Generator Button
    document.getElementById('generatePredBtn')?.addEventListener('click', async () => {
      if (!state.activatedPlan) return;

      const btn = document.getElementById('generatePredBtn');
      const metric = document.getElementById('predMainMetric');
      const label = document.getElementById('predTypeLabel');

      btn.disabled = true;
      metric.textContent = 'SCANNING...';
      label.textContent = 'Analyzing entropy seed and flight velocity...';

      try {
        const res = await fetch('/api/predictions/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: state.activatedPlan.key,
            game: state.gameLinkData?.game || 'Aviator'
          })
        });
        const data = await res.json();

        if (data.success) {
          const p = data.prediction;
          const details = document.getElementById('predMatrixDetails');
          const notice = document.getElementById('predRecommendationNotice');

          details.style.display = 'grid';
          notice.style.display = 'block';

          if (p.data.targetMultiplier) {
            metric.textContent = p.data.targetMultiplier;
            label.textContent = 'Estimated Optimal Multiplier';
            document.getElementById('predSafeTarget').textContent = p.data.safeCashout || '--';
          } else if (p.data.predictedColor) {
            metric.textContent = p.data.predictedColor;
            label.textContent = 'High Density Color Bias';
            document.getElementById('predSafeTarget').textContent = `Odds: ${p.data.numberOdds?.join(', ')}`;
          } else if (p.data.favoredSide) {
            metric.textContent = p.data.favoredSide;
            label.textContent = 'Card Probability Advantage';
            document.getElementById('predSafeTarget').textContent = p.data.patternTrend;
          } else if (p.data.recommendedSpots) {
            metric.textContent = p.data.recommendedSpots.join(' • ');
            label.textContent = 'Safe Tile Heatmap Coordinate';
            document.getElementById('predSafeTarget').textContent = p.data.riskTier;
          }

          document.getElementById('predConfidence').textContent = p.data.estimatedConfidence;
          notice.textContent = p.data.recommendation;

          document.getElementById('radarSeedHash').textContent = `SEED: ${p.seedHash}`;
          document.getElementById('dashPredictionQuota').textContent = `${p.countToday} / ${p.dailyLimit} Signals`;

          showToast('New Prediction Signal Generated!', 'success');
          loadPredictionHistory(state.activatedPlan.key);
        } else {
          metric.textContent = 'LIMIT';
          label.textContent = data.message;
          showToast(data.message, 'error');
        }
      } catch (err) {
        console.error('Prediction error:', err);
        showToast('Error connecting to prediction matrix', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    // Dashboard Copy Key Button
    document.getElementById('dashCopyKeyBtn')?.addEventListener('click', () => {
      const key = state.activatedPlan?.key;
      if (key) {
        navigator.clipboard.writeText(key).then(() => {
          showToast('License Key copied to clipboard', 'success');
        });
      }
    });

    // Wallet Withdraw Form
    document.getElementById('walletWithdrawForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('withdrawAmount').value;
      const upiId = document.getElementById('withdrawUpi').value;

      if (!amount || !upiId) {
        showToast('Please enter both amount and UPI ID', 'error');
        return;
      }

      try {
        const res = await fetch('/api/wallet/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: state.user?.id, amount, upiId })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Withdrawal submitted for review', 'success');
          loadWallet();
        } else {
          showToast(data.message || 'Withdrawal failed', 'error');
        }
      } catch (e) {
        showToast('Withdrawal network error', 'error');
      }
    });
  }

  // -------------------------------------------------------------
  // BOOTSTRAP APP
  // -------------------------------------------------------------
  async function init() {
    setupEventListeners();

    // Check saved state immediately
    const savedUser = localStorage.getItem('kp_user');
    const savedToken = localStorage.getItem('kp_token');
    if (savedUser) {
      try { state.user = JSON.parse(savedUser); } catch(e){}
    }
    if (savedToken) {
      state.token = savedToken;
    }

    // Instantly reflect cached username & UI state without lag
    updateUserTag();
    updateNavVisibility();

    // Load available plans asynchronously
    await loadPlans();

    // Verify session with server if token exists
    await checkAuth();

    updateUserTag();
    updateNavVisibility();

    // Ensure wallet UPI links default to minimum ₹300
    setupWalletUpiAppLinks(300);

    // Dynamic absolute social share images for link previews
    try {
      const origin = window.location.origin;
      const fullLogoUrl = `${origin}/images/loki_hero.png`;
      document.querySelector('meta[property="og:image"]')?.setAttribute('content', fullLogoUrl);
      document.querySelector('meta[property="og:image:secure_url"]')?.setAttribute('content', fullLogoUrl);
      document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', fullLogoUrl);
    } catch(e){}

    // Resume flow if user had pending request or active key
    if (state.activatedPlan && state.gameLinkData) {
      switchView('dashboard');
    } else if (state.activatedPlan) {
      switchView('gameLink');
    } else if (state.pendingRequestId) {
      startStatusPolling(state.pendingRequestId);
      switchView('status');
    } else if (state.user && !state.user.isGuest) {
      // LOGGED IN USER: Never send to auth view! Show plans & How This Works!
      switchView('plans');
    } else {
      switchView('auth');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
