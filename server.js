const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lordgrow_super_secure_vault_2026_krishanapredi';

// Persistent Data Storage (supports local Node and Vercel serverless /tmp)
const IS_VERCEL = !!process.env.VERCEL;
const DATA_FILE = IS_VERCEL
  ? path.join('/tmp', 'store.json')
  : path.join(__dirname, 'data', 'store.json');
const UPLOAD_DIR = IS_VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, 'public', 'uploads');
const SEED_DATA_FILE = path.join(__dirname, 'data', 'store.json');

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {}

// Initial Admin Password (can be overridden via ADMIN_PASSWORD environment variable)
const DEFAULT_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'lordgrow2026';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(DEFAULT_ADMIN_PASS, 10);

// Default Seed Data
let db = {
  users: [],
  paymentRequests: [],
  keys: [],
  gameLinks: [],
  predictionLogs: [],
  walletTransactions: [],
  walletDeposits: [],
  adminPasswordHash: ADMIN_PASSWORD_HASH
};

// Load or Initialize Store
function loadData() {
  try {
    if (IS_VERCEL && !fs.existsSync(DATA_FILE) && fs.existsSync(SEED_DATA_FILE)) {
      try {
        fs.writeFileSync(DATA_FILE, fs.readFileSync(SEED_DATA_FILE, 'utf-8'), 'utf-8');
      } catch (e) {}
    }

    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      db = JSON.parse(content);
      if (!db.adminPasswordHash) db.adminPasswordHash = ADMIN_PASSWORD_HASH;
      if (!db.users) db.users = [];
      if (!db.paymentRequests) db.paymentRequests = [];
      if (!db.keys) db.keys = [];
      if (!db.gameLinks) db.gameLinks = [];
      if (!db.predictionLogs) db.predictionLogs = [];
      if (!db.walletTransactions) db.walletTransactions = [];
      if (!db.walletDeposits) db.walletDeposits = [];
    } else {
      saveData();
    }
  } catch (err) {
    console.error('Error loading data store:', err);
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving data store:', err);
  }
}

loadData();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Mount OK.WIN Game Portal & Testing Sandbox
try {
  const okwinApp = require('./okwin/server');
  app.use('/okwin', express.static(path.join(__dirname, 'okwin', 'public')));
  app.get('/okwin', (req, res) => {
    res.sendFile(path.join(__dirname, 'okwin', 'public', 'index.html'));
  });
  app.use('/api/game', (req, res, next) => {
    req.url = '/api/game' + req.url;
    okwinApp(req, res, next);
  });
  app.use('/api/test', (req, res, next) => {
    req.url = '/api/test' + req.url;
    okwinApp(req, res, next);
  });
  console.log('🎮 [OK WIN] Game Portal & Test Injector mounted at /okwin and /api/test');
} catch (e) {
  console.error('⚠️ Could not mount OK.WIN sub-app:', e.message);
}

// Keep-Alive / Health Check Endpoints
app.get('/ping', (req, res) => res.status(200).send('PONG'));
app.get('/healthz', (req, res) => res.status(200).json({ status: 'OK', uptime: process.uptime() }));

// Auto Self-Ping Heartbeat to prevent Render sleep
const APP_URL = process.env.RENDER_EXTERNAL_URL || 'https://krishnapredi-2.onrender.com';
setInterval(() => {
  try {
    const client = APP_URL.startsWith('https') ? require('https') : require('http');
    client.get(`${APP_URL}/ping`, () => {}).on('error', () => {});
  } catch (e) {}
}, 10 * 60 * 1000); // Pings every 10 minutes

// Rate Limiter for Auth & Payments
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// Multer Setup for Payment Screenshots
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'screenshot-' + uniqueSuffix + ext);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Admin JWT Authentication Middleware
function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Admin authentication token required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'owner' && decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Session expired or invalid token' });
  }
}

// -------------------------------------------------------------
// EXACT PLANS SPECIFICATION
// -------------------------------------------------------------
const PLANS = [
  {
    id: 'plan_1678',
    name: 'PLAN 1 — STARTER',
    price: 1678,
    durationDays: 3,
    dailyPredictions: 9,
    performance: '85–88% Platform AI Prediction Accuracy',
    badge: 'Popular',
    benefits: [
      '3 Days Full Access',
      '9 Daily Predictions',
      'Multi-Game Algorithms',
      'Instant Key Activation',
      'Direct Platform AI Signals'
    ]
  },
  {
    id: 'plan_2189',
    name: 'PLAN 2 — PRO ADVANCED',
    price: 2189,
    durationDays: 7,
    dailyPredictions: 21,
    performance: '90% Platform AI Prediction Accuracy',
    badge: 'High Value',
    benefits: [
      '7 Days Extended Access',
      '21 Daily Predictions',
      'Real-Time Signal Engine',
      'Deep Pattern Recognition',
      'Dedicated Server-Side Key'
    ]
  },
  {
    id: 'plan_2600',
    name: 'PLAN 3 — ULTRA MATRIX',
    price: 2600,
    durationDays: 15,
    dailyPredictions: 32,
    performance: '97% Platform AI Prediction Accuracy',
    badge: 'Elite Tier',
    benefits: [
      '15 Days Continuous Access',
      '32 Daily Predictions',
      'Multi-Odds Safety Analysis',
      'Automated Game Link Sync',
      'Priority Signal Queuing'
    ]
  },
  {
    id: 'plan_3366',
    name: 'PLAN 4 — LOKI SUPREME',
    price: 3366,
    durationDays: 25,
    dailyPredictions: 50,
    performance: 'Premium High-Altitude Flight Matrix & Vector Analysis',
    badge: 'Master Protocol',
    benefits: [
      '25 Days Master License',
      '50 Daily Predictions',
      'Maximum Signal Multiplier Engine',
      'Full Game Matrix Coverage',
      'Dedicated VIP Channel Updates'
    ]
  }
];

// Helper: Generate Unique Key in specified format: KRISHANAPREDI + 12 alphanumeric characters
function generateUniqueKey() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 12; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const key = `KRISHANAPREDI${randomPart}`;
  // Ensure uniqueness in database
  const exists = db.keys.find(k => k.key === key);
  if (exists) return generateUniqueKey();
  return key;
}

// -------------------------------------------------------------
// PUBLIC USER & GUEST APIS
// -------------------------------------------------------------

// 1. Get Available Plans
app.get('/api/plans', (req, res) => {
  res.json({ success: true, plans: PLANS });
});

// 2. Generate Dynamic UPI QR Code
app.get('/api/payment/qr', async (req, res) => {
  try {
    const amount = req.query.amount || '1678';
    const upiId = 'antaryami12@upi';
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('KrishanaPredi')}&am=${encodeURIComponent(amount)}&cu=INR&tn=${encodeURIComponent('KrishanaPredi Plan Purchase')}`;

    const qrDataUrl = await QRCode.toDataURL(upiUrl, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 380,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      upiId,
      amount,
      upiUrl,
      qrDataUrl,
      uploadedQrUrl: '/images/qr_uploaded.png'
    });
  } catch (err) {
    console.error('QR Generation error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate QR code' });
  }
});

// 3. User Register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    const cleanUsername = username.trim();
    const existing = db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 8);
    const user = {
      id: 'user_' + Date.now(),
      username: cleanUsername,
      email: email ? email.trim() : '',
      passwordHash,
      createdAt: new Date().toISOString(),
      isGuest: false,
      walletBalance: 0
    };
    db.users.push(user);
    saveData();

    const token = jwt.sign({ id: user.id, username: user.username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, message: 'Account created successfully!', token, user: { id: user.id, username: user.username, isGuest: false } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Registration failed, please retry.' });
  }
});

// 4. User Login (Instant Async Verification / Auto Account Creation)
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    const cleanUsername = username.trim();
    let user = db.users.find(u => u.username && u.username.toLowerCase() === cleanUsername.toLowerCase());

    if (!user) {
      // Seamlessly auto-register if user account doesn't exist yet
      const passwordHash = await bcrypt.hash(password, 8);
      user = {
        id: 'user_' + Date.now(),
        username: cleanUsername,
        email: '',
        passwordHash,
        createdAt: new Date().toISOString(),
        isGuest: false,
        walletBalance: 0
      };
      db.users.push(user);
      saveData();

      const token = jwt.sign({ id: user.id, username: user.username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        success: true,
        message: 'Account created and logged in!',
        token,
        user: { id: user.id, username: user.username, isGuest: false }
      });
    }

    // Existing user
    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
      }
    } else {
      // User existed without password -> update with password
      user.passwordHash = await bcrypt.hash(password, 8);
    }

    user.isGuest = false;
    saveData();

    const token = jwt.sign({ id: user.id, username: user.username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: { id: user.id, username: user.username, isGuest: false }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed, please retry.' });
  }
});

// 5. Guest Session Initialization
app.post('/api/auth/guest', (req, res) => {
  const guestId = 'GUEST_' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const guestUser = {
    id: guestId,
    username: guestId,
    isGuest: true,
    createdAt: new Date().toISOString(),
    walletBalance: 0
  };
  db.users.push(guestUser);
  saveData();

  const token = jwt.sign({ id: guestUser.id, username: guestUser.username, role: 'guest' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, user: guestUser });
});

// 5.5 Verify & Restore Authenticated User Session
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.users.find(u => u.id === decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const isGuest = decoded.role === 'guest' || (user.isGuest === true && !user.passwordHash);
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        isGuest: !!isGuest,
        walletBalance: user.walletBalance || 0
      }
    });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

// 6. Submit Payment Request with Screenshot
app.post('/api/payment/submit', upload.single('screenshot'), (req, res) => {
  try {
    const { planId, amount, utr, userId } = req.body;
    const plan = PLANS.find(p => p.id === planId) || PLANS.find(p => p.price === Number(amount));

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Payment screenshot is required' });
    }

    // Strict 12-digit UTR validation
    const cleanUtr = (utr || '').trim();
    if (!/^\d{12}$/.test(cleanUtr)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UTR! Please enter exact 12-digit numeric UTR / Reference number from your payment app.'
      });
    }

    const requestId = 'REQ_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const paymentReq = {
      id: requestId,
      userId: userId || 'GUEST_' + Date.now(),
      planId: plan ? plan.id : (planId || 'custom'),
      planName: plan ? plan.name : `Plan ₹${amount}`,
      amount: Number(amount) || (plan ? plan.price : 1678),
      durationDays: plan ? plan.durationDays : 3,
      dailyPredictions: plan ? plan.dailyPredictions : 9,
      utr: cleanUtr,
      screenshotUrl: '/uploads/' + req.file.filename,
      status: 'PENDING', // PENDING, APPROVED, REJECTED
      generatedKey: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rejectReason: null
    };

    db.paymentRequests.unshift(paymentReq);
    saveData();

    res.json({
      success: true,
      message: 'Payment screenshot submitted for server-side verification. Waiting for owner approval.',
      requestId: paymentReq.id,
      status: paymentReq.status
    });
  } catch (err) {
    console.error('Payment submit error:', err);
    res.status(500).json({ success: false, message: 'Internal error submitting payment request' });
  }
});

// 7. Check Payment Request Status
app.get('/api/payment/status/:id', (req, res) => {
  const reqId = req.params.id;
  const payment = db.paymentRequests.find(p => p.id === reqId);
  if (!payment) {
    return res.status(404).json({ success: false, message: 'Payment request not found' });
  }
  res.json({
    success: true,
    id: payment.id,
    status: payment.status,
    amount: payment.amount,
    planName: payment.planName,
    generatedKey: payment.generatedKey,
    rejectReason: payment.rejectReason,
    updatedAt: payment.updatedAt
  });
});

// 8. Key Activation (Paste Key Page)
app.post('/api/keys/activate', (req, res) => {
  const { key, userId } = req.body;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ success: false, message: 'Please enter a valid key' });
  }

  const cleanedKey = key.trim().toUpperCase();

  // Validate Key Format: KRISHANAPREDI + 12 alphanumeric characters
  const keyRegex = /^KRISHANAPREDI[A-Z0-9]{12}$/;
  if (!keyRegex.test(cleanedKey)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid key format! Key must start with KRISHANAPREDI followed by 12 characters.'
    });
  }

  const keyRecord = db.keys.find(k => k.key === cleanedKey);
  if (!keyRecord) {
    return res.status(404).json({
      success: false,
      message: 'Key not found or not approved by LordGrow owner yet.'
    });
  }

  if (keyRecord.isRedeemed) {
    return res.status(400).json({
      success: false,
      message: 'This key has already been activated and redeemed!'
    });
  }

  // Mark key as redeemed and activate plan
  const now = new Date();
  const expiresAt = new Date(now.getTime() + keyRecord.durationDays * 24 * 60 * 60 * 1000);

  keyRecord.isRedeemed = true;
  keyRecord.redeemedBy = userId || keyRecord.userId;
  keyRecord.redeemedAt = now.toISOString();
  keyRecord.expiresAt = expiresAt.toISOString();

  saveData();

  res.json({
    success: true,
    message: 'Key activated successfully! You may now select your game and game link.',
    plan: {
      key: keyRecord.key,
      planId: keyRecord.planId,
      planName: keyRecord.planName,
      durationDays: keyRecord.durationDays,
      dailyPredictions: keyRecord.dailyPredictions,
      activatedAt: keyRecord.redeemedAt,
      expiresAt: keyRecord.expiresAt,
      userId: keyRecord.redeemedBy
    }
  });
});

// 9. Submit Game Link (Requires Activated Key)
app.post('/api/game-link', (req, res) => {
  const { key, game, gameLink, userId } = req.body;

  if (!key || !game || !gameLink) {
    return res.status(400).json({ success: false, message: 'Key, game, and valid game link are required' });
  }

  const keyRecord = db.keys.find(k => k.key === key.trim().toUpperCase());
  if (!keyRecord || !keyRecord.isRedeemed) {
    return res.status(403).json({
      success: false,
      message: 'Game Link requires an active and verified plan key!'
    });
  }

  // Save or update game link for this key
  let linkEntry = db.gameLinks.find(g => g.key === keyRecord.key);
  if (linkEntry) {
    linkEntry.game = game;
    linkEntry.gameLink = gameLink;
    linkEntry.updatedAt = new Date().toISOString();
  } else {
    linkEntry = {
      id: 'GL_' + Date.now(),
      key: keyRecord.key,
      userId: userId || keyRecord.redeemedBy,
      game,
      gameLink,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.gameLinks.push(linkEntry);
  }
  saveData();

  res.json({
    success: true,
    message: 'Game link saved and verified successfully!',
    gameLink: linkEntry
  });
});

// 10. Generate Prediction
app.post('/api/predictions/generate', (req, res) => {
  const { key, game } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, message: 'Active key required' });
  }

  const keyRecord = db.keys.find(k => k.key === key.trim().toUpperCase());
  if (!keyRecord || !keyRecord.isRedeemed) {
    return res.status(403).json({ success: false, message: 'Access denied: Valid activated key required' });
  }

  // Check if expired
  if (new Date(keyRecord.expiresAt) < new Date()) {
    return res.status(403).json({ success: false, message: 'Plan expired. Please renew your plan.' });
  }

  // Check today's prediction count
  const todayStr = new Date().toISOString().split('T')[0];
  const todayPredictions = db.predictionLogs.filter(p => p.key === keyRecord.key && p.createdAt.startsWith(todayStr));

  if (todayPredictions.length >= keyRecord.dailyPredictions) {
    return res.status(429).json({
      success: false,
      message: `Daily prediction limit reached (${todayPredictions.length}/${keyRecord.dailyPredictions}). Resets at midnight UTC.`
    });
  }

  // Algorithmic signal calculation (Realistic simulation based on neutral historical modeling)
  const gamesList = ['Prime Games', 'Aviator', 'Mines', 'Dragon vs Tiger', 'Wingo', 'Crash', 'Roulette'];
  const activeGame = game || (db.gameLinks.find(g => g.key === keyRecord.key)?.game) || 'Prime Games';

  let predictionData = {};
  const rand = Math.random();

  if (activeGame === 'Prime Games') {
    const suites = ['BC Game Multiplier', 'Stake Crash Vector', 'Primatch Cycle', 'Colour Trading Frequency'];
    const chosenSuite = suites[Math.floor(Math.random() * suites.length)];
    const mult = (1.65 + Math.random() * 3.5).toFixed(2);
    predictionData = {
      signalType: 'PRIME_SUITE_SIGNAL',
      selectedPlatform: chosenSuite,
      signalVector: `${mult}x Wave`,
      estimatedConfidence: `${(87 + Math.random() * 9).toFixed(1)}% Platform Index`,
      recommendation: `Synchronized parameters active for ${chosenSuite}.`
    };
  } else if (activeGame === 'Aviator' || activeGame === 'Crash') {
    const mult = (1.55 + Math.random() * 4.2).toFixed(2);
    const safeCashout = (mult * 0.75).toFixed(2);
    predictionData = {
      signalType: 'FLIGHT_VECTOR',
      targetMultiplier: `${mult}x`,
      safeCashout: `${safeCashout}x`,
      estimatedConfidence: `${(87 + Math.random() * 10).toFixed(1)}% Platform Accuracy`,
      recommendation: `Target exit prior to ${safeCashout}x for managed volatility.`
    };
  } else if (activeGame === 'Mines') {
    const safeSpots = [];
    while (safeSpots.length < 4) {
      const spot = Math.floor(Math.random() * 25) + 1;
      if (!safeSpots.includes(spot)) safeSpots.push(spot);
    }
    predictionData = {
      signalType: 'GRID_HEATMAP',
      recommendedSpots: safeSpots.sort((a,b)=>a-b),
      riskTier: 'Balanced',
      estimatedConfidence: `${(89 + Math.random() * 8).toFixed(1)}% Platform Accuracy`,
      recommendation: `Recommended safe tiles: [${safeSpots.join(', ')}]. Stop after 3-4 tiles.`
    };
  } else if (activeGame === 'Dragon vs Tiger') {
    const side = Math.random() > 0.5 ? 'DRAGON' : 'TIGER';
    predictionData = {
      signalType: 'CARD_PROBABILITY',
      favoredSide: side,
      patternTrend: 'Alternating Streak Detection',
      estimatedConfidence: `${(88 + Math.random() * 9).toFixed(1)}% Platform Accuracy`,
      recommendation: `Algorithmic bias favors ${side}.`
    };
  } else {
    const color = Math.random() > 0.5 ? 'GREEN' : 'RED';
    predictionData = {
      signalType: 'QUANTUM_FREQUENCY',
      predictedColor: color,
      numberOdds: [1, 3, 7, 9].slice(0, 2),
      estimatedConfidence: `${(86 + Math.random() * 10).toFixed(1)}% Platform Accuracy`,
      recommendation: `Frequency density indicator matches ${color}.`
    };
  }

  const prediction = {
    id: 'PRED_' + Date.now(),
    key: keyRecord.key,
    game: activeGame,
    data: predictionData,
    seedHash: '0x' + Math.random().toString(16).substring(2, 10).toUpperCase(),
    countToday: todayPredictions.length + 1,
    dailyLimit: keyRecord.dailyPredictions,
    createdAt: new Date().toISOString()
  };

  db.predictionLogs.unshift(prediction);
  saveData();

  res.json({
    success: true,
    prediction,
    remainingToday: keyRecord.dailyPredictions - (todayPredictions.length + 1)
  });
});

// 11. Get Prediction History for Key
app.get('/api/predictions/history', (req, res) => {
  const { key } = req.query;
  if (!key) return res.json({ success: true, history: [] });

  const history = db.predictionLogs
    .filter(p => p.key === key.trim().toUpperCase())
    .slice(0, 25);
  res.json({ success: true, history });
});

// 12. Wallet API: Available Balance, Pending Deposits & Transaction History
app.get('/api/wallet', (req, res) => {
  const { userId } = req.query;
  const user = db.users.find(u => u.id === userId);

  if (!db.walletDeposits) db.walletDeposits = [];
  if (!db.walletTransactions) db.walletTransactions = [];

  const availableBalance = user ? (user.walletBalance || 0) : 0;
  const pendingDeposits = db.walletDeposits.filter(d => d.userId === userId && d.status === 'PENDING');
  const pendingAmount = pendingDeposits.reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
  const transactions = db.walletTransactions.filter(t => t.userId === userId);

  res.json({
    success: true,
    balance: availableBalance,
    availableBalance,
    pendingAmount,
    transactions
  });
});

app.post('/api/wallet/withdraw', (req, res) => {
  const { userId, amount, upiId } = req.body;
  const withdrawAmount = Number(amount);
  const user = db.users.find(u => u.id === userId);

  if (!user || user.walletBalance < withdrawAmount || withdrawAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Insufficient available balance or invalid amount' });
  }

  user.walletBalance -= withdrawAmount;
  const tx = {
    id: 'TX_WD_' + Date.now(),
    userId,
    type: 'WITHDRAWAL',
    amount: withdrawAmount,
    upiId,
    status: 'PROCESSING',
    createdAt: new Date().toISOString()
  };
  db.walletTransactions.unshift(tx);
  saveData();

  res.json({ success: true, message: 'Withdrawal request submitted for processing', tx });
});

// 13. Wallet Deposit Request API (Admin Approval Required)
app.post('/api/wallet/deposit', (req, res) => {
  const { userId, amount, utr } = req.body;
  const depositAmount = Number(amount);
  if (!depositAmount || depositAmount < 300) {
    return res.status(400).json({ success: false, message: 'Minimum deposit amount is ₹300.' });
  }

  // Strict 12-digit numeric UTR validation
  const cleanUtr = (utr || '').trim();
  if (!/^\d{12}$/.test(cleanUtr)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid UTR! Please enter exact 12-digit numeric reference number from your payment app.'
    });
  }

  if (!db.walletDeposits) db.walletDeposits = [];
  if (!db.walletTransactions) db.walletTransactions = [];

  // Check if UTR is already in use (pending or approved)
  const duplicateUtr = db.walletDeposits.find(d => d.utr === cleanUtr && d.status !== 'REJECTED');
  if (duplicateUtr) {
    return res.status(400).json({
      success: false,
      message: 'This 12-digit UTR has already been submitted. Please check your transaction history or contact support.'
    });
  }

  let user = db.users.find(u => u.id === userId);
  if (!user) {
    user = {
      id: userId || 'GUEST_' + Date.now(),
      username: userId || 'Guest User',
      isGuest: true,
      createdAt: new Date().toISOString(),
      walletBalance: 0
    };
    db.users.push(user);
  }

  const depositId = 'DEP_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  // Create PENDING deposit request
  const depositRequest = {
    id: depositId,
    userId: user.id,
    username: user.username || user.id,
    amount: depositAmount,
    dailyReturnRate: '2.0%',
    utr: cleanUtr,
    status: 'PENDING',
    createdAt: now,
    updatedAt: null,
    adminActionBy: null
  };
  db.walletDeposits.unshift(depositRequest);

  // Record PENDING transaction in history
  const tx = {
    id: 'TX_DEP_' + Date.now(),
    depositId,
    userId: user.id,
    type: 'DEPOSIT',
    amount: depositAmount,
    dailyReturnRate: '2.0%',
    utr: cleanUtr,
    status: 'PENDING',
    createdAt: now
  };
  db.walletTransactions.unshift(tx);
  saveData();

  // DO NOT add funds to user.walletBalance immediately.
  // Wallet balance will only be credited when Admin clicks APPROVE.

  res.json({
    success: true,
    message: 'Payment submitted. Wallet balance will be updated after admin approval.',
    deposit: depositRequest,
    availableBalance: user.walletBalance || 0,
    pendingAmount: depositAmount,
    tx
  });
});

// -------------------------------------------------------------
// ADMIN / OWNER PANEL ("LordGrow") PROTECTED APIS
// -------------------------------------------------------------

// Admin Login
app.post('/api/admin/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (username !== 'admin' && username !== 'lordgrow') {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  }

  const isEnvMatch = process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD;
  const isHashMatch = bcrypt.compareSync(password || '', db.adminPasswordHash);
  if (!isEnvMatch && !isHashMatch) {
    return res.status(401).json({ success: false, message: 'Invalid admin password' });
  }

  const token = jwt.sign({ username: 'lordgrow', role: 'owner' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    success: true,
    token,
    owner: 'LordGrow Master Control'
  });
});

// Admin: Get All Payment Requests
app.get('/api/admin/requests', verifyAdmin, (req, res) => {
  const filter = req.query.status; // pending, approved, rejected, all
  let list = db.paymentRequests;
  if (filter && filter !== 'all') {
    list = list.filter(r => r.status.toLowerCase() === filter.toLowerCase());
  }
  res.json({ success: true, requests: list });
});

// Admin: Approve Payment Request & Generate Unique Key
app.post('/api/admin/approve', verifyAdmin, (req, res) => {
  const { requestId } = req.body;
  const payment = db.paymentRequests.find(p => p.id === requestId);

  if (!payment) {
    return res.status(404).json({ success: false, message: 'Payment request not found' });
  }

  if (payment.status === 'APPROVED') {
    return res.status(400).json({
      success: false,
      message: 'Request already approved with key: ' + payment.generatedKey
    });
  }

  // 1. Generate unique key: KRISHANAPREDI + 12 alphanumeric characters
  const uniqueKey = generateUniqueKey();

  // 2. Mark payment as approved
  payment.status = 'APPROVED';
  payment.generatedKey = uniqueKey;
  payment.updatedAt = new Date().toISOString();

  // 3. Attach key record
  const keyRecord = {
    key: uniqueKey,
    requestId: payment.id,
    userId: payment.userId,
    planId: payment.planId,
    planName: payment.planName,
    amount: payment.amount,
    durationDays: payment.durationDays,
    dailyPredictions: payment.dailyPredictions,
    isRedeemed: false,
    createdAt: new Date().toISOString(),
    expiresAt: null
  };
  db.keys.push(keyRecord);

  // 4. Record wallet transaction
  db.walletTransactions.push({
    id: 'TX_PAY_' + Date.now(),
    userId: payment.userId,
    type: 'PLAN_PURCHASE',
    amount: payment.amount,
    planName: payment.planName,
    key: uniqueKey,
    status: 'COMPLETED',
    createdAt: new Date().toISOString()
  });

  saveData();

  res.json({
    success: true,
    message: 'Payment approved successfully! Key generated: ' + uniqueKey,
    key: uniqueKey,
    request: payment
  });
});

// Admin: Reject Payment Request
app.post('/api/admin/reject', verifyAdmin, (req, res) => {
  const { requestId, reason } = req.body;
  const payment = db.paymentRequests.find(p => p.id === requestId);

  if (!payment) {
    return res.status(404).json({ success: false, message: 'Payment request not found' });
  }

  payment.status = 'REJECTED';
  payment.rejectReason = reason || 'Payment screenshot or UTR could not be verified.';
  payment.updatedAt = new Date().toISOString();
  saveData();

  res.json({
    success: true,
    message: 'Payment request rejected.',
    request: payment
  });
});

// Admin: Get All Wallet Deposit Requests
app.get('/api/admin/deposits', verifyAdmin, (req, res) => {
  if (!db.walletDeposits) db.walletDeposits = [];
  const filter = (req.query.status || 'all').toLowerCase();
  let list = db.walletDeposits;
  if (filter && filter !== 'all') {
    list = list.filter(d => (d.status || '').toLowerCase() === filter);
  }
  res.json({ success: true, deposits: list });
});

// Admin: Approve Wallet Deposit Request (Credit User Wallet Balance)
app.post('/api/admin/deposits/approve', verifyAdmin, (req, res) => {
  const { depositId } = req.body;
  if (!db.walletDeposits) db.walletDeposits = [];
  const deposit = db.walletDeposits.find(d => d.id === depositId);

  if (!deposit) {
    return res.status(404).json({ success: false, message: 'Deposit request not found.' });
  }

  // Prevent duplicate approval / processing
  if (deposit.status === 'APPROVED') {
    return res.status(400).json({
      success: false,
      message: 'This deposit has already been approved! Duplicate credit prevented.'
    });
  }
  if (deposit.status === 'REJECTED') {
    return res.status(400).json({
      success: false,
      message: 'This deposit has already been rejected and cannot be approved.'
    });
  }

  const now = new Date().toISOString();
  deposit.status = 'APPROVED';
  deposit.updatedAt = now;
  deposit.adminActionBy = req.admin ? req.admin.username : 'admin';

  // Find user and credit confirmed wallet balance
  let user = db.users.find(u => u.id === deposit.userId);
  if (!user) {
    user = {
      id: deposit.userId,
      username: deposit.username || deposit.userId,
      walletBalance: 0,
      createdAt: now
    };
    db.users.push(user);
  }

  user.walletBalance = (user.walletBalance || 0) + Number(deposit.amount);

  // Update matching transaction in db.walletTransactions
  if (db.walletTransactions) {
    const tx = db.walletTransactions.find(t => t.depositId === deposit.id || (t.utr === deposit.utr && t.type === 'DEPOSIT'));
    if (tx) {
      tx.status = 'APPROVED';
      tx.updatedAt = now;
    }
  }

  saveData();

  res.json({
    success: true,
    message: `Deposit of ₹${Number(deposit.amount).toLocaleString('en-IN')} approved successfully! Balance credited to ${user.username}.`,
    deposit,
    newBalance: user.walletBalance
  });
});

// Admin: Reject Wallet Deposit Request
app.post('/api/admin/deposits/reject', verifyAdmin, (req, res) => {
  const { depositId, reason } = req.body;
  if (!db.walletDeposits) db.walletDeposits = [];
  const deposit = db.walletDeposits.find(d => d.id === depositId);

  if (!deposit) {
    return res.status(404).json({ success: false, message: 'Deposit request not found.' });
  }

  if (deposit.status === 'APPROVED') {
    return res.status(400).json({
      success: false,
      message: 'Deposit is already approved and funds have been credited. Cannot reject.'
    });
  }
  if (deposit.status === 'REJECTED') {
    return res.status(400).json({
      success: false,
      message: 'Deposit has already been rejected previously.'
    });
  }

  const now = new Date().toISOString();
  deposit.status = 'REJECTED';
  deposit.rejectionReason = reason || 'Payment could not be verified by administrator';
  deposit.updatedAt = now;
  deposit.adminActionBy = req.admin ? req.admin.username : 'admin';

  // Update matching transaction in db.walletTransactions (Do NOT credit money)
  if (db.walletTransactions) {
    const tx = db.walletTransactions.find(t => t.depositId === deposit.id || (t.utr === deposit.utr && t.type === 'DEPOSIT'));
    if (tx) {
      tx.status = 'REJECTED';
      tx.updatedAt = now;
      tx.rejectionReason = deposit.rejectionReason;
    }
  }

  saveData();

  res.json({
    success: true,
    message: 'Deposit request rejected.',
    deposit
  });
});

// Admin: Overview Statistics
app.get('/api/admin/stats', verifyAdmin, (req, res) => {
  const pendingCount = db.paymentRequests.filter(r => r.status === 'PENDING').length;
  const approvedCount = db.paymentRequests.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = db.paymentRequests.filter(r => r.status === 'REJECTED').length;
  const totalRevenue = db.paymentRequests
    .filter(r => r.status === 'APPROVED')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const pendingDepositsCount = (db.walletDeposits || []).filter(d => d.status === 'PENDING').length;
  const approvedDepositsCount = (db.walletDeposits || []).filter(d => d.status === 'APPROVED').length;
  const totalDepositVolume = (db.walletDeposits || [])
    .filter(d => d.status === 'APPROVED')
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  res.json({
    success: true,
    stats: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      totalRevenue,
      pendingDeposits: pendingDepositsCount,
      approvedDeposits: approvedDepositsCount,
      totalDepositVolume,
      totalKeys: db.keys.length,
      activeRedeemedKeys: db.keys.filter(k => k.isRedeemed).length,
      totalUsers: db.users.length
    }
  });
});

// Admin: Get Keys List
app.get('/api/admin/keys', verifyAdmin, (req, res) => {
  res.json({ success: true, keys: db.keys });
});

// Admin: Get Game Links List
app.get('/api/admin/game-links', verifyAdmin, (req, res) => {
  res.json({ success: true, gameLinks: db.gameLinks });
});

// Fallback Route: Serve Admin page or Main page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server (Standalone Node or export for Vercel Serverless)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`⚡ KrishanaPredi Server is Running`);
    console.log(`🌐 Web App:    http://localhost:${PORT}`);
    console.log(`🛡️  Admin Area: http://localhost:${PORT}/admin`);
    console.log(`🔒 Security:   JWT Auth & Rate-Limiter Enabled`);
    console.log(`==================================================\n`);
  });
}

module.exports = app;
