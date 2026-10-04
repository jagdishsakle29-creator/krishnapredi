/**
 * OK.WIN Official Color Prediction & Wingo Engine
 * Phase 2 - Antigravity Integration
 */

(function () {
  'use strict';

  // State
  let gameState = {
    currentPeriod: 'Loading...',
    timeLeft: 60,
    isLocked: false,
    history: [],
    selectedTarget: null,
    selectedTargetType: null, // 'color', 'number', 'bigsmall'
    selectedOdds: '2x',
    chipAmount: 10,
    multiplier: 1,
    walletBalance: 0,
    isGuest: true,
    lastDrawnPeriod: null,
    soundEnabled: true
  };

  // DOM Elements
  const periodNumEl = document.getElementById('periodNum');
  const clockMinEl = document.getElementById('clockMin');
  const clockSecEl = document.getElementById('clockSec');
  const stageCardEl = document.getElementById('stageCard');
  const lockOverlayEl = document.getElementById('lockOverlay');
  const lockCountdownEl = document.getElementById('lockCountdown');
  const recentStripEl = document.getElementById('recentStrip');
  const balanceValEl = document.getElementById('balanceVal');
  const historyTableBody = document.getElementById('historyTableBody');
  const myBetsTableBody = document.getElementById('myBetsTableBody');
  const soundToggleBtn = document.getElementById('soundToggleBtn');

  // Modal Elements
  const betModalEl = document.getElementById('betModal');
  const modalTargetPill = document.getElementById('modalTargetPill');
  const modalCounterVal = document.getElementById('modalCounterVal');
  const modalTotalAmt = document.getElementById('modalTotalAmt');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');
  const cntMinusBtn = document.getElementById('cntMinusBtn');
  const cntPlusBtn = document.getElementById('cntPlusBtn');

  // Win Modal Elements
  const winModalEl = document.getElementById('winModal');
  const winPeriodEl = document.getElementById('winPeriod');
  const winBigBallEl = document.getElementById('winBigBall');
  const winDetailsEl = document.getElementById('winDetails');
  const winCloseBtn = document.getElementById('winCloseBtn');

  // Audio Synthesizer (No external assets required!)
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type = 'sine', duration = 0.1, gain = 0.15) {
    if (!gameState.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playTickSound() {
    playTone(880, 'triangle', 0.08, 0.2);
  }

  function playWinSound() {
    if (!gameState.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'sine', 0.25, 0.3), idx * 110);
      });
    } catch (e) {}
  }

  // Get Auth Header
  function getAuthToken() {
    return localStorage.getItem('krishana_token') || '';
  }

  // Fetch User Balance
  async function fetchUserBalance() {
    const token = getAuthToken();
    if (!token) {
      // Demo / Guest mode balance
      const storedDemo = localStorage.getItem('okwin_demo_balance');
      gameState.walletBalance = storedDemo !== null ? Number(storedDemo) : 1000;
      gameState.isGuest = true;
      updateBalanceUI();
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.user) {
        gameState.walletBalance = Number(data.user.walletBalance || 0);
        gameState.isGuest = false;
        updateBalanceUI();
      }
    } catch (e) {
      console.warn('Could not fetch user profile:', e);
    }
  }

  function updateBalanceUI() {
    if (balanceValEl) {
      balanceValEl.textContent = `₹${gameState.walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  // Format Balls & Badges
  function getBallClass(num) {
    if (num === 0) return 'ball-0';
    if (num === 5) return 'ball-5';
    if ([1, 3, 7, 9].includes(num)) return 'ball-green';
    return 'ball-red';
  }

  function renderColorDots(colors) {
    return colors.map(c => `<span class="ok-color-dot ${c}"></span>`).join('');
  }

  // Poll Server State
  let previousSecond = null;
  async function pollState() {
    try {
      const res = await fetch('/api/okwin/state');
      const data = await res.json();
      if (!data.success) return;

      gameState.currentPeriod = data.currentPeriod;
      gameState.timeLeft = data.timeLeft;
      gameState.isLocked = data.isLocked;
      gameState.history = data.history || [];

      // Update Header Period Number
      if (periodNumEl) periodNumEl.textContent = data.currentPeriod;

      // Update Digital Clock
      const mins = Math.floor(data.timeLeft / 60);
      const secs = data.timeLeft % 60;
      if (clockMinEl) clockMinEl.textContent = String(mins).padStart(2, '0');
      if (clockSecEl) clockSecEl.textContent = String(secs).padStart(2, '0');

      // Countdown Audio & Locking (Last 5 seconds)
      if (data.timeLeft <= 5 && data.timeLeft > 0) {
        if (stageCardEl) stageCardEl.classList.add('is-locked');
        if (lockOverlayEl) lockOverlayEl.classList.add('active');
        if (lockCountdownEl) lockCountdownEl.textContent = `0${data.timeLeft}`;
        
        if (previousSecond !== data.timeLeft) {
          playTickSound();
          previousSecond = data.timeLeft;
        }
      } else {
        if (stageCardEl) stageCardEl.classList.remove('is-locked');
        if (lockOverlayEl) lockOverlayEl.classList.remove('active');
        previousSecond = null;
      }

      // Check if new draw just arrived
      if (gameState.history.length > 0) {
        const latestRound = gameState.history[0];
        if (gameState.lastDrawnPeriod && gameState.lastDrawnPeriod !== latestRound.period) {
          onRoundFinished(latestRound);
        }
        gameState.lastDrawnPeriod = latestRound.period;
      }

      // Render Recent Mini Balls Strip
      renderRecentStrip();

      // Render History Table
      renderHistoryTable();

    } catch (err) {
      console.warn('Error polling okwin state:', err);
    }
  }

  function renderRecentStrip() {
    if (!recentStripEl || !gameState.history.length) return;
    const recent5 = gameState.history.slice(0, 5);
    recentStripEl.innerHTML = recent5.map(item => `
      <div class="ok-mini-ball ${getBallClass(item.number)}" title="Period ${item.period}: ${item.number}">
        ${item.number}
      </div>
    `).join('');
  }

  function renderHistoryTable() {
    if (!historyTableBody || !gameState.history.length) return;
    historyTableBody.innerHTML = gameState.history.map(item => `
      <tr>
        <td style="color: #9ca3af; font-family: monospace;">${item.period}</td>
        <td>
          <span class="ok-res-ball ${getBallClass(item.number)}">${item.number}</span>
        </td>
        <td>
          <span class="ok-bs-badge ${item.bigSmall.toLowerCase()}">${item.bigSmall}</span>
        </td>
        <td>
          <div class="ok-color-dot-wrap">${renderColorDots(item.colors)}</div>
        </td>
      </tr>
    `).join('');
  }

  async function fetchMyBets() {
    if (!myBetsTableBody) return;
    const token = getAuthToken();
    try {
      const res = await fetch('/api/okwin/my-bets', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!data.success || !data.bets || !data.bets.length) {
        myBetsTableBody.innerHTML = `<tr><td colspan="5" style="padding: 24px; color: #6b7280;">No bets placed yet</td></tr>`;
        return;
      }

      myBetsTableBody.innerHTML = data.bets.map(b => {
        let statusBadge = '<span style="color:#f59e0b; font-weight:700;">Pending</span>';
        if (b.status === 'WON') {
          statusBadge = `<span style="color:#10b981; font-weight:700;">Won (+₹${b.winAmount})</span>`;
        } else if (b.status === 'LOST') {
          statusBadge = '<span style="color:#ef4444; font-weight:700;">Lost</span>';
        }

        return `
          <tr>
            <td style="font-family: monospace; color: #9ca3af;">${b.period}</td>
            <td style="text-transform: uppercase; font-weight: 800;">${b.selection}</td>
            <td>₹${b.totalAmount}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.warn('Could not fetch user bets:', e);
    }
  }

  // Round Finished Celebration
  function onRoundFinished(latestRound) {
    playWinSound();
    fetchUserBalance();
    fetchMyBets();

    // Show popup
    if (winModalEl) {
      winPeriodEl.textContent = `Period: ${latestRound.period}`;
      winBigBallEl.textContent = latestRound.number;
      winBigBallEl.className = `ok-win-big-ball ${getBallClass(latestRound.number)}`;
      
      const colorsStr = latestRound.colors.map(c => c.toUpperCase()).join(' & ');
      winDetailsEl.innerHTML = `
        <span style="color: #fadb14;">${colorsStr}</span>
        <span>•</span>
        <span style="color: #60a5fa;">${latestRound.bigSmall}</span>
      `;
      winModalEl.classList.add('active');

      setTimeout(() => {
        winModalEl.classList.remove('active');
      }, 4500);
    }
  }

  // Open Betting Drawer
  function openBetModal(target, type, odds = '2x') {
    if (gameState.isLocked) {
      alert('⚠️ Betting is locked for current period. Please wait for next round!');
      return;
    }

    getAudioContext(); // Unlock audio
    gameState.selectedTarget = target;
    gameState.selectedTargetType = type;
    gameState.selectedOdds = odds;
    gameState.multiplier = 1;

    // Style modal badge
    if (modalTargetPill) {
      modalTargetPill.textContent = `Select: ${String(target).toUpperCase()} (${odds})`;
      modalTargetPill.style.backgroundColor = getTargetColor(target);
      modalTargetPill.style.color = target === 'yellow' || target === 'big' ? '#111' : '#fff';
    }

    if (modalCounterVal) modalCounterVal.textContent = gameState.multiplier;
    updateModalTotal();

    if (betModalEl) betModalEl.classList.add('active');
  }

  function getTargetColor(target) {
    const t = String(target).toLowerCase();
    if (t === 'green') return '#10b981';
    if (t === 'red') return '#ef4444';
    if (t === 'violet') return '#8b5cf6';
    if (t === 'big') return '#f59e0b';
    if (t === 'small') return '#3b82f6';
    if (t === '0') return '#dc2626';
    if (t === '5') return '#059669';
    if (['1', '3', '7', '9'].includes(t)) return '#10b981';
    return '#ef4444';
  }

  function closeBetModal() {
    if (betModalEl) betModalEl.classList.remove('active');
  }

  function updateModalTotal() {
    const total = gameState.chipAmount * gameState.multiplier;
    if (modalTotalAmt) {
      modalTotalAmt.textContent = `₹${total.toLocaleString('en-IN')}`;
    }
  }

  // Submit Bet
  async function submitBet() {
    const total = gameState.chipAmount * gameState.multiplier;
    if (total > gameState.walletBalance) {
      alert(`⚠️ Insufficient balance! Your balance is ₹${gameState.walletBalance}. Please Add Money.`);
      return;
    }

    modalConfirmBtn.disabled = true;
    modalConfirmBtn.textContent = 'Processing...';

    const token = getAuthToken();

    try {
      const res = await fetch('/api/okwin/bet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          selection: gameState.selectedTarget,
          amount: gameState.chipAmount,
          multiplier: gameState.multiplier,
          guestId: 'guest-' + (localStorage.getItem('okwin_guest_id') || Math.random().toString(36).substring(7))
        })
      });

      const data = await res.json();
      if (data.success) {
        closeBetModal();
        playTone(660, 'sine', 0.15, 0.2);

        if (!token) {
          // Deduct from demo balance
          gameState.walletBalance = Math.max(0, gameState.walletBalance - total);
          localStorage.setItem('okwin_demo_balance', gameState.walletBalance);
          updateBalanceUI();
        } else {
          gameState.walletBalance = Number(data.newBalance);
          updateBalanceUI();
        }

        fetchMyBets();
        showNotification(`✅ Bet Placed: ${String(gameState.selectedTarget).toUpperCase()} for ₹${total}`);
      } else {
        alert(data.message || 'Error placing bet');
      }
    } catch (e) {
      alert('Network error while placing bet');
    } finally {
      modalConfirmBtn.disabled = false;
      modalConfirmBtn.textContent = 'Confirm Bet';
    }
  }

  function showNotification(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      top: 65px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: #fff;
      font-weight: 800;
      font-size: 13px;
      padding: 10px 18px;
      border-radius: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      z-index: 150;
      pointer-events: none;
      animation: fadeInOut 3s forwards;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  // Setup Event Listeners
  function initListeners() {
    // Sound Toggle
    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', () => {
        gameState.soundEnabled = !gameState.soundEnabled;
        soundToggleBtn.textContent = gameState.soundEnabled ? '🔊' : '🔇';
      });
    }

    // Color buttons
    document.querySelectorAll('.ok-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color');
        const odds = btn.getAttribute('data-odds') || '2x';
        openBetModal(color, 'color', odds);
      });
    });

    // Number balls
    document.querySelectorAll('.ok-num-ball').forEach(btn => {
      btn.addEventListener('click', () => {
        const num = btn.getAttribute('data-num');
        openBetModal(num, 'number', '9x');
      });
    });

    // Big / Small buttons
    document.querySelectorAll('.ok-bs-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bs = btn.getAttribute('data-bs');
        openBetModal(bs, 'bigsmall', '2x');
      });
    });

    // Multiplier Pills in Console
    document.querySelectorAll('.ok-multi-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.ok-multi-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const val = Number(pill.getAttribute('data-multi')) || 1;
        gameState.multiplier = val;
        if (modalCounterVal) modalCounterVal.textContent = val;
        updateModalTotal();
      });
    });

    // Chip Amount Selectors in Modal
    document.querySelectorAll('.ok-chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.ok-chip-btn').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        gameState.chipAmount = Number(chip.getAttribute('data-amt')) || 10;
        updateModalTotal();
      });
    });

    // Quantity Increment / Decrement
    if (cntMinusBtn) {
      cntMinusBtn.addEventListener('click', () => {
        if (gameState.multiplier > 1) {
          gameState.multiplier--;
          if (modalCounterVal) modalCounterVal.textContent = gameState.multiplier;
          updateModalTotal();
        }
      });
    }

    if (cntPlusBtn) {
      cntPlusBtn.addEventListener('click', () => {
        gameState.multiplier++;
        if (modalCounterVal) modalCounterVal.textContent = gameState.multiplier;
        updateModalTotal();
      });
    }

    // Modal Close
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeBetModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeBetModal);
    if (modalConfirmBtn) modalConfirmBtn.addEventListener('click', submitBet);

    // Win Modal Close
    if (winCloseBtn) {
      winCloseBtn.addEventListener('click', () => {
        if (winModalEl) winModalEl.classList.remove('active');
      });
    }

    // Record Tabs Switcher (History vs My Bets)
    document.querySelectorAll('.ok-rec-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ok-rec-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ok-tab-pane').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetPane = document.getElementById(tab.getAttribute('data-pane'));
        if (targetPane) targetPane.classList.add('active');

        if (tab.getAttribute('data-pane') === 'myBetsPane') {
          fetchMyBets();
        }
      });
    });
  }

  // Initialize
  function init() {
    initListeners();
    fetchUserBalance();
    pollState();
    fetchMyBets();
    setInterval(pollState, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
