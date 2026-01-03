const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./User'); // Import model User
const config = require('./config');
const logger = require('./logger');
const errorHandler = require('./errorHandler');

const app = express();
const PORT = config.PORTS.AUTH || 3003;

// Middleware
app.use(express.json());
app.use(logger);

// Konfigurasi Database
const MONGO_URI = config.MONGO_URI;
const JWT_SECRET = config.JWT_SECRET;

// Koneksi ke MongoDB (tolerant: if it fails, keep service running with an in-memory fallback)
let dbConnected = false;

async function tryConnectMongo() {
  try {
    await mongoose.connect(MONGO_URI);
    dbConnected = true;
    console.log('Auth Service terhubung ke MongoDB.');
    seedAdminToMongo().catch((err) => console.warn('Seed admin gagal:', err && err.message ? err.message : err));
  } catch (err) {
    dbConnected = false;
    console.warn('Koneksi Auth Service ke MongoDB gagal, beralih ke fallback in-memory:', err && err.message ? err.message : err);
  }
}

// Try first time, and retry periodically if not connected
tryConnectMongo();
setInterval(() => {
  if (!dbConnected) tryConnectMongo();
}, 10_000);

// Simple in-memory users fallback (for demo)
const inMemoryUsers = [];

(async () => {
  // default admin: username "admin" / password "12345"
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash('12345', salt);
  inMemoryUsers.push({ _id: 'inmem-admin-1', username: 'admin', password: hashed, role: 'admin' });
})();

let adminSeeded = false;

async function seedAdminToMongo() {
  if (adminSeeded) return;
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return;

  const existing = await User.findOne({ username: 'admin' }).exec();
  if (existing) {
    adminSeeded = true;
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash('12345', salt);
  await User.create({ username: 'admin', password: hashed, role: 'admin' });
  adminSeeded = true;
  console.log('Seeded default admin user (admin / 12345) into MongoDB');
}

async function findUser(username) {
  // Prefer to use mongoose only when the connection is fully established.
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      // Race the Mongo query against a small timeout so we fall back quickly when Mongo is unresponsive.
      const q = User.findOne({ username }).exec();
      // Attach a catch to suppress a later rejection (so our fast timeout doesn't leave an unhandled rejection)
      q.catch((err) => { console.warn('Suppressed mongo query error:', err && err.message ? err.message : err); });

      const result = await Promise.race([
        q,
        new Promise((_, reject) => setTimeout(() => reject(new Error('mongo lookup timeout')), 1500))
      ]);
      return result;
    } catch (err) {
      console.warn('Mongo lookup failed or timed out, falling back to in-memory:', err && err.message ? err.message : err);
      return inMemoryUsers.find(u => u.username === username) || null;
    }
  } else {
    return inMemoryUsers.find(u => u.username === username) || null;
  }
}

async function createUser({ username, password, role }) {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    const newUser = new User({ username, password, role });
    await newUser.save();
    return newUser;
  } else {
    const id = `inmem-${Date.now()}`;
    const user = { _id: id, username, password, role };
    inMemoryUsers.push(user);
    return user;
  }
}

// ----------------------------------------------------------------
// Endpoint /api/auth/register: Mendaftarkan User Baru
// ----------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        // 1. Cek apakah user sudah ada (support fallback)
        const existingUser = await findUser(username);
        if (existingUser) {
            return res.status(400).json({ message: 'Username sudah digunakan.' });
        }

        // 2. Hash Password sebelum disimpan
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Buat User Baru (support fallback)
        const newUser = await createUser({ username, password: hashedPassword, role: role || 'cashier' });

        res.status(201).json({ message: 'User berhasil didaftarkan.', userId: newUser._id, role: newUser.role });

    } catch (error) {
        console.error('Error saat registrasi:', error);
        res.status(500).json({ message: 'Registrasi gagal. Coba lagi nanti.' });
    }
});

// ----------------------------------------------------------------
// Endpoint /api/auth/login: Login dan menghasilkan JWT
// ----------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Cari user (support fallback)
        const user = await findUser(username);
        if (!user) {
            return res.status(400).json({ message: 'Kredensial tidak valid.' });
        }

        // 2. Bandingkan password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Kredensial tidak valid.' });
        }

        // 3. Generate JWT (Token)
        const payload = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

        res.json({ token, user: { id: user._id, username: user.username, role: user.role } });

    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ message: 'Login gagal. Coba lagi nanti.' });
    }
});



// Fallback error handler
app.use(errorHandler);

// Jalankan Server
app.listen(PORT, () => {
    console.log(`Auth Service berjalan di port ${PORT}`);
});