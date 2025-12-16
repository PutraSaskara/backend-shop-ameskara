const express = require('express');
const { loginUser, registerAdmin } = require('../controllers/authController');
const router = express.Router();

// Route: POST /api/auth/login
// Deskripsi: Untuk login dashboard, mengembalikan JWT
router.post('/login', loginUser);

// Route: POST /api/auth/register
// Deskripsi: Untuk mendaftar user awal (HANYA UNTUK SETUP!)
router.post('/register', registerAdmin); 

module.exports = router;