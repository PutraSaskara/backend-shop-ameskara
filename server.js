require('dotenv').config(); // Load variabel dari .env
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Pakai versi promise
const compression = require('compression'); // <--- IMPOR BARU
const path = require('path');
const fs = require('fs/promises');
const port = 5000;

const app = express();
// Konfigurasi CORS: Izinkan Next.js (Port 3000) untuk mengakses
app.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:3000'], // <-- Hanya izinkan Next.js frontend Anda
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // Diperlukan jika Anda menggunakan cookies/session di masa depan
}));

// Tambahkan header Cache-Control
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '30d', // Contoh: Browser menyimpan file selama 30 hari
    setHeaders: (res, path, stat) => {
        // Hanya tambahkan header ini untuk file gambar
        if (path.endsWith('.jpg') || path.endsWith('.png') || path.endsWith('.webp')) {
            // Header Cache-Control yang kuat: simpan di cache publik selama 30 hari
            res.set('Cache-Control', `public, max-age=${30 * 24 * 60 * 60}`); 
        }
    }
}));

// Middleware
app.use(compression());
app.use(express.json()); // Untuk parsing body request JSON
// Middleware untuk menyajikan file statis dari folder 'public'
app.use(express.static(path.join(__dirname, 'public'))); // <--- TAMBAHKAN INI

// --- Koneksi Database ---
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware untuk membuat koneksi db tersedia di request (opsional tapi membantu)
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Import Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/product');
const categoryRoutes = require('./routes/categoryRoutes');
const articleRoutes = require('./routes/articleRoutes');

// Definisikan Routes
app.use('/api/auth', authRoutes); // Untuk login dashboard
app.use('/api/products', productRoutes); // Untuk produk
app.use('/api/categories', categoryRoutes); // Untuk kategori
// ---> TAMBAHKAN BARIS INI <---
app.use('/api/articles', articleRoutes);


// Route dasar
app.get('/', (req, res) => {
    res.send('Backend Toko Online Berjalan!');
});

// Cek koneksi DB saat server start
db.getConnection()
    .then(connection => {
        console.log('Koneksi database MySQL berhasil!');
        connection.release();
        app.listen(port, () => {
            console.log(`Server berjalan di http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error('Koneksi database gagal:', err.message);
        process.exit(1); // Hentikan aplikasi jika DB gagal
    });

    // Global Error Handler untuk menangkap error 500 seperti yang baru saja Anda alami
app.use(async (err, req, res, next) => {
    console.error(err.stack);

    // Coba cleanup jika file diunggah tapi terjadi error
    if (req.files && req.files.length > 0) {
        console.log(`[GLOBAL CLEANUP] Mencoba menghapus ${req.files.length} file...`);
        for (const file of req.files) {
            try {
                // Gunakan path.join(process.cwd(), ...) agar path lebih absolut
                const filePath = path.join(process.cwd(), 'public', 'uploads', file.filename);
                await fs.unlink(filePath);
                console.log(`[GLOBAL CLEANUP] File ${file.filename} berhasil dihapus.`);
            } catch (cleanupErr) {
                console.error(`[GLOBAL CLEANUP ERROR] Gagal menghapus ${file.filename}:`, cleanupErr.message);
            }
        }
    }

    res.status(err.statusCode || 500).json({
        message: 'Terjadi Kesalahan Server Internal.',
        error: err.message
    });
});