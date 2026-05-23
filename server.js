const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kasirsecret';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let useMongoDB = false;

const USERS_FILE = path.join(__dirname, 'database_users.json');
const PRODUCTS_FILE = path.join(__dirname, 'database_products.json');
const TRANSACTIONS_FILE = path.join(__dirname, 'database_transactions.json');

function readJSON(filePath, defaultValue = []) {
    try {
        if (!fs.existsSync(filePath)) { fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2)); return defaultValue; }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { return defaultValue; }
}

function writeJSON(filePath, data) {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch (e) { console.error(e); }
}

// ── Mongoose Schemas ──────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['owner', 'admin', 'kasir'], default: 'kasir' },
    avatar: { type: String, default: '' },
    loginHistory: [{ time: { type: Date, default: Date.now }, ip: String }],
    isOnline: { type: Boolean, default: false }
});

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, default: '' },
    stock: { type: Number, default: 50 },
    category: { type: String, enum: ['Semua', 'Makanan', 'Minuman', 'Snack'], default: 'Semua' },
    barcode: { type: String, default: '' }
});

const TransactionSchema = new mongoose.Schema({
    items: [{ name: String, price: Number, quantity: Number }],
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['Tunai', 'QRIS'], required: true },
    status: { type: String, enum: ['Lunas', 'Pending', 'Dibatalkan'], default: 'Lunas' },
    cashier: { type: String, required: true },
    cashPaid: { type: Number, default: 0 },
    changeReturned: { type: Number, default: 0 },
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// ── Database Init ─────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000
    })
    .then(async () => {
        console.log('💚 MongoDB Connected!');
        useMongoDB = true;
        await seedMongoUsers();
    })
    .catch((err) => {
    console.log('❌ MongoDB Error:', err.message);
    console.log('⚠️  MongoDB offline — menggunakan JSON fallback.');
    useMongoDB = false;
    seedJSONUsers();
    });

async function seedMongoUsers() {
    const seeds = [
        { username: 'owner', role: 'owner' },
        { username: 'admin', role: 'admin' },
        { username: 'kasir', role: 'kasir' }
    ];
    for (const s of seeds) {
        if (!await User.findOne({ username: s.username })) {
            await User.create({ username: s.username, password: await bcrypt.hash('123', 10), role: s.role });
            console.log(`Seeded MongoDB user: ${s.username} / 123`);
        }
    }
}

function seedJSONUsers() {
    const users = readJSON(USERS_FILE, []);
    const seeds = [
        { _id: 'json-owner-id', username: 'owner', role: 'owner' },
        { _id: 'json-admin-id', username: 'admin', role: 'admin' },
        { _id: 'json-kasir-id', username: 'kasir', role: 'kasir' }
    ];
    let updated = false;
    for (const s of seeds) {
        if (!users.some(u => u.username === s.username)) {
            users.push({ ...s, password: bcrypt.hashSync('123', 10), isOnline: false, loginHistory: [], avatar: '' });
            console.log(`Seeded JSON user: ${s.username} / 123`);
            updated = true;
        }
    }
    if (updated) writeJSON(USERS_FILE, users);
}

// ── Middleware ────────────────────────────────────────────────────────────────
const auth = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token tidak valid atau kadaluarsa' });
        req.user = user;
        next();
    });
};

const adminOrOwner = (req, res, next) => {
    if (!['admin', 'owner'].includes(req.user.role))
        return res.status(403).json({ success: false, message: 'Hanya admin atau owner' });
    next();
};

const ownerOnly = (req, res, next) => {
    if (req.user.role !== 'owner')
        return res.status(403).json({ success: false, message: 'Hanya owner' });
    next();
};

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (/jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Hanya file gambar yang diperbolehkan!'));
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });

        let user = useMongoDB
            ? await User.findOne({ username })
            : readJSON(USERS_FILE).find(u => u.username === username);

        if (!user || !await bcrypt.compare(password, user.password))
            return res.status(401).json({ success: false, message: 'Username atau password salah' });

        // record login
        const ip = req.ip || 'unknown';
        if (useMongoDB) {
            await User.findByIdAndUpdate(user._id, {
                isOnline: true,
                $push: { loginHistory: { time: new Date(), ip } }
            });
        } else {
            const users = readJSON(USERS_FILE);
            const idx = users.findIndex(u => u.username === username);
            if (idx > -1) {
                users[idx].isOnline = true;
                users[idx].loginHistory = [{ time: new Date().toISOString(), ip }, ...(users[idx].loginHistory || [])].slice(0, 20);
                writeJSON(USERS_FILE, users);
            }
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ success: true, message: 'Login berhasil', token, user: { username: user.username, role: user.role, avatar: user.avatar || '' } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Server error', error: e.message });
    }
});

app.get('/api/auth/verify', auth, (req, res) => {
    res.json({ success: true, user: { username: req.user.username, role: req.user.role } });
});

app.post('/api/auth/logout', auth, async (req, res) => {
    if (useMongoDB) {
        await User.findOneAndUpdate({ username: req.user.username }, { isOnline: false });
    } else {
        const users = readJSON(USERS_FILE);
        const idx = users.findIndex(u => u.username === req.user.username);
        if (idx > -1) { users[idx].isOnline = false; writeJSON(USERS_FILE, users); }
    }
    res.json({ success: true, message: 'Logout berhasil' });
});

app.put('/api/auth/change-password', auth, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi' });
        if (newPassword.length < 3) return res.status(400).json({ success: false, message: 'Password baru minimal 3 karakter' });

        if (useMongoDB) {
            const user = await User.findOne({ username: req.user.username });
            if (!await bcrypt.compare(oldPassword, user.password))
                return res.status(401).json({ success: false, message: 'Password lama salah' });
            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();
        } else {
            const users = readJSON(USERS_FILE);
            const idx = users.findIndex(u => u.username === req.user.username);
            if (idx < 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
            if (!await bcrypt.compare(oldPassword, users[idx].password))
                return res.status(401).json({ success: false, message: 'Password lama salah' });
            users[idx].password = await bcrypt.hash(newPassword, 10);
            writeJSON(USERS_FILE, users);
        }
        res.json({ success: true, message: 'Password berhasil diubah' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Server error', error: e.message });
    }
});

app.get('/api/auth/login-history', auth, adminOrOwner, async (req, res) => {
    try {
        let history = [];
        if (useMongoDB) {
            const users = await User.find({}, 'username loginHistory role');
            users.forEach(u => {
                (u.loginHistory || []).forEach(h => history.push({ username: u.username, role: u.role, time: h.time, ip: h.ip }));
            });
        } else {
            readJSON(USERS_FILE).forEach(u => {
                (u.loginHistory || []).forEach(h => history.push({ username: u.username, role: u.role, time: h.time, ip: h.ip }));
            });
        }
        history.sort((a, b) => new Date(b.time) - new Date(a.time));
        res.json({ success: true, history: history.slice(0, 50) });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Server error', error: e.message });
    }
});

app.get('/api/auth/online-users', auth, async (req, res) => {
    try {
        let onlineCount = 0;
        if (useMongoDB) {
            onlineCount = await User.countDocuments({ isOnline: true });
        } else {
            onlineCount = readJSON(USERS_FILE).filter(u => u.isOnline).length;
        }
        res.json({ success: true, onlineCount });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PRODUCT ROUTES ────────────────────────────────────────────────────────────
app.get('/api/products', auth, async (req, res) => {
    try {
        const products = useMongoDB ? await Product.find({}) : readJSON(PRODUCTS_FILE);
        res.json({ success: true, products });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal memuat produk' });
    }
});

app.post('/api/products', auth, adminOrOwner, upload.single('image'), async (req, res) => {
    try {
        const { name, price, stock, category, barcode } = req.body;
        if (!name || !price) return res.status(400).json({ success: false, message: 'Nama dan harga wajib diisi' });

        const productData = {
            name, price: Number(price),
            stock: Number(stock) || 50,
            category: category || 'Semua',
            barcode: barcode || '',
            image: req.file ? '/uploads/' + req.file.filename : ''
        };

        let saved;
        if (useMongoDB) {
            saved = await Product.create(productData);
        } else {
            const products = readJSON(PRODUCTS_FILE);
            saved = { _id: 'json-prod-' + Date.now(), ...productData };
            products.push(saved);
            writeJSON(PRODUCTS_FILE, products);
        }
        res.json({ success: true, message: 'Produk berhasil ditambahkan', product: saved });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal menambahkan produk', error: e.message });
    }
});

app.put('/api/products/:id', auth, adminOrOwner, upload.single('image'), async (req, res) => {
    try {
        const { name, price, stock, category, barcode } = req.body;
        const updateData = {};
        if (name) updateData.name = name;
        if (price) updateData.price = Number(price);
        if (stock !== undefined) updateData.stock = Number(stock);
        if (category) updateData.category = category;
        if (barcode !== undefined) updateData.barcode = barcode;
        if (req.file) updateData.image = '/uploads/' + req.file.filename;

        let updated;
        if (useMongoDB) {
            updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        } else {
            const products = readJSON(PRODUCTS_FILE);
            const idx = products.findIndex(p => p._id === req.params.id);
            if (idx < 0) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
            products[idx] = { ...products[idx], ...updateData };
            updated = products[idx];
            writeJSON(PRODUCTS_FILE, products);
        }
        if (!updated) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
        res.json({ success: true, message: 'Produk diperbarui', product: updated });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal memperbarui produk', error: e.message });
    }
});

app.delete('/api/products/:id', auth, adminOrOwner, async (req, res) => {
    try {
        if (useMongoDB) {
            const del = await Product.findByIdAndDelete(req.params.id);
            if (!del) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
        } else {
            const products = readJSON(PRODUCTS_FILE);
            const idx = products.findIndex(p => p._id === req.params.id);
            if (idx < 0) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
            products.splice(idx, 1);
            writeJSON(PRODUCTS_FILE, products);
        }
        res.json({ success: true, message: 'Produk berhasil dihapus' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal menghapus produk', error: e.message });
    }
});

// ── TRANSACTION ROUTES ────────────────────────────────────────────────────────
app.post('/api/transactions', auth, async (req, res) => {
    try {
        const { items, total, paymentMethod, cashPaid, changeReturned } = req.body;
        if (!items || !items.length || !total || !paymentMethod)
            return res.status(400).json({ success: false, message: 'Data transaksi tidak lengkap' });

        // Deduct stock
        for (const item of items) {
            if (useMongoDB) {
                await Product.findOneAndUpdate(
                    { name: item.name },
                    { $inc: { stock: -item.quantity } }
                );
            } else {
                const products = readJSON(PRODUCTS_FILE);
                const idx = products.findIndex(p => p.name === item.name);
                if (idx > -1) { products[idx].stock = Math.max(0, (products[idx].stock || 0) - item.quantity); writeJSON(PRODUCTS_FILE, products); }
            }
        }

        const txData = {
            items, total: Number(total), paymentMethod, status: 'Lunas',
            cashier: req.user.username,
            cashPaid: Number(cashPaid) || 0,
            changeReturned: Number(changeReturned) || 0
        };

        let saved;
        if (useMongoDB) {
            saved = await Transaction.create(txData);
        } else {
            const transactions = readJSON(TRANSACTIONS_FILE);
            saved = { _id: 'json-tx-' + Date.now() + Math.random().toString(36).substr(2, 4), date: new Date().toISOString(), ...txData };
            transactions.push(saved);
            writeJSON(TRANSACTIONS_FILE, transactions);
        }
        res.json({ success: true, message: 'Transaksi berhasil', transaction: saved });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal memproses transaksi', error: e.message });
    }
});

app.get('/api/transactions', auth, async (req, res) => {
    try {
        let transactions = useMongoDB
            ? await Transaction.find({}).sort({ date: -1 })
            : readJSON(TRANSACTIONS_FILE).sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json({ success: true, transactions });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal mengambil transaksi' });
    }
});

app.put('/api/transactions/:id/status', auth, adminOrOwner, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['Lunas', 'Pending', 'Dibatalkan'].includes(status))
            return res.status(400).json({ success: false, message: 'Status tidak valid' });

        if (useMongoDB) {
            await Transaction.findByIdAndUpdate(req.params.id, { status });
        } else {
            const txs = readJSON(TRANSACTIONS_FILE);
            const idx = txs.findIndex(t => t._id === req.params.id);
            if (idx > -1) { txs[idx].status = status; writeJSON(TRANSACTIONS_FILE, txs); }
        }
        res.json({ success: true, message: `Status diubah ke ${status}` });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal mengubah status' });
    }
});

// ── BACKUP ROUTE ──────────────────────────────────────────────────────────────
app.get('/api/database/backup', auth, adminOrOwner, async (req, res) => {
    try {
        let backupData = {};
        if (useMongoDB) {
            backupData = {
                users: await User.find({}, '-password'),
                products: await Product.find({}),
                transactions: await Transaction.find({})
            };
        } else {
            backupData = {
                users: readJSON(USERS_FILE).map(u => { const { password, ...rest } = u; return rest; }),
                products: readJSON(PRODUCTS_FILE),
                transactions: readJSON(TRANSACTIONS_FILE)
            };
        }
        const filename = `kasir_backup_${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(backupData, null, 2));
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal membuat backup' });
    }
});

// ── STATIC FALLBACKS ──────────────────────────────────────────────────────────
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));

app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));