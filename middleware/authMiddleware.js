const jwt = require('jsonwebtoken');

exports.protect = (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Ambil token dari header "Bearer TOKEN"
            token = req.headers.authorization.split(' ')[1];

            // Verifikasi token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Simpan info user di request (ID dan role)
            req.user = { id: decoded.id, role: decoded.role };

            next(); // Lanjut ke controller
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Tidak diotorisasi, token gagal' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Tidak diotorisasi, tidak ada token' });
    }
};