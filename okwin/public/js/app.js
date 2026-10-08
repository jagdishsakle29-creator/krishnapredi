/**
 * OK WIN — Client Game Logic & Real-time Win Go Engine
 */

(function () {
  'use strict';

  // State
  let currentMode = '1min';
  const userId = 'demo-user';
  let remainingSeconds = 60;
  let currentPeriodId = '';
  let timerInterval = null;
  let syncInterval = null;
  let isLockdown = false;
  let userBalance = 5000;
  let lastCheckedPeriod = '';

  // Active Bet Sheet State
  let selectedBet = {
    type: 'color',     // 'color' | 'number' | 'size'
    val: 'green',
    name: 'Green',
    baseAmount: 10,
    quantity: 1,
    multiplier: 1
  };

  // DOM Elements
  const userBalanceDisplay = document.getElementById('userBalanceDisplay');
  const refreshBalanceBtn = document.getElementById('refreshBalanceBtn');
  const currentPeriodDisplay = document.getElementById('currentPeriodDisplay');
  const timeMin0 = document.getElementById('timeMin0');
  const timeMin1 = document.getElementById('timeMin1');
  const timeSec0 = document.getElementById('timeSec0');
  const timeSec1 = document.getElementById('timeSec1');
  const countdownClock = document.getElementById('countdownClock');
  const lockdownOverlay = document.getElementById('lockdownOverlay');
  const lockdownSeconds = document.getElementById('lockdownSeconds');
  const gameHistoryList = document.getElementById('gameHistoryList');
  const myBetsList = document.getElementById('myBetsList');
  const toastBox = document.getElementById('toastBox');

  // Bet Sheet Elements
  const betModalBackdrop = document.getElementById('betModalBackdrop');
  const sheetTitle = document.getElementById('sheetTitle');
  const sheetSelectionBadge = document.getElementById('sheetSelectionBadge');
  const totalBetAmount = document.getElementById('totalBetAmount');
  const qtyInput = document.getElementById('qtyInput');
  const stepMinusBtn = document.getElementById('stepMinusBtn');
  const stepPlusBtn = document.getElementById('stepPlusBtn');
  const cancelBetBtn = document.getElementById('cancelBetBtn');
  const confirmBetBtn = document.getElementById('confirmBetBtn');

  // Result Modal Elements
  const resultModalBackdrop = document.getElementById('resultModalBackdrop');
  const resultPeriodText = document.getElementById('resultPeriodText');
  const resultBigBall = document.getElementById('resultBigBall');
  const resTagSize = document.getElementById('resTagSize');
  const resTagColors = document.getElementById('resTagColors');
  const resultPayoutText = document.getElementById('resultPayoutText');
  const closeResultModalBtn = document.getElementById('closeResultModalBtn');

  // Recharge Modal Elements
  const rechargeModalBackdrop = document.getElementById('rechargeModalBackdrop');
  const rechargeModalBtn = document.getElementById('rechargeModalBtn');
  const closeRechargeBtn = document.getElementById('closeRechargeBtn');
  const confirmRechargeBtn = document.getElementById('confirmRechargeBtn');

  // Chart Canvas
  const trendCanvas = document.getElementById('trendChartCanvas');

  // Toast Helper
  function showToast(msg, duration = 2500) {
    if (!toastBox) return;
    toastBox.textContent = msg;
    toastBox.classList.add('show');
    setTimeout(() => {
      toastBox.classList.remove('show');
    }, duration);
  }

  // Format Currency
  function formatMoney(num) {
    return Number(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Fetch Game State from Server
  async function fetchGameState() {
    try {
      const res = await fetch(`/api/game/state?mode=${currentMode}&userId=${userId}`);
      const data = await res.json();
      if (!data.success) return;

      currentPeriodId = data.periodId;
      currentPeriodDisplay.textContent = currentPeriodId;
      remainingSeconds = data.remainingSeconds;
      userBalance = data.userBalance;
      userBalanceDisplay.textContent = formatMoney(userBalance);

      // Render History
      renderHistory(data.history);

      // If period has changed, check for result announcements
      if (lastCheckedPeriod && lastCheckedPeriod !== currentPeriodId) {
        checkRecentResults(data.history[0]);
        fetchMyBets();
      }
      lastCheckedPeriod = currentPeriodId;

      updateClockDisplay();
      drawTrendChart(data.history);
    } catch (e) {
      console.error('Failed to sync game state:', e);
    }
  }

  // Update Countdown Visuals
  function updateClockDisplay() {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;

    const minStr = String(mins).padStart(2, '0');
    const secStr = String(secs).padStart(2, '0');

    timeMin0.textContent = minStr[0];
    timeMin1.textContent = minStr[1];
    timeSec0.textContent = secStr[0];
    timeSec1.textContent = secStr[1];

    if (remainingSeconds <= 5 && remainingSeconds > 0) {
      isLockdown = true;
      countdownClock.classList.add('warning');
      lockdownOverlay.classList.add('active');
      lockdownSeconds.textContent = remainingSeconds;
    } else {
      isLockdown = false;
      countdownClock.classList.remove('warning');
      lockdownOverlay.classList.remove('active');
    }
  }

  // Local Clock Tick (1 second interval)
  function startLocalTick() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        updateClockDisplay();
      } else {
        // Round ended! Fetch immediately
        fetchGameState();
      }
    }, 1000);
  }

  // Check recent user bet results for pop-up celebration
  async function checkRecentResults(latestRound) {
    if (!latestRound) return;
    try {
      const res = await fetch(`/api/game/my-bets?mode=${currentMode}&userId=${userId}`);
      const data = await res.json();
      if (!data.success || !data.bets || data.bets.length === 0) return;

      const finishedBets = data.bets.filter(b => b.periodId === latestRound.periodId);
      if (finishedBets.length > 0) {
        let totalWin = finishedBets.reduce((acc, b) => acc + (b.winAmount || 0), 0);
        let hasWon = totalWin > 0;

        showResultModal(latestRound, hasWon, totalWin);
      }
    } catch (e) {
      console.error('Error checking bet results:', e);
    }
  }

  // Show Result Celebration Modal
  function showResultModal(round, hasWon, winAmt) {
    resultPeriodText.textContent = `Period ${round.periodId}`;
    resultBigBall.textContent = round.number;

    // Apply color to result ball
    resultBigBall.className = 'result-big-ball';
    if (round.number === 0) {
      resultBigBall.classList.add('ball-split-0');
    } else if (round.number === 5) {
      resultBigBall.classList.add('ball-split-5');
    } else if ([1, 3, 7, 9].includes(round.number)) {
      resultBigBall.classList.add('ball-green');
    } else {
      resultBigBall.classList.add('ball-red');
    }

    resTagSize.textContent = round.size.toUpperCase();
    resTagColors.textContent = round.colors.join(' & ').toUpperCase();

    if (hasWon) {
      resultPayoutText.textContent = `🎉 Congratulations! Won ₹${formatMoney(winAmt)}`;
      resultPayoutText.style.color = '#2E7D32';
    } else {
      resultPayoutText.textContent = `Better luck next round!`;
      resultPayoutText.style.color = '#D32F2F';
    }

    resultModalBackdrop.classList.add('active');
  }

  closeResultModalBtn.addEventListener('click', () => {
    resultModalBackdrop.classList.remove('active');
  });

  // Render History Table
  function renderHistory(history) {
    if (!gameHistoryList || !history) return;
    gameHistoryList.innerHTML = '';

    history.forEach(item => {
      const row = document.createElement('div');
      row.className = 'history-row';

      // Ball color class
      let ballClass = 'ball-green';
      if (item.number === 0) ballClass = 'ball-split-0';
      else if (item.number === 5) ballClass = 'ball-split-5';
      else if ([2, 4, 6, 8].includes(item.number)) ballClass = 'ball-red';

      // Color dots
      const dotsHtml = item.colors.map(c => `<span class="color-dot dot-${c}"></span>`).join('');
      const sizeClass = item.size === 'big' ? 'size-big-pill' : 'size-small-pill';

      row.innerHTML = `
        <div class="row-period">${item.periodId.slice(-4)}</div>
        <div>
          <span class="row-num-ball ${ballClass}">${item.number}</span>
        </div>
        <div>
          <span class="row-size-pill ${sizeClass}">${item.size.toUpperCase()}</span>
        </div>
        <div class="color-dots-wrap">
          ${dotsHtml}
        </div>
      `;
      gameHistoryList.appendChild(row);
    });
  }

  // Draw Interactive Trend Chart (Canvas)
  function drawTrendChart(history) {
    if (!trendCanvas || !history || history.length === 0) return;
    const ctx = trendCanvas.getContext('2d');
    const items = history.slice(0, 15).reverse(); // Oldest to newest
    
    const width = trendCanvas.width;
    const height = trendCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const padding = 30;
    const availableWidth = width - (padding * 2);
    const availableHeight = height - (padding * 2);
    const stepX = availableWidth / (items.length - 1 || 1);

    // Draw background horizontal grid lines (numbers 0 to 9)
    ctx.strokeStyle = '#ECEFF1';
    ctx.lineWidth = 1;
    ctx.font = '10px Montserrat';
    ctx.fillStyle = '#90A4AE';

    for (let num = 0; num <= 9; num += 2) {
      const y = height - padding - ((num / 9) * availableHeight);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      ctx.fillText(String(num), 10, y + 3);
    }

    // Coordinates for each point
    const points = items.map((item, idx) => {
      const x = padding + (idx * stepX);
      const y = height - padding - ((item.number / 9) * availableHeight);
      return { x, y, item };
    });

    // Draw connecting trend line
    ctx.beginPath();
    ctx.strokeStyle = '#FEAA00';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';

    points.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Draw number nodes / balls
    points.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
      
      if (pt.item.number === 0) ctx.fillStyle = '#9C27B0';
      else if (pt.item.number === 5) ctx.fillStyle = '#00B977';
      else if ([1, 3, 7, 9].includes(pt.item.number)) ctx.fillStyle = '#00B977';
      else ctx.fillStyle = '#FE4355';

      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Number text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px Rajdhani';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pt.item.number), pt.x, pt.y);
    });
  }

  // Fetch User's Bets for this mode
  async function fetchMyBets() {
    try {
      const res = await fetch(`/api/game/my-bets?mode=${currentMode}&userId=${userId}`);
      const data = await res.json();
      if (!data.success || !myBetsList) return;

      if (data.bets.length === 0) {
        myBetsList.innerHTML = `<div class="empty-state">No bets placed yet in this mode. Place a bet to see records!</div>`;
        return;
      }

      myBetsList.innerHTML = '';
      data.bets.forEach(b => {
        const card = document.createElement('div');
        card.className = 'bet-card';

        let statusClass = 'status-pending';
        let statusText = 'Pending';
        let winDetails = '';

        if (b.status === 'won') {
          statusClass = 'status-won';
          statusText = `Won ₹${formatMoney(b.winAmount)}`;
        } else if (b.status === 'lost') {
          statusClass = 'status-lost';
          statusText = 'Lost';
        }

        card.innerHTML = `
          <div class="bet-card-left">
            <div class="bet-card-period">Period ${b.periodId}</div>
            <div class="bet-card-select">Select: <strong>${b.selection.toUpperCase()}</strong> (${b.type})</div>
          </div>
          <div class="bet-card-right">
            <div class="bet-card-amt">₹${formatMoney(b.amount)}</div>
            <span class="bet-status-pill ${statusClass}">${statusText}</span>
          </div>
        `;
        myBetsList.appendChild(card);
      });
    } catch (e) {
      console.error('Error fetching user bets:', e);
    }
  }

  // Bet Modal Open & Calculation
  function openBetSheet(type, val, name) {
    if (isLockdown) {
      showToast('⚠️ Betting is closed for the current period!');
      return;
    }

    selectedBet.type = type;
    selectedBet.val = val;
    selectedBet.name = name;
    selectedBet.baseAmount = 10;
    selectedBet.quantity = 1;
    selectedBet.multiplier = 1;

    sheetTitle.textContent = `Win Go ${currentMode.replace('min', 'Min')}`;
    sheetSelectionBadge.textContent = `Select: ${name}`;

    // Reset chips & stepper
    document.querySelectorAll('.chip-btn').forEach((c, idx) => {
      c.classList.toggle('active', idx === 0);
    });
    qtyInput.value = 1;

    updateBetTotal();
    betModalBackdrop.classList.add('active');
  }

  function updateBetTotal() {
    const total = selectedBet.baseAmount * selectedBet.quantity * selectedBet.multiplier;
    totalBetAmount.textContent = `₹${formatMoney(total)}`;
  }

  // Event Listeners for Betting Triggers
  document.querySelectorAll('.bet-color-btn, .num-ball, .bet-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      const val = btn.getAttribute('data-val');
      const name = btn.getAttribute('data-name');
      openBetSheet(type, val, name);
    });
  });

  // Random Pick Button
  const randomPickBtn = document.getElementById('randomPickBtn');
  if (randomPickBtn) {
    randomPickBtn.addEventListener('click', () => {
      const randNum = Math.floor(Math.random() * 10);
      openBetSheet('number', String(randNum), String(randNum));
    });
  }

  // Base Amount Chips
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedBet.baseAmount = parseInt(btn.getAttribute('data-base'), 10);
      updateBetTotal();
    });
  });

  // Multiplier Quick Chips
  document.querySelectorAll('.q-mult-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.q-mult-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedBet.multiplier = parseInt(btn.getAttribute('data-mult'), 10);
      updateBetTotal();
    });
  });

  // Stepper Controls
  stepMinusBtn.addEventListener('click', () => {
    let q = parseInt(qtyInput.value, 10) || 1;
    if (q > 1) {
      qtyInput.value = --q;
      selectedBet.quantity = q;
      updateBetTotal();
    }
  });

  stepPlusBtn.addEventListener('click', () => {
    let q = parseInt(qtyInput.value, 10) || 1;
    qtyInput.value = ++q;
    selectedBet.quantity = q;
    updateBetTotal();
  });

  qtyInput.addEventListener('input', () => {
    let q = parseInt(qtyInput.value, 10);
    if (isNaN(q) || q < 1) q = 1;
    selectedBet.quantity = q;
    updateBetTotal();
  });

  // Close Sheet
  cancelBetBtn.addEventListener('click', () => {
    betModalBackdrop.classList.remove('active');
  });

  betModalBackdrop.addEventListener('click', (e) => {
    if (e.target === betModalBackdrop) {
      betModalBackdrop.classList.remove('active');
    }
  });

  // Confirm Bet Submit
  confirmBetBtn.addEventListener('click', async () => {
    const totalAmount = selectedBet.baseAmount * selectedBet.quantity * selectedBet.multiplier;

    if (totalAmount > userBalance) {
      showToast('❌ Insufficient balance! Please recharge.');
      return;
    }

    try {
      const res = await fetch('/api/game/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: currentMode,
          type: selectedBet.type,
          selection: selectedBet.val,
          amount: totalAmount,
          userId
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast('✅ Bet placed successfully!');
        userBalance = data.newBalance;
        userBalanceDisplay.textContent = formatMoney(userBalance);
        betModalBackdrop.classList.remove('active');
        fetchMyBets();
      } else {
        showToast(`⚠️ ${data.message}`);
      }
    } catch (e) {
      showToast('❌ Network error placing bet');
    }
  });

  // Game Mode Buttons (1Min, 3Min, 5Min, 10Min)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.getAttribute('data-mode');
      fetchGameState();
      fetchMyBets();
    });
  });

  // Results Tabs (Game History / Chart / My History)
  document.querySelectorAll('.res-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = tab.getAttribute('data-tab');
      if (targetPane === 'gameHistory') document.getElementById('paneGameHistory').classList.add('active');
      else if (targetPane === 'chart') document.getElementById('paneChart').classList.add('active');
      else if (targetPane === 'myHistory') {
        document.getElementById('paneMyHistory').classList.add('active');
        fetchMyBets();
      }
    });
  });

  // Demo Recharge Modal
  let selectedRechargeAmt = 500;
  if (rechargeModalBtn) {
    rechargeModalBtn.addEventListener('click', () => {
      rechargeModalBackdrop.classList.add('active');
    });
  }

  if (closeRechargeBtn) {
    closeRechargeBtn.addEventListener('click', () => {
      rechargeModalBackdrop.classList.remove('active');
    });
  }

  document.querySelectorAll('.rec-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.rec-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedRechargeAmt = parseInt(chip.getAttribute('data-amt'), 10);
      confirmRechargeBtn.textContent = `Add ₹${formatMoney(selectedRechargeAmt)} to Wallet`;
    });
  });

  if (confirmRechargeBtn) {
    confirmRechargeBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/wallet/recharge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount: selectedRechargeAmt })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`⚡ Added ₹${selectedRechargeAmt} to balance!`);
          userBalance = data.balance;
          userBalanceDisplay.textContent = formatMoney(userBalance);
          rechargeModalBackdrop.classList.remove('active');
        }
      } catch (e) {
        showToast('❌ Recharge failed');
      }
    });
  }

  // Refresh balance button
  if (refreshBalanceBtn) {
    refreshBalanceBtn.addEventListener('click', () => {
      fetchGameState();
      showToast('🔄 Balance refreshed');
    });
  }

  // Rules Popup
  const rulesBtn = document.getElementById('rulesBtn');
  if (rulesBtn) {
    rulesBtn.addEventListener('click', () => {
      alert(`OK WIN — Win Go Rules:\n\n1. Select Green, Violet, Red, Numbers (0-9), or Big/Small.\n2. Green: 1, 3, 7, 9 (1.96x). If 5: 1.5x.\n3. Red: 2, 4, 6, 8 (1.96x). If 0: 1.5x.\n4. Violet: 0 or 5 (4.5x).\n5. Number: 0-9 (9x).\n6. Big (5-9) / Small (0-4): 1.96x.\n7. Last 5 seconds are locked for draw calculation.`);
    });
  }

  // Realtime SSE Synchronization with Backend Source of Truth
  function initGameSSE() {
    try {
      const sse = new EventSource('/api/test/stream');
      sse.addEventListener('ROUND_SETTLED', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.mode === currentMode) {
            console.log('[OK WIN] Round settled instantly via backend SSE:', data);
            fetchGameState();
          }
        } catch (err) {}
      });
      sse.addEventListener('TEST_RESULT_INJECTED', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.mode === currentMode) {
            showToast(`⚡ Test target synced: #${data.number} ${data.color} ${data.size}`, 2200);
          }
        } catch (err) {}
      });
      sse.addEventListener('TEST_RESULT_RESET', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.mode === currentMode) {
            showToast(`🔄 Injected target reset to random`, 1500);
          }
        } catch (err) {}
      });
    } catch (e) {
      console.warn('SSE fallback:', e);
    }
  }

  // Init
  fetchGameState();
  fetchMyBets();
  startLocalTick();
  initGameSSE();

  // Periodic server sync every 8 seconds fallback
  syncInterval = setInterval(fetchGameState, 8000);

})();
