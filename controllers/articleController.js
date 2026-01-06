const fs = require('fs/promises');
const path = require('path');

// --- Helpers ---

// Fungsi cleanup file jika error (Sama persis dengan Product)
const cleanupFiles = async (file) => {
    if (!file) return;
    try {
        const filePath = path.join(__dirname, '..', 'public', 'uploads', file.filename);
        await fs.unlink(filePath);
    } catch (e) {
        console.error(`[CLEANUP ERROR] Gagal menghapus file ${file.filename}:`, e);
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

// --- ENDPOINTS ---

// 1. GET Public Articles (List untuk Halaman Blog)
exports.getPublicArticles = async (req, res) => {
    const db = req.db;
    const { search, category } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9; // Blog biasanya 9 grid
    const offset = (page - 1) * limit;

    try {
        let baseQuery = `
            FROM articles a
            LEFT JOIN categories c ON a.category_id = c.id
            WHERE a.status = 'published'
        `;
        
        let conditions = [];
        let queryParams = [];

        if (search) {
            conditions.push('(a.title LIKE ? OR a.excerpt LIKE ?)');
            const keyword = `%${search}%`;
            queryParams.push(keyword, keyword);
        }

        if (category) {
            conditions.push('c.slug = ?');
            queryParams.push(category);
        }

        if (conditions.length > 0) {
            baseQuery += ' AND ' + conditions.join(' AND ');
        }

        // Hitung Total
        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const [countResult] = await db.query(countQuery, queryParams);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Ambil Data (KITA TIDAK AMBIL KOLOM 'content' DISINI AGAR RINGAN)
        const dataQuery = `
            SELECT a.id, a.title, a.slug, a.thumbnail, a.excerpt, a.created_at, 
                   c.name as category_name, c.slug as category_slug
            ${baseQuery}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const dataParams = [...queryParams, limit, offset];
        const [articles] = await db.query(dataQuery, dataParams);

        res.json({
            status: "success",
            data: articles,
            pagination: {
                currentPage: page,
                itemsPerPage: limit,
                totalItems: totalItems,
                totalPages: totalPages
            }
        });

    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// 2. GET Single Article (Detail Postingan)
exports.getArticleDetail = async (req, res) => {
    const db = req.db;
    const { slug } = req.params;

    try {
        const query = `
            SELECT a.*, c.name as category_name, c.slug as category_slug
            FROM articles a
            LEFT JOIN categories c ON a.category_id = c.id
            WHERE a.slug = ? AND a.status = 'published'
        `;
        
        const [rows] = await db.query(query, [slug]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Artikel tidak ditemukan' });
        }

        const article = rows[0];
        
        // Parsing JSON Content agar Frontend langsung terima Object, bukan String
        /*  */
        try {
            // Jika database MySQL kamu versi lama mengembalikan string, kita parse.
            // Jika sudah native JSON, ini mungkin tidak perlu, tapi aman ditambahkan.
            if (typeof article.content === 'string') {
                article.content = JSON.parse(article.content);
            }
        } catch (e) {
            article.content = [];
        }

        res.json({ status: "success", data: article });

    } catch (error) {
        console.error('Error detail article:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// 3. CREATE Article (Admin Dashboard)
exports.createArticle = async (req, res) => {
    const db = req.db;
    
    // Auth Check (Pastikan middleware user terpasang di route)
    if (req.user.role !== 'admin') {
        await cleanupFiles(req.file);
        return res.status(403).json({ message: 'Akses ditolak' });
    }

    const file = req.file; // Thumbnail Image
    const { title, excerpt, content, category_id, status, meta_title, meta_description } = req.body;
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

    // Validasi Sederhana
    if (!title) {
        await cleanupFiles(file);
        return res.status(400).json({ message: 'Judul artikel wajib diisi' });
    }

    try {
        // Generate Slug
        let slug = slugify(title);
        // Cek duplikat slug
        const [existing] = await db.query('SELECT id FROM articles WHERE slug = ?', [slug]);
        if (existing.length > 0) {
            slug = slug + '-' + Date.now(); // Tambah timestamp agar unik
        }

        // Proses Thumbnail URL
        const thumbnailUrl = file ? `${baseUrl}/uploads/${file.filename}` : null;

        // Pastikan Content adalah string JSON yang valid sebelum disimpan
        // (Frontend akan kirim string JSON, atau object yg perlu di-stringify)
        let contentToSave = content;
        if (typeof content === 'object') {
            contentToSave = JSON.stringify(content);
        }

        const query = `
            INSERT INTO articles 
            (title, slug, thumbnail, excerpt, content, status, category_id, meta_title, meta_description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(query, [
            title, slug, thumbnailUrl, excerpt, contentToSave, status || 'draft', category_id || null, meta_title, meta_description
        ]);

        res.status(201).json({ message: 'Artikel berhasil dibuat', slug });

    } catch (error) {
        await cleanupFiles(file);
        console.error('Error create article:', error);
        res.status(500).json({ message: 'Gagal menyimpan artikel' });
    }
};

// 4. UPDATE Article
exports.updateArticle = async (req, res) => {
    const db = req.db;
    const { id } = req.params;
    
    if (req.user.role !== 'admin') {
        await cleanupFiles(req.file);
        return res.status(403).json({ message: 'Akses ditolak' });
    }

    const file = req.file; // Thumbnail Baru (jika ada)
    const { title, excerpt, content, category_id, status, meta_title, meta_description } = req.body;
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

    try {
        // Ambil data lama untuk hapus thumbnail lama jika diganti
        const [oldData] = await db.query('SELECT thumbnail FROM articles WHERE id = ?', [id]);
        if (oldData.length === 0) {
            await cleanupFiles(file);
            return res.status(404).json({ message: 'Artikel tidak ditemukan' });
        }

        let thumbnailUrl = oldData[0].thumbnail;
        
        // Jika ada upload baru, update URL dan hapus file lama
        if (file) {
            thumbnailUrl = `${baseUrl}/uploads/${file.filename}`;
            // Logic hapus file lama (opsional tapi disarankan)
            if (oldData[0].thumbnail) {
                const oldFilename = oldData[0].thumbnail.split('/').pop();
                const oldPath = path.join(__dirname, '..', 'public', 'uploads', oldFilename);
                try { await fs.unlink(oldPath); } catch(e) {} 
            }
        }

        let contentToSave = content;
        if (typeof content === 'object') {
            contentToSave = JSON.stringify(content);
        }

        const query = `
            UPDATE articles SET
            title = ?, excerpt = ?, content = ?, status = ?, 
            category_id = ?, meta_title = ?, meta_description = ?, thumbnail = ?
            WHERE id = ?
        `;

        await db.query(query, [
            title, excerpt, contentToSave, status, category_id, meta_title, meta_description, thumbnailUrl, id
        ]);

        res.json({ message: 'Artikel berhasil diupdate' });

    } catch (error) {
        await cleanupFiles(file);
        console.error('Error update article:', error);
        res.status(500).json({ message: 'Gagal update artikel' });
    }
};

// 5. DELETE Article
exports.deleteArticle = async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Akses ditolak' });

    try {
        // Ambil thumbnail untuk dihapus
        const [rows] = await db.query('SELECT thumbnail FROM articles WHERE id = ?', [id]);
        
        if (rows.length > 0 && rows[0].thumbnail) {
            const filename = rows[0].thumbnail.split('/').pop();
            const filePath = path.join(__dirname, '..', 'public', 'uploads', filename);
            try { await fs.unlink(filePath); } catch(e) {}
        }

        await db.query('DELETE FROM articles WHERE id = ?', [id]);
        res.json({ message: 'Artikel berhasil dihapus' });

    } catch (error) {
        console.error('Error delete article:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// --- KHUSUS: UPLOAD IMAGE UNTUK EDITOR (Block Editor) ---
exports.uploadContentImage = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: 0, message: "No image uploaded" });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

    // Format return JSON ini adalah standar Editor.js
    res.json({
        success: 1,
        file: {
            url: `${baseUrl}/uploads/${req.file.filename}`,
            // optional: width, height, etc
        }
    });
};

// --- TAMBAHAN BARU: List Artikel untuk Dashboard (Semua Status) ---
exports.getDashboardArticles = async (req, res) => {
    const db = req.db;
    const { search, category, status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        let baseQuery = `
            FROM articles a
            LEFT JOIN categories c ON a.category_id = c.id
        `;
        
        let conditions = [];
        let queryParams = [];

        // Filter Search
        if (search) {
            conditions.push('(a.title LIKE ? OR a.excerpt LIKE ?)');
            const keyword = `%${search}%`;
            queryParams.push(keyword, keyword);
        }

        // Filter Category
        if (category) {
            conditions.push('c.slug = ?');
            queryParams.push(category);
        }

        // Filter Status (Draft/Published)
        if (status) {
            conditions.push('a.status = ?');
            queryParams.push(status);
        }

        // Gabung WHERE
        if (conditions.length > 0) {
            baseQuery += ' WHERE ' + conditions.join(' AND ');
        }

        // Hitung Total
        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const [countResult] = await db.query(countQuery, queryParams);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Ambil Data
        const dataQuery = `
            SELECT a.id, a.title, a.slug, a.thumbnail, a.status, a.created_at, a.excerpt,
                   c.name as category_name 
            ${baseQuery}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const dataParams = [...queryParams, limit, offset];
        const [articles] = await db.query(dataQuery, dataParams);

        res.json({
            status: "success",
            data: articles,
            pagination: {
                currentPage: page,
                itemsPerPage: limit,
                totalItems: totalItems,
                totalPages: totalPages
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard articles:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// --- TAMBAHAN: Get Article By ID (Untuk Edit di Dashboard) ---
exports.getArticleById = async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    try {
        const [rows] = await db.query('SELECT * FROM articles WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Artikel tidak ditemukan' });
        }

        const article = rows[0];

        // Parsing JSON Content agar Frontend tidak menerima string
        try {
            if (typeof article.content === 'string') {
                article.content = JSON.parse(article.content);
            }
        } catch (e) {
            article.content = [];
        }

        res.json({ status: "success", data: article });
    } catch (error) {
        console.error('Error get article by id:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};