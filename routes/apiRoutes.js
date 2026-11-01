const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const orderController = require('../controllers/orderController');
const staffController = require('../controllers/staffController');
const shiftController = require('../controllers/shiftController');
const inventoryController = require('../controllers/inventoryController');
const reportController = require('../controllers/reportController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// ========== ĐĂNG NHẬP ==========
router.post('/auth/login', authController.login);

// ========== GỌI MÓN & THANH TOÁN ==========
router.post('/orders', verifyToken, orderController.createOrder);
router.get('/orders/:orderId/qr', verifyToken, orderController.getPaymentQR);
router.get('/menu', verifyToken, orderController.getAllMenuItems);
router.get('/menu/public', orderController.getPublicMenu);
router.post('/orders/public', orderController.createPublicOrder);
router.get('/kitchen/orders', verifyToken, orderController.getKitchenOrders);
router.put('/kitchen/items/:orderItemId', verifyToken, orderController.updateItemStatus);
router.get('/tables/:tableId/bill', verifyToken, orderController.getTableBill);
router.post('/checkout', verifyToken, orderController.checkoutTable);
router.get('/billing/tables', verifyToken, orderController.getBillingTables);
router.get('/billing/table/:tableId', verifyToken, orderController.getTableBillingDetails);
router.post('/billing/checkout', verifyToken, orderController.checkoutBilling);
router.put('/billing/items/:orderItemId/cancel', verifyToken, orderController.cancelOrderItem);

// ========== NHÂN SỰ ==========
router.get('/staff', verifyToken, staffController.getAllStaff);
router.post('/staff', verifyToken, staffController.createStaff);
router.put('/staff/:id/toggle', verifyToken, staffController.toggleStaffStatus);

// ========== KHÁCH HÀNG ==========
router.post('/customer/register', orderController.registerCustomer);
router.post('/customer/login', orderController.loginCustomer);
router.get('/vouchers', verifyToken, orderController.getActiveVouchers);

// ========== QUẢNG CÁO ==========
router.get('/settings/marquee', orderController.getMarqueeText);
router.put('/admin/settings/marquee', verifyToken, orderController.updateMarqueeText);

// ========== VOUCHER ==========
router.get('/admin/vouchers', verifyToken, orderController.getAllVouchers);
router.post('/admin/vouchers', verifyToken, orderController.createVoucher);

// ========== CA LÀM VIỆC ==========
router.post('/shifts/open', verifyToken, shiftController.openShift);
router.get('/shifts/current/:user_id', verifyToken, shiftController.getCurrentShift);
router.post('/shifts/close', verifyToken, shiftController.closeShift);
router.put('/tables/request-payment', verifyToken, shiftController.requestPayment);

// ==========================================
// ========== QUẢN LÝ KHO (CHỈ ADMIN) ==========
// ==========================================

// --- 1. NGUYÊN LIỆU (CRUD) ---
router.get('/inventory', verifyToken, checkRole(['admin']), inventoryController.getAllIngredients);
router.post('/inventory', verifyToken, checkRole(['admin']), inventoryController.createIngredient);
router.put('/inventory/:id', verifyToken, checkRole(['admin']), inventoryController.updateIngredient);
router.delete('/inventory/:id', verifyToken, checkRole(['admin']), inventoryController.deleteIngredient);
router.post('/inventory/import', verifyToken, checkRole(['admin']), inventoryController.importStock);

// --- 2. CÔNG THỨC ĐỊNH LƯỢNG (BOM) ---
router.get('/inventory/recipes', verifyToken, checkRole(['admin']), inventoryController.getAllRecipes);
router.post('/inventory/recipes', verifyToken, checkRole(['admin']), inventoryController.createRecipe);
router.delete('/inventory/recipes/:recipeId', verifyToken, checkRole(['admin']), inventoryController.deleteRecipe);

// --- 3. NHÀ CUNG CẤP & PHIẾU NHẬP KHO ---
router.get('/admin/suppliers', verifyToken, checkRole(['admin']), inventoryController.getAllSuppliers);
router.post('/admin/purchase-orders', verifyToken, checkRole(['admin']), inventoryController.createPurchaseOrder);
router.get('/admin/purchase-orders', verifyToken, checkRole(['admin']), inventoryController.getPurchaseHistory);

// --- 4. CHI TIẾT PHIẾU NHẬP (MỚI — để xem phiếu nhập gồm những gì) ---
router.get('/admin/purchase-orders/:poId', verifyToken, checkRole(['admin']), inventoryController.getPurchaseOrderDetail);

// ==========================================
// ========== BÁO CÁO ==========
// ==========================================
router.get('/admin/reports/monthly', verifyToken, checkRole(['admin']), reportController.exportMonthlyReport);
router.get('/admin/dashboard/stats', verifyToken, orderController.getDashboardStats);

module.exports = router;