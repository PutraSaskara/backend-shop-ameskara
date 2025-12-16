const fs = require('fs/promises'); // Untuk menghapus file
const path = require('path');

/**
 * Middleware untuk menghapus file yang diunggah jika terjadi error pada controller.
 * Diposisikan setelah controller.
 */
exports.cleanupUploadedFiles = async (err, req, res, next) => {
    // Error Handling Middleware selalu memiliki 4 argumen: (err, req, res, next)
    
    // Periksa apakah ada file yang diunggah
    if (req.files && req.files.length > 0) {
        console.log(`[CLEANUP] Menghapus ${req.files.length} file yatim setelah error.`);
        
        // Loop melalui semua file yang diunggah oleh Multer
        for (const file of req.files) {
            try {
                // Buat path lengkap ke file
                const filePath = path.join(__dirname, '..', 'public', 'uploads', file.filename);
                
                // Hapus file secara asinkron
                await fs.unlink(filePath);
                console.log(`[CLEANUP] Berhasil menghapus file: ${file.filename}`);
            } catch (cleanupErr) {
                // Jika gagal menghapus (misalnya file sudah dihapus atau permission issue)
                console.error(`[CLEANUP ERROR] Gagal menghapus ${file.filename}:`, cleanupErr);
            }
        }
    }
    
    // Setelah membersihkan, teruskan error ke handler error default Express
    next(err); 
};