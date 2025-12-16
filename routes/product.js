const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { protectApi } = require('../middleware/apiKeyMiddleware'); // <--- IMPOR BARU
// const { uploadVariants } = require('../middleware/uploadMiddleware');
const { processProductUpload } = require('../middleware/uploadMiddleware');

const { 
    createProduct, 
    getDashboardProducts, 
    getPublicProducts,
    getPublicProductDetail,
    updateProduct,
    deleteProduct
    // Hapus checkLocalPassword
} = require('../controllers/productController');
const router = express.Router();

// --- Rute Dashboard (Perlu Login JWT) ---
// Masih menggunakan protect
// POST /api/products
// Deskripsi: Menambahkan produk baru. Sekarang menerima file!
// Urutan middleware: protect (JWT) -> uploadVariants (Multer) -> createProduct (Controller)
router.post('/', protect, processProductUpload, createProduct);
router.get('/dashboard', protect, getDashboardProducts);

// --- Rute Web Utama (Publik) ---
// Sekarang menggunakan protectApi

// GET /api/products/public
// Deskripsi: Mengambil daftar produk publik (untuk homepage/list produk)
router.get('/public', protectApi, getDashboardProducts); // <--- PROTECTED

// GET /api/products/public/:slug
// Deskripsi: Mengambil detail produk
router.get('/public/:slug', protectApi, getPublicProductDetail); // <--- PROTECTED

// Hapus rute lama untuk password lokal
// router.post('/access/:id', checkLocalPassword); 

router.put('/:id', protect, processProductUpload, updateProduct);
router.delete('/:id', protect, deleteProduct);

module.exports = router;