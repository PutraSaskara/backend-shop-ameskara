// controllers/productController.js

// --- Helper untuk Dashboard (ADMIN) ---
const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs'); 

// Helper untuk membersihkan file jika terjadi error
const cleanupFiles = async (files) => {
    let filesToCleanup = [];
    
    // Cek jika files adalah objek (dari req.files Multer .fields())
    if (files && typeof files === 'object' && !Array.isArray(files)) {
        filesToCleanup = Object.values(files).flat();
    } else if (Array.isArray(files)) {
        filesToCleanup = files; // Jika files sudah berupa array (untuk compatibility)
    }

    if (filesToCleanup.length === 0) return;
    
    for (const file of filesToCleanup) {
        try {
            // Pastikan file memiliki properti filename
            if (file && file.filename) {
                const filePath = path.join(__dirname, '..', 'public', 'uploads', file.filename);
                await fs.unlink(filePath);
                console.log(`[CLEANUP] File ${file.filename} dihapus karena error.`);
            }
        } catch (e) {
            console.error(`[CLEANUP ERROR] Gagal menghapus file ${file.filename}:`, e);
        }
    }
};

const slugify = (text) => {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-') 
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};

// --- HELPER FUNCTION: LEVENSHTEIN DISTANCE ---
// Fungsi ini menghitung berapa banyak huruf yang harus diubah/hapus/tambah
// agar kata A menjadi kata B. Semakin kecil angkanya, semakin mirip.
function levenshteinDistance(a, b) {
    if (!a || !b) return (a || b).length;
    const matrix = [];
    let i, j;

    // Inisialisasi matriks
    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Hitung jarak
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}


// POST /api/products (Dashboard)
exports.createProduct = async (req, res) => {
    const db = req.db; 
    let variantsData = []; 
    let finalVariants = []; 

    if (req.user.role !== 'admin') {
        await cleanupFiles(req.files); 
        return res.status(403).json({ message: 'Akses ditolak' });
    }
    
    const uploadedBanner = req.files.productBanner ? req.files.productBanner[0] : null;
    const uploadedVariantFiles = req.files.variantImages || [];
    const allUploadedFiles = uploadedBanner ? uploadedVariantFiles.concat(uploadedBanner) : uploadedVariantFiles;

    const { 
        name, description, price, slug: inputSlug, meta_title, meta_description, category_id 
    } = req.body;

    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    
    // Logic slug generation
    let finalSlug = inputSlug;
    if (!inputSlug) {
        finalSlug = slugify(name); 
    } else {
        finalSlug = slugify(inputSlug); 
    }
    
    try {
        const [existing] = await db.query('SELECT id FROM products WHERE slug = ?', [finalSlug]);
        if (existing.length > 0) {
            await cleanupFiles(allUploadedFiles); 
            return res.status(400).json({ message: 'Slug sudah digunakan. Silakan edit atau biarkan kosong.' });
        }
    } catch (error) {
        await cleanupFiles(allUploadedFiles); 
        console.error('Error saat cek slug:', error);
        return res.status(500).json({ message: 'Terjadi kesalahan server saat validasi slug.' });
    }
    
    // Pemrosesan Varian
    try {
        variantsData = JSON.parse(req.body.variants || '[]'); 
    } catch (e) {
        await cleanupFiles(allUploadedFiles); 
        return res.status(400).json({ message: 'Format data varian tidak valid.' });
    }
    
    let fileIndex = 0;
    let totalStock = 0; 

    finalVariants = variantsData.map(v => {
        const variant = { ...v };
        if (uploadedVariantFiles[fileIndex]) {
            variant.image = `${baseUrl}/uploads/${uploadedVariantFiles[fileIndex].filename}`; 
            fileIndex++;
        } else {
            variant.image = null; 
        }
        
        if (variant.sizes && Array.isArray(variant.sizes)) {
            const stockInVariant = variant.sizes.reduce((sum, s) => sum + Number(s.stock || 0), 0);
            totalStock += stockInVariant; 
        } else {
            variant.sizes = []; 
        }
        delete variant.isNewImage;
        return variant;
    });

    let bannerImageUrl = null;
    if (uploadedBanner) {
        bannerImageUrl = `${baseUrl}/uploads/${uploadedBanner.filename}`;
    }

    try {
        const [result] = await db.query(
            'INSERT INTO products (name, description, price, stock, variants, slug, meta_title, meta_description, banner_image, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, description, price, totalStock, JSON.stringify(finalVariants), finalSlug, meta_title, meta_description, bannerImageUrl, category_id || null] 
        );

        res.status(201).json({ 
            id: result.insertId, 
            name, 
            price, 
            stock: totalStock,
            variants: finalVariants, 
            slug: finalSlug,
            banner_image: bannerImageUrl,
            message: 'Produk berhasil ditambahkan' 
        });

    } catch (error) {
        await cleanupFiles(allUploadedFiles); 
        console.error('Error saat membuat produk:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat menyimpan produk.' });
    }
};

// GET /api/products/dashboard (Dashboard: Ambil semua produk)
exports.getDashboardProducts = async (req, res) => {
    const db = req.db;
    const { search, category } = req.query; 
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        // 1. Base Query dengan JOIN
        let baseQuery = `
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
        `;
        
        // 2. Susun Kondisi WHERE secara Dinamis
        let conditions = [];
        let queryParams = [];

        // Filter Search
        if (search) {
            conditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.slug LIKE ?)');
            const keyword = `%${search}%`;
            queryParams.push(keyword, keyword, keyword);
        }

        // Filter Category (Berdasarkan Slug)
        if (category) {
            conditions.push('c.slug = ?');
            queryParams.push(category);
        }

        // Gabungkan kondisi (jika ada)
        let whereClause = '';
        if (conditions.length > 0) {
            whereClause = ' WHERE ' + conditions.join(' AND ');
        }

        // 3. Hitung Total (Count)
        const countQuery = `SELECT COUNT(*) as total ${baseQuery} ${whereClause}`;
        const [countResult] = await db.query(countQuery, queryParams);
        
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // 4. Ambil Data
        const dataQuery = `
            SELECT p.*, c.name as category_name, c.slug as category_slug
            ${baseQuery} 
            ${whereClause} 
            ORDER BY p.id DESC 
            LIMIT ? OFFSET ?
        `;

        const dataParams = [...queryParams, limit, offset];
        const [products] = await db.query(dataQuery, dataParams);
        
        // Parsing Variants
        const parsedProducts = products.map(p => ({
            ...p,
            variants: typeof p.variants === 'string' ? JSON.parse(p.variants || '[]') : p.variants
        }));

        // --- 5. LOGIKA SMART SUGGESTION (BARU) ---
        let suggestion = null;

        // Jalankan hanya jika: Hasil Kosong (0) DAN User sedang mencari (search ada isi)
        if (parsedProducts.length === 0 && search) {
            
            // Ambil semua nama produk dari DB (ringan, cuma kolom name)
            // Kita gunakan WHERE stock > 0 agar tidak menyarankan produk habis (opsional)
            const [allNames] = await db.query("SELECT name FROM products");

            let closestMatch = null;
            let lowestDistance = Infinity;

            // Loop setiap nama produk di DB
            allNames.forEach(prod => {
                // Pecah nama produk jadi kata-kata (misal: "Sprei Linen Hijau" -> ["Sprei", "Linen", "Hijau"])
                const words = prod.name.split(' ');

                words.forEach(word => {
                    // Bersihkan simbol (titik, koma, dll)
                    const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
                    
                    // Hitung jarak kata kunci user vs kata di database
                    const distance = levenshteinDistance(search.toLowerCase(), cleanWord.toLowerCase());

                    // Kriteria Suggestion:
                    // 1. Jarak < 3 (maksimal typo 2 huruf)
                    // 2. Lebih dekat daripada match sebelumnya
                    // 3. Panjang kata > 2 (biar tidak match kata pendek tak bermakna)
                    if (distance < 3 && distance < lowestDistance && cleanWord.length > 2) {
                        lowestDistance = distance;
                        closestMatch = cleanWord;
                    }
                });
            });

            // Jika ketemu, format huruf kapital di awal
            if (closestMatch) {
                suggestion = closestMatch.charAt(0).toUpperCase() + closestMatch.slice(1).toLowerCase();
            }
        }
        // ------------------------------------------

        res.json({
            status: "success",
            data: parsedProducts,
            suggestion: suggestion, // <--- Kirim suggestion ke frontend
            pagination: {
                currentPage: page,
                itemsPerPage: limit,
                totalItems: totalItems,
                totalPages: totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        console.error('Error saat mengambil produk dashboard:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// --- Helper untuk Web Utama (PUBLIK/UTAMA) ---

// GET /api/products/public (Web Utama: Filter + Search + Pagination)
// --- CONTROLLER UTAMA ---
exports.getPublicProducts = async (req, res) => {
    const db = req.db;
    const { search, category } = req.query; 
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;

    try {
        // --- 1. Base Query dengan JOIN ---
        let baseQuery = `
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.stock > 0
        `;
        
        let queryParams = [];

        // --- 2. Filter Search ---
        if (search) {
            baseQuery += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            const keyword = `%${search}%`;
            queryParams.push(keyword, keyword);
        }

        // --- 3. Filter Kategori ---
        if (category) {
            baseQuery += ' AND c.slug = ?';
            queryParams.push(category);
        }

        // --- 4. Hitung Total Data ---
        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const [countResult] = await db.query(countQuery, queryParams);
        
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // --- 5. Ambil Data Produk ---
        const dataQuery = `
            SELECT p.id, p.name, p.description, p.price, p.stock, p.variants, 
                   p.banner_image, p.slug, p.meta_description, p.category_id,
                   c.name as category_name, c.slug as category_slug
            ${baseQuery} 
            ORDER BY p.id DESC 
            LIMIT ? OFFSET ?
        `;

        const dataParams = [...queryParams, limit, offset];
        const [products] = await db.query(dataQuery, dataParams);
        
        // Parsing Variants
        const parsedProducts = products.map(p => ({
            ...p,
            variants: typeof p.variants === 'string' ? JSON.parse(p.variants || '[]') : p.variants
        }));

        // --- 6. LOGIKA FUZZY SEARCH / SUGGESTION (BARU) ---
        let suggestion = null;

        // Jalankan logika ini HANYA jika:
        // 1. Hasil pencarian kosong (parsedProducts.length === 0)
        // 2. User memang sedang mencari sesuatu (search ada isinya)
        if (parsedProducts.length === 0 && search) {
            
            // Ambil SEMUA nama produk yang ada di database (hanya kolom nama agar ringan)
            const [allNames] = await db.query("SELECT name FROM products WHERE stock > 0");

            let closestMatch = null;
            let lowestDistance = Infinity; // Mulai dengan angka tak terhingga

            // Loop semua nama produk untuk dibandingkan
            allNames.forEach(prod => {
                // Bandingkan kata kunci (lowercase) dengan nama produk (lowercase)
                const distance = levenshteinDistance(search.toLowerCase(), prod.name.toLowerCase());
                
                // Kriteria Suggestion:
                // 1. Jarak < 4 (Maksimal salah 3 huruf, agar tidak terlalu ngawur)
                // 2. Jarak lebih kecil dari kandidat sebelumnya (cari yang paling mirip)
                if (distance < 4 && distance < lowestDistance) {
                    lowestDistance = distance;
                    closestMatch = prod.name;
                }
            });

            if (closestMatch) {
                suggestion = closestMatch;
            }
        }
        // ----------------------------------------------------

        res.json({
            status: "success",
            data: parsedProducts,
            suggestion: suggestion, // <--- Kirim suggestion ke frontend
            pagination: {
                currentPage: page,
                itemsPerPage: limit,
                totalItems: totalItems,
                totalPages: totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        console.error('Error saat mengambil produk publik:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};


// GET /api/products/public/:id (Web Utama: Detail + Info Kategori)
exports.getPublicProductDetail = async (req, res) => {
    const { slug } = req.params;
    const db = req.db;

    try {
        // JOIN categories agar kita bisa tampilkan breadcrumb (misal: Home > Kategori > Produk)
        const query = `
            SELECT p.*, c.name as category_name, c.slug as category_slug
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.slug = ?
        `;

        const [rows] = await db.query(query, [slug]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Produk tidak ditemukan' });
        }

        const product = rows[0];
        // Parsing varian aman
        product.variants = typeof product.variants === 'string' 
            ? JSON.parse(product.variants || '[]') 
            : product.variants;

        res.json(product);
    } catch (error) {
        console.error('Error saat mengambil detail produk:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// POST /api/products/access/:id (Web Utama: Cek Password Lokal)
exports.checkLocalPassword = async (req, res) => {
    const { id } = req.params;
    const { local_password } = req.body;
    const db = req.db;

    if (!local_password) {
        return res.status(400).json({ message: 'Password lokal diperlukan' });
    }

    try {
        const [rows] = await db.query('SELECT local_password FROM products WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Produk tidak ditemukan' });
        }

        const product = rows[0];

        if (!product.local_password) {
            return res.status(400).json({ message: 'Produk ini tidak memerlukan password lokal' });
        }
        
        if (await bcrypt.compare(local_password, product.local_password)) {
            return res.json({ success: true, message: 'Akses berhasil diberikan' });
        } else {
            return res.status(401).json({ success: false, message: 'Password lokal salah' });
        }

    } catch (error) {
        console.error('Error saat cek password lokal:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};


// PUT /api/products/:id (Dashboard)
exports.updateProduct = async (req, res) => {
    if (req.user.role !== 'admin') {
        await cleanupFiles(req.files); 
        return res.status(403).json({ message: 'Akses ditolak.' });
    }
    
    const { id } = req.params;
    const { 
        name, description, price, slug, meta_title, meta_description, 
        variants: variantsJson,
        banner_image_url_keep,
        category_id // <--- Tambahkan ini
    } = req.body; 
    const db = req.db;
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    
    const uploadedBanner = req.files.productBanner ? req.files.productBanner[0] : null;
    const uploadedVariantFiles = req.files.variantImages || [];
    const allUploadedFiles = uploadedBanner ? uploadedVariantFiles.concat(uploadedBanner) : uploadedVariantFiles;
    
    let filesToDelete = []; 
    let totalStock = 0; 

    if (!name || !price || !variantsJson || !slug) {
        await cleanupFiles(allUploadedFiles); 
        return res.status(400).json({ message: 'Data utama tidak boleh kosong.' });
    }

    try {
        const [oldProductRows] = await db.query('SELECT variants, banner_image FROM products WHERE id = ?', [id]);
        if (oldProductRows.length === 0) {
            await cleanupFiles(allUploadedFiles);
            return res.status(404).json({ message: `Produk dengan ID ${id} tidak ditemukan.` });
        }
        const oldVariants = JSON.parse(oldProductRows[0].variants || '[]');
        const oldBannerImage = oldProductRows[0].banner_image;
        
        // Pemrosesan Varian Baru
        let variantsData;
        try {
            variantsData = JSON.parse(variantsJson); 
        } catch (e) {
            await cleanupFiles(allUploadedFiles);
            return res.status(400).json({ message: 'Format data varian tidak valid.' });
        }
        
        let fileIndex = 0;
        
        const finalVariants = variantsData.map((v, index) => {
            const variant = { ...v };
            const oldVariant = oldVariants[index];

            const shouldUpdateImage = variant.isNewImage;

            if (shouldUpdateImage) {
                const newFile = uploadedVariantFiles[fileIndex];
                if (newFile) {
                    if (oldVariant && oldVariant.image) {
                        filesToDelete.push(oldVariant.image);
                    }
                    variant.image = `${baseUrl}/uploads/${newFile.filename}`;
                    fileIndex++; 
                } else {
                    variant.image = (oldVariant && oldVariant.image) ? oldVariant.image : null; 
                }
            } else {
                variant.image = (oldVariant && oldVariant.image) ? oldVariant.image : null;
            }
            
            if (variant.sizes && Array.isArray(variant.sizes)) {
                const stockInVariant = variant.sizes.reduce((sum, s) => sum + Number(s.stock || 0), 0);
                totalStock += stockInVariant;
            } else {
                variant.sizes = []; 
            }

            delete variant.isNewImage; 
            return variant;
        });
        
        // Pemrosesan Banner
        let finalBannerImage = oldBannerImage;
        
        if (uploadedBanner) {
            if (oldBannerImage) {
                filesToDelete.push(oldBannerImage);
            }
            finalBannerImage = `${baseUrl}/uploads/${uploadedBanner.filename}`;
        } else if (banner_image_url_keep === 'DELETE' || !banner_image_url_keep) {
             if (oldBannerImage) {
                filesToDelete.push(oldBannerImage);
             }
             finalBannerImage = null;
        } else if (banner_image_url_keep) {
            finalBannerImage = banner_image_url_keep;
        }
        
        // Update Query Dinamis
        const fields = [];
        const values = [];

        // Masukkan category_id ke updateFields
        const updateFields = {
            name, description, price, slug, meta_title, meta_description, category_id
        };
        
        for (const [key, value] of Object.entries(updateFields)) {
            // Kita izinkan null untuk category_id, tapi hindari undefined
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        fields.push('variants = ?');
        values.push(JSON.stringify(finalVariants));
        
        fields.push('stock = ?'); 
        values.push(totalStock); 

        fields.push('banner_image = ?');
        values.push(finalBannerImage);

        if (fields.length === 0) {
            await cleanupFiles(allUploadedFiles);
            return res.status(400).json({ message: 'Tidak ada data yang dikirim untuk diupdate.' });
        }

        const query = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;
        values.push(id); 

        const [result] = await db.query(query, values);

        if (result.affectedRows === 0) {
            await cleanupFiles(allUploadedFiles);
            return res.status(404).json({ message: `Produk dengan ID ${id} tidak ditemukan.` });
        }
        
        // Cleanup Gambar Lama
        for (const imageUrl of filesToDelete) {
            try {
                const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
                const filePath = path.join(__dirname, '..', 'public', 'uploads', filename); 
                await fs.unlink(filePath);
            } catch (e) {
                console.error(`[UPDATE CLEANUP ERROR]`, e.message);
            }
        }

        res.json({ 
            message: 'Produk berhasil diupdate!', 
            id: id, 
            new_total_stock: totalStock,
            new_banner_image: finalBannerImage
        });

    } catch (error) {
        await cleanupFiles(allUploadedFiles); 
        console.error('Error saat mengupdate produk:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat update produk.' });
    }
};


// DELETE /api/products/:id (Dashboard)
exports.deleteProduct = async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Akses ditolak.' });
    }

    try {
        const [rows] = await db.query('SELECT variants, banner_image FROM products WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: `Produk dengan ID ${id} tidak ditemukan.` });
        }

        const product = rows[0];
        const variants = JSON.parse(product.variants || '[]');
        const bannerImage = product.banner_image;

        const [deleteResult] = await db.query('DELETE FROM products WHERE id = ?', [id]);

        if (deleteResult.affectedRows === 0) {
            return res.status(404).json({ message: `Gagal menghapus produk ID ${id}.` });
        }

        let deletedFilesCount = 0;
        const filesToDelete = [];
        if (bannerImage) filesToDelete.push(bannerImage);
        for (const variant of variants) {
            if (variant.image) {
                filesToDelete.push(variant.image);
            }
        }
        
        for (const imageUrl of filesToDelete) {
            if (imageUrl) {
                const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
                const filePath = path.join(__dirname, '..', 'public', 'uploads', filename);

                try {
                    await fs.unlink(filePath);
                    deletedFilesCount++;
                } catch (e) {
                    console.error(`[DELETE CLEANUP ERROR]`, e.message);
                }
            }
        }

        res.json({ 
            message: 'Produk dan gambar terkait berhasil dihapus.', 
            id: id,
            files_cleaned: deletedFilesCount
        });

    } catch (error) {
        console.error('Error saat menghapus produk:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat menghapus produk.' });
    }
};