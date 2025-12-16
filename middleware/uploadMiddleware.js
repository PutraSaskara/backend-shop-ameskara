// middleware/uploadMiddleware.js

const multer = require('multer');
const path = require('path');

// --- KONFIGURASI MULTER ---

// 1. Konfigurasi penyimpanan disk
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        
        // Memberi prefix berdasarkan fieldname: banner- atau variant-
        const prefix = file.fieldname === 'productBanner' ? 'banner-' : 'variant-'; 
        
        cb(null, prefix + uniqueSuffix + fileExtension);
    }
});

// 2. Filter file: HANYA WebP
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/webp') {
        cb(null, true);
    } else {
        cb(null, false);
        // Penting: MulterError membutuhkan error yang dilemparkan (throw) untuk ditangkap dengan benar
        cb(new Error('Format file tidak diizinkan. Hanya WebP (.webp) yang diterima.'));
    }
};

// 3. Inisialisasi Multer
const MAX_FILE_SIZE = 2 * 1024 * 1024; // Maksimum 2MB

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE 
    }
});

// --- MIDDLEWARE UTAMA: Menggunakan upload.fields untuk banyak field file ---

exports.uploadProductAssets = upload.fields([
    { name: 'productBanner', maxCount: 1 }, // Field untuk gambar Banner (Tunggal)
    { name: 'variantImages', maxCount: 10 }  // Field lama untuk Varian (Array)
]);


// Middleware pemroses utama (menggantikan exports.uploadVariants yang lama)
exports.processProductUpload = (req, res, next) => {
    
    // Panggil middleware upload.fields yang sudah dikonfigurasi
    exports.uploadProductAssets(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // Error Multer
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: `Ukuran file melebihi batas maksimum ${MAX_FILE_SIZE / (1024 * 1024)}MB.` });
            }
            // Error lainnya
            return res.status(400).json({ message: 'Gagal upload: ' + err.message });
        } else if (err) {
            // Error dari fileFilter
            return res.status(400).json({ message: err.message });
        }
        
        // Setelah Multer selesai, req.files akan berisi: { productBanner: [...], variantImages: [...] }
        next();
    });
};