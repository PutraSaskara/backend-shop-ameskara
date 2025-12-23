const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const multer = require('multer');
const path = require('path');
const { protect } = require('../middleware/authMiddleware'); 

// --- KONFIGURASI MULTER (KHUSUS ARTIKEL) ---

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // PERBAIKAN: Gunakan path.join agar absolute path (Sama seperti product)
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Prefix 'article-' agar mudah dibedakan filenya
        cb(null, 'article-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit 5MB (Cukup besar untuk artikel)
    fileFilter: (req, file, cb) => {
        // Artikel kita izinkan JPG, PNG, WEBP (Lebih fleksibel dari produk)
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.'));
    }
});

// --- MIDDLEWARE WRAPPER (PENTING UNTUK EDITOR.JS) ---
// Editor.js butuh return JSON { success: 0 } kalau error, bukan HTML error page.
const handleEditorUpload = (req, res, next) => {
    const uploadSingle = upload.single('image'); // Field name dari Editor.js adalah 'image'

    uploadSingle(req, res, function (err) {
        if (err) {
            // Jika Error Multer (Size limit / Extensi salah)
            return res.status(400).json({ 
                success: 0, 
                message: err.message 
            });
        }
        // Jika sukses upload, lanjut ke controller
        next();
    });
};

// --- ROUTES ---

// 1. Public Routes
router.get('/public', articleController.getPublicArticles);
router.get('/public/:slug', articleController.getArticleDetail);

// 2. Admin Routes (Butuh Token)

// A. Endpoint Upload Gambar untuk Editor.js
// Menggunakan middleware wrapper 'handleEditorUpload' yang kita buat di atas
router.post('/upload-image', handleEditorUpload, articleController.uploadContentImage);

// B. Dashboard List (BARU)
router.get('/dashboard', protect, articleController.getDashboardArticles); // <--- TAMBAHKAN INI

// C. Get By ID (BARU - Tambahkan Sebelum CRUD Artikel Utama)
router.get('/:id', protect, articleController.getArticleById);

// D. CRUD Artikel Utama
// Field name dari form create artikel adalah 'thumbnail'
router.post('/', protect, upload.single('thumbnail'), articleController.createArticle);
router.put('/:id', protect, upload.single('thumbnail'), articleController.updateArticle);
router.delete('/:id', protect, articleController.deleteArticle);

module.exports = router;