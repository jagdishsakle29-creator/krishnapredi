// LordGrow Protected Admin Console
(function() {
  'use strict';

  let adminToken = localStorage.getItem('lordgrow_token') || null;
  let currentStatusFilter = 'all';
  let currentDepositFilter = 'all';

  // Elements
  const gate = document.getElementById('adminLoginGate');
  const dashboard = document.getElementById('adminDashboardContent');
  const sessionTag = document.getElementById('adminSessionTag');
  const logoutBtn = document.getElementById('adminLogoutBtn');
  const loginForm = document.getElementById('adminLoginForm');
  const loginErrorMsg = document.getElementById('loginErrorMsg');
  const requestsContainer = document.getElementById('requestsContainer');
  const depositsContainer = document.getElementById('depositsContainer');

  // Headers helper
  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };
  }

  // Admin Login
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.style.display = 'none';

    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success && data.token) {
        adminToken = data.token;
        localStorage.setItem('lordgrow_token', adminToken);
        showDashboard();
      } else {
        loginErrorMsg.textContent = data.message || 'Invalid credentials';
        loginErrorMsg.style.display = 'block';
      }
    } catch (err) {
      loginErrorMsg.textContent = 'Server connection error';
      loginErrorMsg.style.display = 'block';
    }
  });

  // Logout
  logoutBtn?.addEventListener('click', () => {
    adminToken = null;
    localStorage.removeItem('lordgrow_token');
    showGate();
  });

  function showGate() {
    gate.style.display = 'block';
    dashboard.style.display = 'none';
    logoutBtn.style.display = 'none';
    sessionTag.textContent = 'UNAUTHENTICATED';
    sessionTag.style.color = 'var(--admin-red)';
  }

  function showDashboard() {
    gate.style.display = 'none';
    dashboard.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    sessionTag.textContent = 'OWNER: LORDGROW';
    sessionTag.style.color = 'var(--admin-green)';
    loadStats();
    loadDeposits();
    loadRequests();
  }

  // Load Metrics
  async function loadStats() {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/stats', { headers: getHeaders() });
      if (res.status === 401) return showGate();
      const data = await res.json();
      if (data.success) {
        const stats = data.stats;
        document.getElementById('statPendingCount').textContent = stats.pending || 0;
        document.getElementById('statApprovedCount').textContent = stats.approved || 0;
        document.getElementById('statTotalVolume').textContent = `₹${(stats.totalRevenue || 0).toLocaleString('en-IN')}`;
        document.getElementById('statKeysCount').textContent = stats.totalKeys || 0;

        // Wallet Deposit stats
        const pendingDep = stats.pendingDeposits || 0;
        const depVol = stats.totalDepositVolume || 0;
        const pendingDepEl = document.getElementById('statPendingDepositsCount');
        if (pendingDepEl) pendingDepEl.textContent = pendingDep;
        const depVolEl = document.getElementById('statDepositVolume');
        if (depVolEl) depVolEl.textContent = `₹${depVol.toLocaleString('en-IN')}`;

        const tabBadge = document.getElementById('tabPendingDepositBadge');
        if (tabBadge) {
          if (pendingDep > 0) {
            tabBadge.textContent = pendingDep;
            tabBadge.style.display = 'inline-block';
          } else {
            tabBadge.style.display = 'none';
          }
        }
      }
    } catch (err) {
      console.error('Stats error:', err);
    }
  }

  // Load Wallet Deposits
  async function loadDeposits() {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/deposits?status=${currentDepositFilter}`, { headers: getHeaders() });
      if (res.status === 401) return showGate();
      const data = await res.json();

      if (data.success) {
        renderDeposits(data.deposits);
      }
    } catch (err) {
      console.error('Deposits load error:', err);
    }
  }

  // Render Wallet Deposits List
  function renderDeposits(list) {
    if (!depositsContainer) return;

    if (!list || list.length === 0) {
      depositsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 50px; background: var(--admin-card); border-radius: 14px; border: 1px dashed var(--admin-border); grid-column: 1 / -1;">
          No wallet deposit requests found for filter: "${currentDepositFilter.toUpperCase()}".
        </div>
      `;
      return;
    }

    depositsContainer.innerHTML = list.map(dep => {
      const isPending = dep.status === 'PENDING';
      const isApproved = dep.status === 'APPROVED';
      const isRejected = dep.status === 'REJECTED';

      const statusColor = isApproved ? 'var(--admin-green)' : (isPending ? 'var(--admin-yellow)' : 'var(--admin-red)');
      const statusBg = isApproved ? 'rgba(0, 255, 102, 0.12)' : (isPending ? 'rgba(255, 187, 0, 0.15)' : 'rgba(255, 51, 85, 0.12)');
      const statusBorder = isApproved ? 'rgba(0, 255, 102, 0.4)' : (isPending ? 'rgba(255, 187, 0, 0.5)' : 'rgba(255, 51, 85, 0.4)');

      return `
        <div class="request-card" id="dep_card_${dep.id}" style="border: 1px solid ${statusBorder};">
          <div class="request-info" style="width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--admin-border); padding-bottom: 10px;">
              <div>
                <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">Deposit Amount</span>
                <div style="font-size: 1.5rem; font-weight: 900; color: var(--admin-green); font-family: 'Orbitron', monospace;">
                  ₹${Number(dep.amount).toLocaleString('en-IN')}
                </div>
              </div>
              <span class="req-status-pill" style="color: ${statusColor}; background: ${statusBg}; border: 1px solid ${statusBorder}; font-size: 0.75rem; padding: 4px 10px;">
                ${isPending ? '⏳ PENDING APPROVAL' : (isApproved ? '✔ APPROVED' : '✖ REJECTED')}
              </span>
            </div>

            <div class="req-detail-row">
              <span class="req-detail-label">User Name / ID:</span>
              <span class="req-detail-val" style="color: #fff; font-weight: 700;">${dep.username || dep.userId}</span>
            </div>

            <div class="req-detail-row">
              <span class="req-detail-label">12-Digit UTR:</span>
              <span class="req-detail-val utr-val" style="display: inline-flex; align-items: center; gap: 8px;">
                <span style="letter-spacing: 1.5px; font-weight: 800; color: #fff;">${dep.utr}</span>
                <button type="button" class="btn-copy-small" onclick="window.copyText('${dep.utr}')" style="padding: 2px 7px; font-size: 0.65rem;">COPY</button>
              </span>
            </div>

            <div class="req-detail-row">
              <span class="req-detail-label">Submitted At:</span>
              <span class="req-detail-val" style="color: var(--text-dim);">${new Date(dep.createdAt).toLocaleString()}</span>
            </div>

            ${dep.updatedAt ? `
              <div class="req-detail-row">
                <span class="req-detail-label">Processed At:</span>
                <span class="req-detail-val" style="color: ${statusColor}; font-weight: 600;">
                  ${new Date(dep.updatedAt).toLocaleString()} by ${dep.adminActionBy || 'Admin'}
                </span>
              </div>
            ` : ''}

            ${dep.rejectionReason ? `
              <div style="margin-top: 8px; padding: 8px 12px; background: rgba(255, 51, 85, 0.1); border-left: 3px solid var(--admin-red); border-radius: 4px; font-size: 0.78rem; color: #ffa8b8;">
                <strong>Rejection Reason:</strong> ${dep.rejectionReason}
              </div>
            ` : ''}

            <!-- Action Buttons -->
            <div class="req-actions" style="margin-top: 14px;">
              ${isPending ? `
                <button type="button" class="btn-approve" onclick="window.approveDeposit('${dep.id}', ${dep.amount})">
                  ✓ APPROVE DEPOSIT (+₹${dep.amount})
                </button>
                <button type="button" class="btn-reject" onclick="window.rejectDeposit('${dep.id}')">
                  ✕ REJECT
                </button>
              ` : `
                <div style="text-align: center; font-size: 0.78rem; color: var(--text-dim); padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px;">
                  ${isApproved ? 'Deposit Approved & Added to User Balance' : 'Deposit Rejected (No Balance Added)'}
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Global Actions for Deposits
  window.approveDeposit = async function(depositId, amount) {
    if (!confirm(`Confirm approval of ₹${amount} deposit for request ID ${depositId}?\n\nThis will add ₹${amount} directly to the user's available wallet balance.`)) return;

    try {
      const res = await fetch('/api/admin/deposits/approve', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ depositId })
      });
      const data = await res.json();

      if (data.success) {
        alert(data.message || 'Deposit approved successfully!');
        loadStats();
        loadDeposits();
      } else {
        alert(data.message || 'Approval failed');
      }
    } catch (err) {
      console.error('Approve error:', err);
      alert('Error approving deposit');
    }
  };

  window.rejectDeposit = async function(depositId) {
    const reason = prompt('Enter rejection reason for this deposit:', 'Payment not received / Invalid UTR reference');
    if (reason === null) return;

    try {
      const res = await fetch('/api/admin/deposits/reject', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ depositId, reason })
      });
      const data = await res.json();

      if (data.success) {
        alert('Deposit request rejected.');
        loadStats();
        loadDeposits();
      } else {
        alert(data.message || 'Rejection failed');
      }
    } catch (err) {
      console.error('Reject error:', err);
      alert('Error rejecting deposit');
    }
  };

  window.copyText = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard: ' + text);
    });
  };

  // Load Requests
  async function loadRequests() {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/requests?status=${currentStatusFilter}`, { headers: getHeaders() });
      if (res.status === 401) return showGate();
      const data = await res.json();

      if (data.success) {
        renderRequests(data.requests);
      }
    } catch (err) {
      console.error('Requests load error:', err);
    }
  }

  // Render Requests List
  function renderRequests(list) {
    if (!requestsContainer) return;

    if (!list || list.length === 0) {
      requestsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 50px; background: var(--admin-card); border-radius: 14px; border: 1px dashed var(--admin-border);">
          No payment requests found for filter: "${currentStatusFilter.toUpperCase()}".
        </div>
      `;
      return;
    }

    requestsContainer.innerHTML = list.map(req => {
      const statusClass = req.status.toLowerCase();
      const createdDate = new Date(req.createdAt).toLocaleString();

      return `
        <div class="request-card" id="req_card_${req.id}">
          <!-- Screenshot Thumbnail -->
          <div class="screenshot-thumbnail-container" data-fullimg="${req.screenshotUrl}">
            <img src="${req.screenshotUrl}" alt="Payment Screenshot" class="screenshot-thumbnail" onerror="this.src='/images/loki_hero.png'">
            <div class="zoom-hint">CLICK TO ZOOM</div>
          </div>

          <!-- Request Details -->
          <div class="request-info">
            <div class="req-header">
              <span class="req-id">${req.id}</span>
              <span class="req-status-pill ${statusClass}">${req.status}</span>
              <span style="font-size: 0.75rem; color: var(--text-dim);">${createdDate}</span>
            </div>

            <div style="display: flex; align-items: baseline; gap: 12px;">
              <span class="req-plan-title">${req.planName}</span>
              <span class="req-amount-badge">₹${req.amount}</span>
            </div>

            <div class="req-details-row">
              <span><strong>User/Guest:</strong> ${req.userId}</span>
              <span><strong>UTR / Ref:</strong> ${req.utr || 'None provided'}</span>
              <span><strong>Duration:</strong> ${req.durationDays} Days</span>
              <span><strong>Daily Quota:</strong> ${req.dailyPredictions} Signals</span>
            </div>

            ${req.status === 'APPROVED' && req.generatedKey ? `
              <div class="req-key-generated">
                <span>KEY: ${req.generatedKey}</span>
                <button type="button" class="btn-approve" onclick="copyKeyText('${req.generatedKey}')" style="padding: 4px 10px; font-size: 0.72rem;">
                  COPY KEY
                </button>
              </div>
            ` : ''}

            ${req.status === 'REJECTED' && req.rejectReason ? `
              <div style="font-size: 0.8rem; color: var(--admin-red); background: rgba(255,51,102,0.1); padding: 6px 10px; border-radius: 6px;">
                <strong>Reason:</strong> ${req.rejectReason}
              </div>
            ` : ''}
          </div>

          <!-- Actions -->
          <div class="req-actions">
            ${req.status === 'PENDING' ? `
              <button type="button" class="btn-approve" onclick="approvePayment('${req.id}')">
                ✓ APPROVE PAYMENT
              </button>
              <button type="button" class="btn-reject" onclick="rejectPayment('${req.id}')">
                ✕ REJECT
              </button>
            ` : `
              <div style="text-align: center; font-size: 0.75rem; color: var(--text-dim);">
                Processed
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Attach Lightbox Zoom Listeners
    document.querySelectorAll('.screenshot-thumbnail-container').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const fullUrl = thumb.getAttribute('data-fullimg');
        const modal = document.getElementById('lightboxModal');
        const img = document.getElementById('lightboxImg');
        img.src = fullUrl;
        modal.classList.add('active');
      });
    });
  }

  // Global Handlers for Approve/Reject/Copy
  window.approvePayment = async function(requestId) {
    if (!confirm('Verify payment and generate unique license key for ' + requestId + '?')) return;

    try {
      const res = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ requestId })
      });
      const data = await res.json();

      if (data.success) {
        alert('Payment APPROVED!\nGenerated Key: ' + data.key);
        loadStats();
        loadRequests();
      } else {
        alert(data.message || 'Approval failed');
      }
    } catch (err) {
      console.error('Approve error:', err);
      alert('Error approving payment');
    }
  };

  window.rejectPayment = async function(requestId) {
    const reason = prompt('Enter rejection reason for request:', 'Screenshot unclear / Invalid UTR reference');
    if (reason === null) return;

    try {
      const res = await fetch('/api/admin/reject', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ requestId, reason })
      });
      const data = await res.json();

      if (data.success) {
        alert('Payment Rejected');
        loadStats();
        loadRequests();
      } else {
        alert(data.message || 'Rejection failed');
      }
    } catch (err) {
      console.error('Reject error:', err);
    }
  };

  window.copyKeyText = function(key) {
    navigator.clipboard.writeText(key).then(() => {
      alert('Key copied: ' + key);
    });
  };

  // Deposit Filter Buttons
  document.querySelectorAll('.dep-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dep-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDepositFilter = btn.getAttribute('data-status');
      loadDeposits();
    });
  });

  // Request Filter Buttons
  document.querySelectorAll('.req-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.req-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStatusFilter = btn.getAttribute('data-status');
      loadRequests();
    });
  });

  // Subtabs Switcher
  document.querySelectorAll('.filter-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');

      const subviewDeposits = document.getElementById('subviewDeposits');
      const subviewRequests = document.getElementById('subviewRequests');
      const subviewKeys = document.getElementById('subviewKeys');
      const subviewGameLinks = document.getElementById('subviewGameLinks');

      if (subviewDeposits) subviewDeposits.style.display = target === 'deposits' ? 'block' : 'none';
      if (subviewRequests) subviewRequests.style.display = target === 'requests' ? 'block' : 'none';
      if (subviewKeys) subviewKeys.style.display = target === 'keys' ? 'block' : 'none';
      if (subviewGameLinks) subviewGameLinks.style.display = target === 'gamelinks' ? 'block' : 'none';

      if (target === 'deposits') loadDeposits();
      if (target === 'requests') loadRequests();
      if (target === 'keys') loadKeysTable();
      if (target === 'gamelinks') loadGameLinksTable();
    });
  });

  async function loadKeysTable() {
    try {
      const res = await fetch('/api/admin/keys', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        const tbody = document.getElementById('keysTableBody');
        if (!data.keys.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="padding: 16px; text-align: center; color: var(--text-dim);">No keys generated yet.</td></tr>';
          return;
        }
        tbody.innerHTML = data.keys.map(k => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px; font-family: monospace; color: var(--admin-green);">${k.key}</td>
            <td style="padding: 10px;">${k.planName}</td>
            <td style="padding: 10px;">₹${k.amount}</td>
            <td style="padding: 10px;">${k.userId}</td>
            <td style="padding: 10px;">
              <span class="req-status-pill ${k.isRedeemed ? 'approved' : 'pending'}">${k.isRedeemed ? 'REDEEMED' : 'UNREDEEMED'}</span>
            </td>
            <td style="padding: 10px; font-size: 0.75rem; color: var(--text-dim);">${new Date(k.createdAt).toLocaleDateString()}</td>
          </tr>
        `).join('');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadGameLinksTable() {
    try {
      const res = await fetch('/api/admin/game-links', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        const tbody = document.getElementById('gameLinksTableBody');
        if (!data.gameLinks.length) {
          tbody.innerHTML = '<tr><td colspan="4" style="padding: 16px; text-align: center; color: var(--text-dim);">No game links registered yet.</td></tr>';
          return;
        }
        tbody.innerHTML = data.gameLinks.map(g => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px; font-family: monospace; color: var(--admin-green);">${g.key}</td>
            <td style="padding: 10px; font-weight: 700; color: #fff;">${g.game}</td>
            <td style="padding: 10px; font-size: 0.8rem; color: var(--admin-accent); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <a href="${g.gameLink}" target="_blank" style="color: inherit;">${g.gameLink}</a>
            </td>
            <td style="padding: 10px; font-size: 0.75rem; color: var(--text-dim);">${new Date(g.updatedAt).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Refresh Button
  document.getElementById('refreshAdminBtn')?.addEventListener('click', () => {
    loadStats();
    loadDeposits();
    loadRequests();
  });

  // Lightbox Close
  document.getElementById('closeLightboxBtn')?.addEventListener('click', () => {
    document.getElementById('lightboxModal').classList.remove('active');
  });

  document.getElementById('lightboxModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightboxModal') {
      document.getElementById('lightboxModal').classList.remove('active');
    }
  });

  // Init Check
  if (adminToken) {
    showDashboard();
  } else {
    showGate();
  }

})();
