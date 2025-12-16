// controllers/categoryController.js

// 1. Ambil Semua Kategori (Untuk Dropdown di Dashboard & Filter di Frontend)
exports.getAllCategories = async (req, res) => {
    const db = req.db;
    try {
        const [categories] = await db.query('SELECT * FROM categories ORDER BY name ASC');
        res.json(categories);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 2. Tambah Kategori Baru (Untuk Dashboard Admin)
exports.createCategory = async (req, res) => {
    const db = req.db;
    const { name } = req.body;

    if (!name) return res.status(400).json({ message: "Nama kategori wajib diisi" });

    try {
        // Buat slug otomatis dari nama (Contoh: "Baju Kemeja" -> "baju-kemeja")
        const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

        await db.query('INSERT INTO categories (name, slug) VALUES (?, ?)', [name, slug]);
        
        res.status(201).json({ message: "Kategori berhasil dibuat" });
    } catch (error) {
        console.error("Error creating category:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: "Kategori sudah ada" });
        }
        res.status(500).json({ message: "Server Error" });
    }
};

// 3. Hapus Kategori
exports.deleteCategory = async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    // (Opsional) Cek otentikasi admin di sini jika belum ada di middleware route
    // if (req.user.role !== 'admin') return res.status(403).json(...)

    try {
        const [result] = await db.query('DELETE FROM categories WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Kategori tidak ditemukan" });
        }

        res.json({ message: "Kategori berhasil dihapus" });
    } catch (error) {
        console.error("Error delete category:", error);
        res.status(500).json({ message: "Server Error" });
    }
};