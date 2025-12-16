const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Helper untuk generate Token
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: '1d', // Token berlaku 1 hari
    });
};

exports.loginUser = async (req, res) => {
    const { username, password } = req.body;
    const db = req.db; // Ambil koneksi DB dari request

    try {
        // Cari user di database
        const [rows] = await db.query('SELECT id, username, password, role FROM users WHERE username = ?', [username]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Username atau password salah' });
        }

        const user = rows[0];

        // Bandingkan password yang diinput dengan hash di DB
        if (user && (await bcrypt.compare(password, user.password))) {
            // Login berhasil
            res.json({
                id: user.id,
                username: user.username,
                role: user.role,
                token: generateToken(user.id, user.role), // Kirim token
            });
        } else {
            // Password salah
            res.status(401).json({ message: 'Username atau password salah' });
        }
    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// Fungsi sederhana untuk register Admin Awal (HANYA UNTUK SETUP)
exports.registerAdmin = async (req, res) => {
    const { username, password } = req.body;
    const db = req.db;

    try {
        // Cek apakah username sudah ada
        const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Username sudah terdaftar' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Simpan user baru (role: admin)
        const [result] = await db.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, 'admin']);

        res.status(201).json({ 
            id: result.insertId, 
            username, 
            role: 'admin',
            message: 'Registrasi admin berhasil'
        });
    } catch (error) {
        console.error('Error saat registrasi:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};