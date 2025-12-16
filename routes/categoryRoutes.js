// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

router.get('/', categoryController.getAllCategories);
router.post('/', categoryController.createCategory); // Nanti tambahkan middleware auth admin disini
// routes/categoryRoutes.js
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;