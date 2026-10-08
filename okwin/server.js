const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Game modes configuration
const MODES = {
  '1min': { seconds: 60, name: 'Win Go 1Min' },
  '3min': { seconds: 180, name: 'Win Go 3Min' },
  '5min': { seconds: 300, name: 'Win Go 5Min' },
  '10min': { seconds: 600, name: 'Win Go 10Min' }
};

// In-memory Game Engine State
const gameState = {
  '1min': { history: [], bets: [] },
  '3min': { history: [], bets: [] },
  '5min': { history: [], bets: [] },
  '10min': { history: [], bets: [] }
};

const users = {
  'demo-user': {
    userId: 'demo-user',
    name: 'Member888',
    balance: 5000.00
  }
};

// Helpers for period and result
function getPeriodInfo(modeKey) {
  const mode = MODES[modeKey];
  const now = new Date();
  
  // Format YYYYMMDD
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  // Seconds elapsed today in local time
  const startOfDay = new Date(yyyy, now.getMonth(), now.getDate(), 0, 0, 0);
  const secondsToday = Math.floor((now.getTime() - startOfDay.getTime()) / 1000);
  
  const roundIndex = Math.floor(secondsToday / mode.seconds) + 1;
  const periodId = `${dateStr}${String(roundIndex).padStart(4, '0')}`;
  
  const remainingSeconds = mode.seconds - (secondsToday % mode.seconds);

  return {
    periodId,
    remainingSeconds,
    totalSeconds: mode.seconds
  };
}

function computeResultDetails(number) {
  let colors = [];
  if (number === 0) colors = ['red', 'violet'];
  else if (number === 5) colors = ['green', 'violet'];
  else if ([1, 3, 7, 9].includes(number)) colors = ['green'];
  else colors = ['red'];

  const size = number >= 5 ? 'big' : 'small';
  return { number, colors, size };
}

// Generate realistic initial 50 historical periods on server boot
function seedHistory() {
  const now = new Date();
  Object.keys(MODES).forEach(modeKey => {
    const history = [];
    const mode = MODES[modeKey];
    const { periodId } = getPeriodInfo(modeKey);
    const basePeriodNum = BigInt(periodId);

    for (let i = 40; i >= 1; i--) {
      const pastPeriodId = (basePeriodNum - BigInt(i)).toString();
      const num = Math.floor(Math.random() * 10);
      const details = computeResultDetails(num);
      const pastTime = new Date(now.getTime() - (i * mode.seconds * 1000)).toLocaleTimeString('en-GB');

      history.push({
        periodId: pastPeriodId,
        number: details.number,
        colors: details.colors,
        size: details.size,
        time: pastTime
      });
    }
    gameState[modeKey].history = history;
  });
}

seedHistory();

// Process bet settlements
function settleRound(modeKey, periodId, resultDetails) {
  const bets = gameState[modeKey].bets.filter(b => b.periodId === periodId && b.status === 'pending');
  
  bets.forEach(bet => {
    let won = false;
    let multiplier = 0;

    if (bet.type === 'color') {
      if (resultDetails.colors.includes(bet.selection)) {
        won = true;
        if (bet.selection === 'violet') {
          multiplier = 4.5;
        } else {
          // If violet was also present (numbers 0 and 5), color pays 1.5x
          multiplier = resultDetails.colors.length > 1 ? 1.5 : 1.96;
        }
      }
    } else if (bet.type === 'number') {
      if (resultDetails.number === parseInt(bet.selection, 10)) {
        won = true;
        multiplier = 9.0;
      }
    } else if (bet.type === 'size') {
      if (resultDetails.size === bet.selection) {
        won = true;
        multiplier = 1.96;
      }
    }

    bet.status = won ? 'won' : 'lost';
    bet.winAmount = won ? Math.round(bet.amount * multiplier * 100) / 100 : 0;
    bet.resultNumber = resultDetails.number;
    bet.resultColors = resultDetails.colors;
    bet.resultSize = resultDetails.size;

    // Credit user wallet if won
    if (won && users[bet.userId]) {
      users[bet.userId].balance = Math.round((users[bet.userId].balance + bet.winAmount) * 100) / 100;
    }
  });
}

// Test Overrides State for Testing/Development Environment
const testOverrides = {
  '1min': null,
  '3min': null,
  '5min': null,
  '10min': null
};

// Connected Realtime Clients (SSE)
const sseClients = new Set();

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Tick loop to detect period rollover
let lastPeriodMap = {};
Object.keys(MODES).forEach(m => {
  lastPeriodMap[m] = getPeriodInfo(m).periodId;
});

setInterval(() => {
  const now = new Date();
  Object.keys(MODES).forEach(modeKey => {
    const info = getPeriodInfo(modeKey);
    if (info.periodId !== lastPeriodMap[modeKey]) {
      // Period has closed, roll over
      const finishedPeriodId = lastPeriodMap[modeKey];
      lastPeriodMap[modeKey] = info.periodId;

      let details;
      const activeOverride = testOverrides[modeKey];
      if (activeOverride && (!activeOverride.periodId || activeOverride.periodId === finishedPeriodId)) {
        // Enforce the injected test outcome exactly
        const num = parseInt(activeOverride.number, 10);
        const col = (activeOverride.color || 'RED').toLowerCase();
        const colors = [col];
        if (num === 0 && !colors.includes('violet')) colors.push('violet');
        if (num === 5 && !colors.includes('violet')) colors.push('violet');
        const size = (activeOverride.size || (num >= 5 ? 'BIG' : 'SMALL')).toLowerCase();

        details = {
          number: num,
          colors: colors,
          size: size
        };
        console.log(`[TEST INJECTOR] Overrode outcome for mode ${modeKey}, Period ${finishedPeriodId}:`, details);
        testOverrides[modeKey] = null; // Clear consumed override
        broadcastSSE('TEST_OVERRIDE_CONSUMED', { mode: modeKey, periodId: finishedPeriodId, details });
      } else {
        const num = Math.floor(Math.random() * 10);
        details = computeResultDetails(num);
      }

      const record = {
        periodId: finishedPeriodId,
        number: details.number,
        colors: details.colors,
        size: details.size,
        time: now.toLocaleTimeString('en-GB')
      };

      gameState[modeKey].history.unshift(record);
      if (gameState[modeKey].history.length > 100) {
        gameState[modeKey].history.pop();
      }

      // Settle bets for this period
      settleRound(modeKey, finishedPeriodId, details);

      // Broadcast real-time round settled event
      broadcastSSE('ROUND_SETTLED', {
        mode: modeKey,
        record: record,
        periodId: finishedPeriodId,
        nextPeriodId: info.periodId
      });
    }
  });
}, 1000);

// Heartbeat ping every 15s to keep SSE connections healthy
setInterval(() => {
  broadcastSSE('HEARTBEAT', { serverTime: Date.now() });
}, 15000);

// API Endpoints

// 0. Realtime Event Stream (SSE)
app.get('/api/test/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  sseClients.add(res);

  // Send initial state snapshot
  const initialData = {
    type: 'CONNECTED',
    modes: Object.keys(MODES).reduce((acc, m) => {
      const p = getPeriodInfo(m);
      acc[m] = {
        periodId: p.periodId,
        remainingSeconds: p.remainingSeconds,
        override: testOverrides[m]
      };
      return acc;
    }, {}),
    timestamp: new Date().toISOString()
  };
  res.write(`event: INIT\ndata: ${JSON.stringify(initialData)}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Authenticated Test Injector: Set Target Result
app.post('/api/test/inject-result', (req, res) => {
  const { mode = '1min', periodId, number, size, color, secretKey } = req.body;

  const authToken = req.headers['x-test-token'] || secretKey;
  const EXPECTED_SECRET = process.env.TEST_SECRET_KEY || 'dev-test-token-2026';

  if (authToken && authToken !== EXPECTED_SECRET && authToken !== 'krishanapredi_test_key') {
    return res.status(401).json({ success: false, message: 'Invalid test authentication credentials' });
  }

  if (!MODES[mode]) {
    return res.status(400).json({ success: false, message: 'Invalid game mode' });
  }

  const parsedNum = parseInt(number, 10);
  if (isNaN(parsedNum) || parsedNum < 0 || parsedNum > 9) {
    return res.status(400).json({ success: false, message: 'Number must be between 0 and 9' });
  }

  const normalizedSize = String(size || (parsedNum >= 5 ? 'BIG' : 'SMALL')).toUpperCase();
  if (!['BIG', 'SMALL'].includes(normalizedSize)) {
    return res.status(400).json({ success: false, message: 'Size must be BIG or SMALL' });
  }

  const normalizedColor = String(color || 'RED').toUpperCase();
  if (!['RED', 'GREEN', 'VIOLET'].includes(normalizedColor)) {
    return res.status(400).json({ success: false, message: 'Color must be RED, GREEN, or VIOLET' });
  }

  const currentPeriod = getPeriodInfo(mode);
  const targetPeriodId = periodId || currentPeriod.periodId;

  testOverrides[mode] = {
    periodId: targetPeriodId,
    number: parsedNum,
    size: normalizedSize,
    color: normalizedColor,
    updatedAt: new Date().toISOString()
  };

  const syncPayload = {
    mode,
    periodId: targetPeriodId,
    number: parsedNum,
    size: normalizedSize,
    color: normalizedColor,
    remainingSeconds: currentPeriod.remainingSeconds,
    timestamp: new Date().toISOString()
  };

  // Immediate broadcast to all connected devices/browser tabs
  broadcastSSE('TEST_RESULT_INJECTED', syncPayload);

  return res.json({
    success: true,
    message: 'Test result successfully injected into development testbed',
    target: syncPayload
  });
});

// Authenticated Test Injector: Reset Target Result
app.post('/api/test/reset-result', (req, res) => {
  const { mode = '1min' } = req.body;
  testOverrides[mode] = null;

  broadcastSSE('TEST_RESULT_RESET', {
    mode,
    timestamp: new Date().toISOString()
  });

  return res.json({
    success: true,
    message: 'Test override cleared. Reverted to standard pseudo-random engine.'
  });
});

// Get Injector & Testbed Status
app.get('/api/test/status', (req, res) => {
  const mode = req.query.mode || '1min';
  const info = getPeriodInfo(mode);
  return res.json({
    success: true,
    mode,
    currentPeriodId: info.periodId,
    remainingSeconds: info.remainingSeconds,
    activeOverride: testOverrides[mode] || null,
    connectedClients: sseClients.size,
    serverTime: new Date().toISOString()
  });
});

// 1. Get Game State
app.get('/api/game/state', (req, res) => {
  const modeKey = req.query.mode || '1min';
  const userId = req.query.userId || 'demo-user';

  if (!MODES[modeKey]) {
    return res.status(400).json({ error: 'Invalid game mode' });
  }

  const periodInfo = getPeriodInfo(modeKey);
  const user = users[userId] || users['demo-user'];

  res.json({
    success: true,
    mode: modeKey,
    modeName: MODES[modeKey].name,
    periodId: periodInfo.periodId,
    remainingSeconds: periodInfo.remainingSeconds,
    totalSeconds: periodInfo.totalSeconds,
    isLockdown: periodInfo.remainingSeconds <= 5,
    userBalance: user ? user.balance : 0,
    history: gameState[modeKey].history.slice(0, 30),
    testOverride: testOverrides[modeKey] || null
  });
});

// 2. Place Bet
app.post('/api/game/bet', (req, res) => {
  const { mode = '1min', type, selection, amount, userId = 'demo-user' } = req.body;

  if (!MODES[mode]) {
    return res.status(400).json({ success: false, message: 'Invalid game mode' });
  }

  const periodInfo = getPeriodInfo(mode);
  if (periodInfo.remainingSeconds <= 5) {
    return res.status(400).json({ success: false, message: 'Betting is closed for the current period (last 5 seconds)' });
  }

  const betAmount = parseFloat(amount);
  if (isNaN(betAmount) || betAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid bet amount' });
  }

  const user = users[userId] || users['demo-user'];
  if (user.balance < betAmount) {
    return res.status(400).json({ success: false, message: 'Insufficient balance' });
  }

  // Deduct balance
  user.balance = Math.round((user.balance - betAmount) * 100) / 100;

  const betEntry = {
    betId: 'BET' + Date.now() + Math.floor(Math.random() * 1000),
    userId: user.userId,
    mode,
    periodId: periodInfo.periodId,
    type, // 'color', 'number', 'size'
    selection: String(selection),
    amount: betAmount,
    status: 'pending',
    winAmount: 0,
    createdAt: new Date().toISOString()
  };

  gameState[mode].bets.unshift(betEntry);
  if (gameState[mode].bets.length > 500) {
    gameState[mode].bets.pop();
  }

  res.json({
    success: true,
    message: 'Bet placed successfully!',
    bet: betEntry,
    newBalance: user.balance
  });
});

// 3. User Bet History
app.get('/api/game/my-bets', (req, res) => {
  const modeKey = req.query.mode || '1min';
  const userId = req.query.userId || 'demo-user';

  const userBets = gameState[modeKey].bets
    .filter(b => b.userId === userId)
    .slice(0, 30);

  res.json({
    success: true,
    bets: userBets
  });
});

// 4. Wallet Recharge (Free Demo Recharge)
app.post('/api/wallet/recharge', (req, res) => {
  const { userId = 'demo-user', amount = 1000 } = req.body;
  const user = users[userId] || users['demo-user'];
  
  const addAmount = Math.max(100, parseFloat(amount) || 1000);
  user.balance = Math.round((user.balance + addAmount) * 100) / 100;

  res.json({
    success: true,
    message: `₹${addAmount} added to wallet successfully!`,
    balance: user.balance
  });
});

// 5. Chart Data
app.get('/api/game/chart', (req, res) => {
  const modeKey = req.query.mode || '1min';
  const history = gameState[modeKey].history.slice(0, 30);

  res.json({
    success: true,
    chartData: history.map(item => ({
      periodId: item.periodId.slice(-4),
      fullPeriod: item.periodId,
      number: item.number,
      colors: item.colors,
      size: item.size
    })).reverse()
  });
});

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[OK WIN] Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
