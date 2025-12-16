// middleware/apiKeyMiddleware.js

exports.protectApi = (req, res, next) => {
    // API Key harus dikirim melalui header 'X-Api-Key'
    const apiKey = req.header('X-Api-Key'); 
    
    // Ambil kunci rahasia dari file .env
    const requiredKey = process.env.WEB_API_KEY;

    if (!apiKey || apiKey !== requiredKey) {
        // Jika API Key tidak ada atau tidak cocok
        return res.status(401).json({ 
            message: 'Akses ditolak: API Key tidak valid atau hilang.' 
        });
    }

    // Jika API Key valid, lanjutkan ke controller
    next();
};