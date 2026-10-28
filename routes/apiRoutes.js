const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Đăng nhập
router.post('/auth/login', authController.login);

// Gọi món & Thanh toán (Cần token)
router.post('/orders', verifyToken, orderController.createOrder);
router.get('/orders/:orderId/qr', verifyToken, orderController.getPaymentQR);
router.get('/menu', verifyToken, orderController.getAllMenuItems);
router.get('/kitchen/orders', verifyToken, orderController.getKitchenOrders);
router.put('/kitchen/items/:orderItemId', verifyToken, orderController.updateItemStatus);
router.get('/tables/:tableId/bill', verifyToken, orderController.getTableBill);
router.post('/checkout', verifyToken, orderController.checkoutTable);
router.get('/menu/public', orderController.getPublicMenu);
router.post('/orders/public', orderController.createPublicOrder);
module.exports = router;