// const db = require('../config/db');
// const { generateVietQRUrl } = require('../utils/vietqr');
// const bcrypt = require('bcrypt');
//
// // HẰNG SỐ & HÀM DÙNG CHUNG
// const POINT_VALUE = 10000;
// const POINT_EARN_STEP = 100000;
// const PAYMENT_METHODS = ['cash', 'vietqr'];
// const ITEM_STATUSES = ['pending', 'cooking', 'served', 'cancelled'];
//
// const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
//
// async function placeOrder(connection, { table_id, customer_id, items }) {
//     if (!table_id || !Array.isArray(items) || items.length === 0) {
//         throw badRequest('Thiếu bàn hoặc danh sách món');
//     }
//     const [tableRows] = await connection.query('SELECT table_id FROM tables WHERE table_id = ?', [table_id]);
//     if (tableRows.length === 0) throw badRequest('Bàn không tồn tại');
//
//     const [open] = await connection.query(
//         `SELECT order_id, customer_id FROM orders
//          WHERE table_id = ? AND order_status NOT IN ('paid','cancelled')
//          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
//         [table_id]
//     );
//
//     let orderId;
//     if (open.length > 0) {
//         orderId = open[0].order_id;
//         if (customer_id && !open[0].customer_id) {
//             await connection.query('UPDATE orders SET customer_id = ? WHERE order_id = ?', [customer_id, orderId]);
//         }
//     } else {
//         const [created] = await connection.query(
//             'INSERT INTO orders (table_id, customer_id, order_status) VALUES (?, ?, "pending")',
//             [table_id, customer_id || null]
//         );
//         orderId = created.insertId;
//     }
//
//     const newItemIds = [];
//     for (const item of items) {
//         const qty = parseInt(item.quantity, 10);
//         if (!(qty >= 1)) throw badRequest('Số lượng món không hợp lệ');
//
//         const [menu] = await connection.query('SELECT * FROM menu_items WHERE item_id = ?', [item.item_id]);
//         if (menu.length === 0) throw badRequest(`Món ${item.item_id} không tồn tại`);
//
//         const wantsLarge = item.size === 'large' || item.portion === 'large';
//         const price = wantsLarge && menu[0].large_price ? menu[0].large_price : menu[0].price;
//
//         const [inserted] = await connection.query(
//             'INSERT INTO order_items (order_id, item_id, quantity, item_price, note) VALUES (?, ?, ?, ?, ?)',
//             [orderId, item.item_id, qty, price, item.note || '']
//         );
//         newItemIds.push(inserted.insertId);
//     }
//
//     await connection.query(
//         `UPDATE orders SET total_amount = (
//             SELECT COALESCE(SUM(item_price * quantity), 0) FROM order_items
//             WHERE order_id = ? AND item_status != 'cancelled'
//          ) WHERE order_id = ?`,
//         [orderId, orderId]
//     );
//     await connection.query('UPDATE tables SET status = "occupied" WHERE table_id = ?', [table_id]);
//
//     const [[orderRow]] = await connection.query('SELECT total_amount FROM orders WHERE order_id = ?', [orderId]);
//     return { orderId, newItemIds, total: orderRow.total_amount };
// }
//
// async function emitNewOrder(req, connection, { orderId, tableId, newItemIds, total }) {
//     try {
//         const [tableInfo] = await connection.query('SELECT table_number FROM tables WHERE table_id = ?', [tableId]);
//         const [orderDetails] = await connection.query(
//             `SELECT oi.*, m.name AS item_name
//              FROM order_items oi
//              JOIN menu_items m ON oi.item_id = m.item_id
//              WHERE oi.order_item_id IN (?)`,
//             [newItemIds]
//         );
//         const io = req.app.get('socketio');
//         io.emit('new_order', { orderId, tableName: tableInfo[0].table_number, items: orderDetails, total });
//     } catch (err) {
//         console.log("LỖI GỬI THÔNG BÁO ĐƠN MỚI:", err);
//     }
// }
//
// // 1. GỌI MÓN
// exports.createOrder = async (req, res) => {
//     const { table_id, items } = req.body;
//     const connection = await db.getConnection();
//     try {
//         await connection.beginTransaction();
//         const { orderId, newItemIds, total } = await placeOrder(connection, { table_id, items });
//         await connection.commit();
//         await emitNewOrder(req, connection, { orderId, tableId: table_id, newItemIds, total });
//         res.status(201).json({ message: 'Gọi món thành công', orderId, total });
//     } catch (error) {
//         console.log("LỖI TẠO ĐƠN HÀNG:", error);
//         await connection.rollback();
//         res.status(error.status || 500).json({ message: 'Lỗi gọi món', error: error.message });
//     } finally {
//         connection.release();
//     }
// };
//
// exports.createPublicOrder = async (req, res) => {
//     const { table_id, items, customer_id } = req.body;
//     const connection = await db.getConnection();
//     try {
//         await connection.beginTransaction();
//         const { orderId, newItemIds, total } = await placeOrder(connection, { table_id, customer_id, items });
//         await connection.commit();
//         await emitNewOrder(req, connection, { orderId, tableId: table_id, newItemIds, total });
//         res.status(201).json({ message: 'Thành công', orderId });
//     } catch (error) {
//         console.log("LỖI TẠO ĐƠN PUBLIC:", error);
//         await connection.rollback();
//         res.status(error.status || 500).json({ message: 'Lỗi', error: error.message });
//     } finally {
//         connection.release();
//     }
// };
//
// // 2. MÃ QR THANH TOÁN
// exports.getPaymentQR = async (req, res) => {
//     try {
//         const [order] = await db.query('SELECT total_amount FROM orders WHERE order_id = ?', [req.params.orderId]);
//         if (order.length === 0) return res.status(404).json({ message: 'Không thấy đơn' });
//         const qrUrl = generateVietQRUrl(order[0].total_amount, req.params.orderId);
//         res.json({ qrUrl, amount: order[0].total_amount });
//     } catch (error) {
//         console.log("LỖI TẠO QR:", error);
//         res.status(500).json({ message: 'Lỗi tạo QR' });
//     }
// };
//
// // 3. THỰC ĐƠN
// const MENU_QUERY = `
//     SELECT m.*, c.category_name
//     FROM menu_items m
//     LEFT JOIN categories c ON m.category_id = c.category_id
//     WHERE m.is_available = 1
// `;
//
// exports.getAllMenuItems = async (req, res) => {
//     try {
//         const [items] = await db.query(MENU_QUERY);
//         res.json(items);
//     } catch (error) {
//         console.log("LỖI LẤY THỰC ĐƠN:", error);
//         res.status(500).json({ message: 'Lỗi lấy thực đơn', error: error.message });
//     }
// };
//
// exports.getPublicMenu = async (req, res) => {
//     try {
//         const [items] = await db.query(MENU_QUERY);
//         res.json(items);
//     } catch (error) {
//         console.log("LỖI LẤY MENU PUBLIC:", error);
//         res.status(500).json({ message: 'Lỗi' });
//     }
// };
//
// // MODULE KDS (BẾP)
// exports.getKitchenOrders = async (req, res) => {
//     try {
//         const query = `
//             SELECT o.order_id, t.table_number, o.created_at,
//                    oi.order_item_id, oi.quantity, oi.item_status, oi.note,
//                    m.name AS item_name
//             FROM orders o
//             JOIN tables t ON o.table_id = t.table_id
//             JOIN order_items oi ON o.order_id = oi.order_id
//             JOIN menu_items m ON oi.item_id = m.item_id
//             WHERE oi.item_status IN ('pending', 'cooking')
//             ORDER BY o.created_at ASC, oi.order_item_id ASC
//         `;
//         const [rows] = await db.query(query);
//         res.json(rows);
//     } catch (error) {
//         console.log("LỖI LẤY ĐƠN BẾP:", error);
//         res.status(500).json({ message: 'Lỗi lấy đơn bếp', error: error.message });
//     }
// };
//
// exports.updateItemStatus = async (req, res) => {
//     const { orderItemId } = req.params;
//     const { status } = req.body;
//     if (!ITEM_STATUSES.includes(status)) {
//         return res.status(400).json({ message: 'Trạng thái món không hợp lệ' });
//     }
//     try {
//         const [result] = await db.query('UPDATE order_items SET item_status = ? WHERE order_item_id = ?', [status, orderItemId]);
//         if (result.affectedRows === 0) return res.status(404).json({ message: 'Không tìm thấy món' });
//         const io = req.app.get('socketio');
//         io.emit('item_status_updated', { orderItemId, status });
//         res.json({ message: 'Cập nhật thành công' });
//     } catch (error) {
//         console.log("LỖI CẬP NHẬT TRẠNG THÁI MÓN:", error);
//         res.status(500).json({ message: 'Lỗi cập nhật', error: error.message });
//     }
// };
//
// // MODULE THANH TOÁN CƠ BẢN
// exports.getTableBill = async (req, res) => {
//     const { tableId } = req.params;
//     try {
//         const [orders] = await db.query(
//             'SELECT * FROM orders WHERE table_id = ? AND order_status NOT IN ("paid","cancelled") ORDER BY created_at DESC LIMIT 1',
//             [tableId]
//         );
//         if (orders.length === 0) return res.status(404).json({ message: 'Bàn này chưa có đơn hàng nào!' });
//         const order = orders[0];
//         const [items] = await db.query(`
//             SELECT oi.*, m.name AS item_name
//             FROM order_items oi
//             JOIN menu_items m ON oi.item_id = m.item_id
//             WHERE oi.order_id = ?
//         `, [order.order_id]);
//         res.json({ order, items });
//     } catch (error) {
//         console.log("LỖI LẤY HÓA ĐƠN CƠ BẢN:", error);
//         res.status(500).json({ message: 'Lỗi lấy hóa đơn', error: error.message });
//     }
// };
//
// exports.checkoutTable = async (req, res) => {
//     const { tableId, orderId, paymentMethod } = req.body;
//     if (!PAYMENT_METHODS.includes(paymentMethod)) {
//         return res.status(400).json({ message: 'Hình thức thanh toán không hợp lệ' });
//     }
//     const connection = await db.getConnection();
//     try {
//         await connection.beginTransaction();
//         const [orderInfo] = await connection.query('SELECT total_amount FROM orders WHERE order_id = ?', [orderId]);
//         if (orderInfo.length === 0) throw badRequest('Không tìm thấy đơn hàng');
//         await connection.query(
//             'INSERT INTO payments (order_id, amount, payment_method) VALUES (?, ?, ?)',
//             [orderId, orderInfo[0].total_amount, paymentMethod]
//         );
//         await connection.query('UPDATE orders SET order_status = "paid" WHERE order_id = ?', [orderId]);
//         await connection.query('UPDATE tables SET status = "available" WHERE table_id = ?', [tableId]);
//         await connection.commit();
//         res.json({ message: 'Thanh toán thành công!' });
//     } catch (error) {
//         console.log("LỖI THANH TOÁN CƠ BẢN:", error);
//         await connection.rollback();
//         res.status(error.status || 500).json({ message: 'Lỗi thanh toán', error: error.message });
//     } finally {
//         connection.release();
//     }
// };
//
// // MODULE THU NGÂN (BILLING)
// exports.getBillingTables = async (req, res) => {
//     try {
//         const query = `
//             SELECT t.*,
//                    (SELECT SUM(oi.item_price * oi.quantity)
//                     FROM orders o
//                     JOIN order_items oi ON o.order_id = oi.order_id
//                     WHERE o.table_id = t.table_id
//                       AND o.order_status NOT IN ('paid','cancelled')
//                       AND oi.item_status != 'cancelled') AS current_total
//             FROM tables t
//             ORDER BY t.table_number
//         `;
//         const [tables] = await db.query(query);
//         res.json(tables);
//     } catch (error) {
//         console.log("LỖI LẤY DANH SÁCH BÀN THU NGÂN:", error);
//         res.status(500).json({ error: 'Lỗi lấy danh sách bàn' });
//     }
// };
//
// exports.getTableBillingDetails = async (req, res) => {
//     const { tableId } = req.params;
//     try {
//         const [items] = await db.query(`
//             SELECT oi.*, m.name AS item_name, m.vat_rate,
//                    c.full_name AS customer_name, c.phone AS customer_phone, c.points,
//                    o.customer_id, o.order_id, o.created_at
//             FROM orders o
//             JOIN order_items oi ON oi.order_id = o.order_id
//             JOIN menu_items m ON oi.item_id = m.item_id
//             LEFT JOIN customers c ON o.customer_id = c.customer_id
//             WHERE o.table_id = ?
//               AND o.order_status NOT IN ('paid','cancelled')
//               AND oi.item_status != 'cancelled'
//             ORDER BY o.created_at ASC, oi.order_item_id ASC
//         `, [tableId]);
//
//         if (items.length === 0) {
//             return res.status(404).json({ error: 'Bàn này chưa có đơn hàng nào cần thanh toán!' });
//         }
//         res.json(items);
//     } catch (error) {
//         console.log("LỖI LẤY CHI TIẾT HÓA ĐƠN (getTableBillingDetails):", error);
//         res.status(500).json({ error: 'Lỗi lấy chi tiết hóa đơn', details: error.message });
//     }
// };
//
// exports.checkoutBilling = async (req, res) => {
//     const { table_id, payment_method, points_used } = req.body;
//     if (!table_id) return res.status(400).json({ error: 'Thiếu mã bàn' });
//     if (!PAYMENT_METHODS.includes(payment_method)) {
//         return res.status(400).json({ error: 'Hình thức thanh toán không hợp lệ' });
//     }
//
//     const connection = await db.getConnection();
//     try {
//         await connection.beginTransaction();
//
//         const [orders] = await connection.query(
//             `SELECT order_id, customer_id FROM orders
//              WHERE table_id = ? AND order_status NOT IN ('paid','cancelled') FOR UPDATE`,
//             [table_id]
//         );
//         if (orders.length === 0) throw badRequest('Không tìm thấy đơn hàng chưa thanh toán!');
//
//         let customerId = null;
//         let subTotalAll = 0;
//         const bills = [];
//         for (const order of orders) {
//             if (order.customer_id) customerId = order.customer_id;
//             const [lines] = await connection.query(
//                 `SELECT oi.item_id, oi.quantity, oi.item_price, m.vat_rate
//                  FROM order_items oi
//                  JOIN menu_items m ON m.item_id = oi.item_id
//                  WHERE oi.order_id = ? AND oi.item_status != 'cancelled'`,
//                 [order.order_id]
//             );
//             let sub = 0;
//             let vat = 0;
//             for (const l of lines) {
//                 const lineTotal = Number(l.item_price) * l.quantity;
//                 sub += lineTotal;
//                 vat += (lineTotal * Number(l.vat_rate)) / 100;
//             }
//             subTotalAll += sub;
//             bills.push({ orderId: order.order_id, sub, vat: Math.round(vat), lines });
//         }
//         if (subTotalAll === 0) throw badRequest('Bàn này không còn món nào cần thanh toán!');
//
//         let pointsApplied = 0;
//         if (customerId) {
//             const [[cust]] = await connection.query(
//                 'SELECT points FROM customers WHERE customer_id = ? FOR UPDATE', [customerId]
//             );
//             const totalBefore = bills.reduce((s, b) => s + b.sub + b.vat, 0);
//             const maxUsable = Math.min(Number(cust.points) || 0, Math.floor(totalBefore / POINT_VALUE));
//             pointsApplied = Math.max(0, Math.min(parseInt(points_used, 10) || 0, maxUsable));
//         }
//         let discountLeft = pointsApplied * POINT_VALUE;
//
//         let totalPaid = 0;
//         for (const b of bills) {
//             const orderTotal = b.sub + b.vat;
//             const discount = Math.min(discountLeft, orderTotal);
//             discountLeft -= discount;
//             const amountPaid = orderTotal - discount;
//             totalPaid += amountPaid;
//
//             await connection.query('UPDATE orders SET order_status = "paid", total_amount = ? WHERE order_id = ?', [b.sub, b.orderId]);
//             await connection.query('UPDATE order_items SET item_status = "served" WHERE order_id = ? AND item_status != "cancelled"', [b.orderId]);
//             await connection.query(
//                 'INSERT INTO payments (order_id, amount, payment_method) VALUES (?, ?, ?)',
//                 [b.orderId, amountPaid, payment_method]
//             );
//
//             for (const l of b.lines) {
//                 const [recipes] = await connection.query('SELECT ingredient_id, amount_needed FROM menu_recipes WHERE item_id = ?', [l.item_id]);
//                 for (const r of recipes) {
//                     await connection.query(
//                         'UPDATE ingredients SET stock_quantity = stock_quantity - ? WHERE ingredient_id = ?',
//                         [r.amount_needed * l.quantity, r.ingredient_id]
//                     );
//                 }
//             }
//         }
//
//         await connection.query('UPDATE tables SET status = "available" WHERE table_id = ?', [table_id]);
//
//         if (customerId) {
//             const earned = Math.floor(subTotalAll / POINT_EARN_STEP);
//             await connection.query(
//                 'UPDATE customers SET points = points - ? + ? WHERE customer_id = ?',
//                 [pointsApplied, earned, customerId]
//             );
//         }
//
//         await connection.commit();
//         res.json({ message: 'Thanh toán thành công!', paid: totalPaid });
//     } catch (error) {
//         console.log("LỖI THANH TOÁN BILLING (checkoutBilling):", error);
//         await connection.rollback();
//         res.status(error.status || 500).json({ error: error.message });
//     } finally {
//         connection.release();
//     }
// };
//
// exports.cancelOrderItem = async (req, res) => {
//     const { orderItemId } = req.params;
//     const connection = await db.getConnection();
//     try {
//         await connection.beginTransaction();
//
//         const [rows] = await connection.query(
//             `SELECT oi.order_id, oi.item_status, o.table_id
//              FROM order_items oi
//              JOIN orders o ON o.order_id = oi.order_id
//              WHERE oi.order_item_id = ? FOR UPDATE`,
//             [orderItemId]
//         );
//         if (rows.length === 0) throw Object.assign(new Error('Không tìm thấy món'), { status: 404 });
//         if (rows[0].item_status === 'cancelled') throw badRequest('Món này đã được hủy');
//         const { order_id: orderId, table_id: tableId } = rows[0];
//
//         await connection.query('UPDATE order_items SET item_status = "cancelled" WHERE order_item_id = ?', [orderItemId]);
//         await connection.query(
//             `UPDATE orders SET total_amount = (
//                 SELECT COALESCE(SUM(item_price * quantity), 0) FROM order_items
//                 WHERE order_id = ? AND item_status != 'cancelled'
//              ) WHERE order_id = ?`,
//             [orderId, orderId]
//         );
//
//         const [[left]] = await connection.query(
//             `SELECT COUNT(*) AS n
//              FROM order_items oi
//              JOIN orders o ON o.order_id = oi.order_id
//              WHERE o.table_id = ? AND o.order_status NOT IN ('paid','cancelled') AND oi.item_status != 'cancelled'`,
//             [tableId]
//         );
//         if (Number(left.n) === 0) {
//             await connection.query(
//                 'UPDATE orders SET order_status = "cancelled", total_amount = 0 WHERE table_id = ? AND order_status NOT IN ("paid","cancelled")',
//                 [tableId]
//             );
//             await connection.query('UPDATE tables SET status = "available" WHERE table_id = ?', [tableId]);
//         }
//
//         await connection.commit();
//
//         try {
//             req.app.get('socketio').emit('item_status_updated', { orderItemId, status: 'cancelled' });
//         } catch (err) {
//             console.log("LỖI GỬI SOCKET HỦY MÓN:", err);
//         }
//         res.json({ message: 'Đã hủy món' });
//     } catch (error) {
//         console.log("LỖI HỦY MÓN:", error);
//         await connection.rollback();
//         res.status(error.status || 500).json({ error: error.message });
//     } finally {
//         connection.release();
//     }
// };
//
// // MODULE KHÁCH HÀNG & VOUCHER
// exports.registerCustomer = async (req, res) => {
//     const { phone, full_name, password } = req.body;
//     if (!phone || !full_name || !password) {
//         return res.status(400).json({ error: 'Vui lòng nhập đủ số điện thoại, họ tên và mật khẩu!' });
//     }
//     if (String(password).length < 6) {
//         return res.status(400).json({ error: 'Mật khẩu cần ít nhất 6 ký tự!' });
//     }
//     try {
//         const [existing] = await db.query('SELECT customer_id FROM customers WHERE phone = ?', [phone]);
//         if (existing.length > 0) return res.status(400).json({ error: 'Số điện thoại đã được đăng ký!' });
//
//         const salt = await bcrypt.genSalt(10);
//         const hashedPassword = await bcrypt.hash(password, salt);
//
//         const [result] = await db.query(
//             'INSERT INTO customers (phone, full_name, password, points) VALUES (?, ?, ?, 0)',
//             [phone, full_name, hashedPassword]
//         );
//
//         res.status(201).json({ message: 'Đăng ký thành công!', customer: { id: result.insertId, phone, full_name, points: 0 } });
//     } catch (error) {
//         console.log("LỖI ĐĂNG KÝ KHÁCH HÀNG:", error);
//         res.status(500).json({ error: 'Lỗi đăng ký khách hàng' });
//     }
// };
//
// exports.loginCustomer = async (req, res) => {
//     const { phone, password } = req.body;
//     if (!phone || !password) {
//         return res.status(400).json({ error: 'Vui lòng nhập số điện thoại và mật khẩu!' });
//     }
//     try {
//         const [customers] = await db.query('SELECT * FROM customers WHERE phone = ?', [phone]);
//         if (customers.length === 0) return res.status(404).json({ error: 'Số điện thoại chưa đăng ký!' });
//
//         const customer = customers[0];
//         if (!customer.password) {
//             return res.status(401).json({ error: 'Tài khoản này chưa có mật khẩu, vui lòng liên hệ quầy để được hỗ trợ!' });
//         }
//         const validPass = await bcrypt.compare(password, customer.password);
//         if (!validPass) return res.status(401).json({ error: 'Mật khẩu không đúng!' });
//
//         res.json({
//             message: 'Đăng nhập thành công!',
//             customer: { id: customer.customer_id, phone: customer.phone, full_name: customer.full_name, points: customer.points }
//         });
//     } catch (error) {
//         console.log("LỖI ĐĂNG NHẬP KHÁCH HÀNG:", error);
//         res.status(500).json({ error: 'Lỗi đăng nhập' });
//     }
// };
//
// exports.getActiveVouchers = async (req, res) => {
//     try {
//         const [vouchers] = await db.query('SELECT * FROM vouchers WHERE is_active = 1');
//         res.json(vouchers);
//     } catch (error) {
//         console.log("LỖI LẤY VOUCHER:", error);
//         res.status(500).json({ error: 'Lỗi lấy voucher' });
//     }
// };
//
// exports.getAllVouchers = async (req, res) => {
//     try {
//         const [vouchers] = await db.query('SELECT * FROM vouchers');
//         res.json(vouchers);
//     } catch (error) {
//         console.log("LỖI LẤY TẤT CẢ VOUCHER:", error);
//         res.status(500).json({ error: 'Lỗi' });
//     }
// };
//
// exports.createVoucher = async (req, res) => {
//     const { code, discount_percent, min_order_value } = req.body;
//     const percent = parseInt(discount_percent, 10);
//     if (!code || !(percent >= 1 && percent <= 100)) {
//         return res.status(400).json({ error: 'Mã voucher hoặc phần trăm giảm (1 đến 100) không hợp lệ' });
//     }
//     try {
//         await db.query(
//             'INSERT INTO vouchers (code, discount_percent, min_order_value) VALUES (?, ?, ?)',
//             [code, percent, min_order_value || 0]
//         );
//         res.status(201).json({ message: 'Tạo voucher thành công' });
//     } catch (error) {
//         console.log("LỖI TẠO VOUCHER:", error);
//         res.status(500).json({ error: 'Lỗi tạo voucher' });
//     }
// };
//
// exports.getMarqueeText = async (req, res) => {
//     try {
//         const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = "marquee_text"');
//         res.json({ text: rows.length > 0 ? rows[0].setting_value : '' });
//     } catch (error) {
//         console.log("LỖI LẤY QUẢNG CÁO:", error);
//         res.status(500).json({ error: 'Lỗi lấy quảng cáo' });
//     }
// };
//
// exports.updateMarqueeText = async (req, res) => {
//     const { text } = req.body;
//     try {
//         await db.query('UPDATE settings SET setting_value = ? WHERE setting_key = "marquee_text"', [text]);
//         res.json({ message: 'Đã cập nhật quảng cáo' });
//     } catch (error) {
//         console.log("LỖI CẬP NHẬT QUẢNG CÁO:", error);
//         res.status(500).json({ error: 'Lỗi cập nhật quảng cáo' });
//     }
// };
//
// // MODULE DASHBOARD (THỐNG KÊ)
// exports.getDashboardStats = async (req, res) => {
//     try {
//         // 1. Tổng doanh thu (chỉ tính đơn đã thanh toán)
//         const [revenue] = await db.query(
//             'SELECT COALESCE(SUM(amount), 0) as total FROM payments'
//         );
//
//         // 2. Tổng số đơn hàng
//         const [orders] = await db.query('SELECT COUNT(*) as total FROM orders');
//
//         // 3. Tổng số khách hàng
//         const [customers] = await db.query('SELECT COUNT(*) as total FROM customers');
//
//         // 4. Số món đang nấu (item_status = 'cooking')
//         const [cooking] = await db.query(
//             "SELECT COUNT(*) as total FROM order_items WHERE item_status = 'cooking'"
//         );
//
//         // 5. 10 đơn hàng gần nhất
//         const [recentOrders] = await db.query(`
//             SELECT o.order_id, t.table_number, o.total_amount, o.order_status, o.created_at
//             FROM orders o
//             JOIN tables t ON o.table_id = t.table_id
//             ORDER BY o.created_at DESC
//             LIMIT 10
//         `);
//
//         res.json({
//             totalRevenue: Number(revenue[0].total),
//             totalOrders: orders[0].total,
//             totalCustomers: customers[0].total,
//             cookingItems: cooking[0].total,
//             recentOrders: recentOrders
//         });
//     } catch (error) {
//         console.log("LỖI LẤY DASHBOARD STATS:", error);
//         res.status(500).json({ message: 'Lỗi lấy thống kê', error: error.message });
//     }
// };
//
// // MODULE QUẢN LÝ ĐƠN HÀNG (DÀNH CHO THU NGÂN/PHỤC VỤ)
// // Lấy tất cả đơn hàng đang hoạt động (chưa thanh toán, chưa hủy)
// exports.getActiveOrders = async (req, res) => {
//     try {
//         const query = `
//             SELECT o.order_id, t.table_number, o.total_amount, o.order_status, o.created_at
//             FROM orders o
//             JOIN tables t ON o.table_id = t.table_id
//             WHERE o.order_status NOT IN ('paid', 'cancelled')
//             ORDER BY o.created_at DESC
//         `;
//         const [rows] = await db.query(query);
//         res.json(rows);
//     } catch (error) {
//         console.log("LỖI LẤY ĐƠN ACTIVE:", error);
//         res.status(500).json({ error: 'Lỗi lấy danh sách đơn' });
//     }
// };
//
// // Lấy chi tiết 1 đơn hàng (để xem món nào đang nấu, món nào xong)
// exports.getOrderDetail = async (req, res) => {
//     const { orderId } = req.params;
//     try {
//         const [orderInfo] = await db.query('SELECT * FROM orders WHERE order_id = ?', [orderId]);
//         if (orderInfo.length === 0) return res.status(404).json({ error: 'Không thấy đơn' });
//
//         const [items] = await db.query(`
//             SELECT oi.*, m.name AS item_name
//             FROM order_items oi
//             JOIN menu_items m ON oi.item_id = m.item_id
//             WHERE oi.order_id = ?
//         `, [orderId]);
//
//         res.json({ order: orderInfo[0], items });
//     } catch (error) {
//         console.log("LỖI LẤY CHI TIẾT ĐƠN:", error);
//         res.status(500).json({ error: 'Lỗi lấy chi tiết đơn' });
//     }
// };

const db = require('../config/db');
const { generateVietQRUrl } = require('../utils/vietqr');
const bcrypt = require('bcrypt');

// HẰNG SỐ & HÀM DÙNG CHUNG
const POINT_VALUE = 10000;
const POINT_EARN_STEP = 100000;
const PAYMENT_METHODS = ['cash', 'vietqr'];
const ITEM_STATUSES = ['pending', 'cooking', 'served', 'cancelled'];

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

async function placeOrder(connection, { table_id, customer_id, items }) {
    if (!table_id || !Array.isArray(items) || items.length === 0) {
        throw badRequest('Thiếu bàn hoặc danh sách món');
    }
    const [tableRows] = await connection.query('SELECT table_id FROM tables WHERE table_id = ?', [table_id]);
    if (tableRows.length === 0) throw badRequest('Bàn không tồn tại');

    const [open] = await connection.query(
        `SELECT order_id, customer_id FROM orders
         WHERE table_id = ? AND order_status NOT IN ('paid','cancelled')
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [table_id]
    );

    let orderId;
    if (open.length > 0) {
        orderId = open[0].order_id;
        if (customer_id && !open[0].customer_id) {
            await connection.query('UPDATE orders SET customer_id = ? WHERE order_id = ?', [customer_id, orderId]);
        }
    } else {
        const [created] = await connection.query(
            'INSERT INTO orders (table_id, customer_id, order_status) VALUES (?, ?, "pending")',
            [table_id, customer_id || null]
        );
        orderId = created.insertId;
    }

    const newItemIds = [];
    for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        if (!(qty >= 1)) throw badRequest('Số lượng món không hợp lệ');

        const [menu] = await connection.query('SELECT * FROM menu_items WHERE item_id = ?', [item.item_id]);
        if (menu.length === 0) throw badRequest(`Món ${item.item_id} không tồn tại`);

        const wantsLarge = item.size === 'large' || item.portion === 'large';
        const price = wantsLarge && menu[0].large_price ? menu[0].large_price : menu[0].price;

        const [inserted] = await connection.query(
            'INSERT INTO order_items (order_id, item_id, quantity, item_price, note) VALUES (?, ?, ?, ?, ?)',
            [orderId, item.item_id, qty, price, item.note || '']
        );
        newItemIds.push(inserted.insertId);
    }

    await connection.query(
        `UPDATE orders SET total_amount = (
            SELECT COALESCE(SUM(item_price * quantity), 0) FROM order_items
            WHERE order_id = ? AND item_status != 'cancelled'
         ) WHERE order_id = ?`,
        [orderId, orderId]
    );
    await connection.query('UPDATE tables SET status = "occupied" WHERE table_id = ?', [table_id]);

    const [[orderRow]] = await connection.query('SELECT total_amount FROM orders WHERE order_id = ?', [orderId]);
    return { orderId, newItemIds, total: orderRow.total_amount };
}

async function emitNewOrder(req, connection, { orderId, tableId, newItemIds, total }) {
    try {
        const [tableInfo] = await connection.query('SELECT table_number FROM tables WHERE table_id = ?', [tableId]);
        const [orderDetails] = await connection.query(
            `SELECT oi.*, m.name AS item_name
             FROM order_items oi
             JOIN menu_items m ON oi.item_id = m.item_id
             WHERE oi.order_item_id IN (?)`,
            [newItemIds]
        );
        const io = req.app.get('socketio');
        io.emit('new_order', { orderId, tableName: tableInfo[0].table_number, items: orderDetails, total });
    } catch (err) {
        console.log("LỖI GỬI THÔNG BÁO ĐƠN MỚI:", err);
    }
}

// 1. GỌI MÓN
exports.createOrder = async (req, res) => {
    const { table_id, items } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { orderId, newItemIds, total } = await placeOrder(connection, { table_id, items });
        await connection.commit();
        await emitNewOrder(req, connection, { orderId, tableId: table_id, newItemIds, total });
        res.status(201).json({ message: 'Gọi món thành công', orderId, total });
    } catch (error) {
        console.log("LỖI TẠO ĐƠN HÀNG:", error);
        await connection.rollback();
        res.status(error.status || 500).json({ message: 'Lỗi gọi món', error: error.message });
    } finally {
        connection.release();
    }
};

exports.createPublicOrder = async (req, res) => {
    const { table_id, items, customer_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { orderId, newItemIds, total } = await placeOrder(connection, { table_id, customer_id, items });
        await connection.commit();
        await emitNewOrder(req, connection, { orderId, tableId: table_id, newItemIds, total });
        res.status(201).json({ message: 'Thành công', orderId });
    } catch (error) {
        console.log("LỖI TẠO ĐƠN PUBLIC:", error);
        await connection.rollback();
        res.status(error.status || 500).json({ message: 'Lỗi', error: error.message });
    } finally {
        connection.release();
    }
};

// 2. MÃ QR THANH TOÁN
exports.getPaymentQR = async (req, res) => {
    try {
        const [order] = await db.query('SELECT total_amount FROM orders WHERE order_id = ?', [req.params.orderId]);
        if (order.length === 0) return res.status(404).json({ message: 'Không thấy đơn' });
        const qrUrl = generateVietQRUrl(order[0].total_amount, req.params.orderId);
        res.json({ qrUrl, amount: order[0].total_amount });
    } catch (error) {
        console.log("LỖI TẠO QR:", error);
        res.status(500).json({ message: 'Lỗi tạo QR' });
    }
};

// 3. THỰC ĐƠN
const MENU_QUERY = `
    SELECT m.*, c.category_name
    FROM menu_items m
    LEFT JOIN categories c ON m.category_id = c.category_id
    WHERE m.is_available = 1
`;

exports.getAllMenuItems = async (req, res) => {
    try {
        const [items] = await db.query(MENU_QUERY);
        res.json(items);
    } catch (error) {
        console.log("LỖI LẤY THỰC ĐƠN:", error);
        res.status(500).json({ message: 'Lỗi lấy thực đơn', error: error.message });
    }
};

exports.getPublicMenu = async (req, res) => {
    try {
        const [items] = await db.query(MENU_QUERY);
        res.json(items);
    } catch (error) {
        console.log("LỖI LẤY MENU PUBLIC:", error);
        res.status(500).json({ message: 'Lỗi' });
    }
};

// MODULE KDS (BẾP)
exports.getKitchenOrders = async (req, res) => {
    try {
        const query = `
            SELECT o.order_id, t.table_number, o.created_at,
                   oi.order_item_id, oi.quantity, oi.item_status, oi.note,
                   m.name AS item_name
            FROM orders o
            JOIN tables t ON o.table_id = t.table_id
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN menu_items m ON oi.item_id = m.item_id
            WHERE oi.item_status IN ('pending', 'cooking')
            ORDER BY o.created_at ASC, oi.order_item_id ASC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.log("LỖI LẤY ĐƠN BẾP:", error);
        res.status(500).json({ message: 'Lỗi lấy đơn bếp', error: error.message });
    }
};

exports.updateItemStatus = async (req, res) => {
    const { orderItemId } = req.params;
    const { status } = req.body;
    if (!ITEM_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Trạng thái món không hợp lệ' });
    }
    try {
        const [result] = await db.query('UPDATE order_items SET item_status = ? WHERE order_item_id = ?', [status, orderItemId]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Không tìm thấy món' });
        const io = req.app.get('socketio');
        io.emit('item_status_updated', { orderItemId, status });
        res.json({ message: 'Cập nhật thành công' });
    } catch (error) {
        console.log("LỖI CẬP NHẬT TRẠNG THÁI MÓN:", error);
        res.status(500).json({ message: 'Lỗi cập nhật', error: error.message });
    }
};

// MODULE THANH TOÁN CƠ BẢN
exports.getTableBill = async (req, res) => {
    const { tableId } = req.params;
    try {
        const [orders] = await db.query(
            'SELECT * FROM orders WHERE table_id = ? AND order_status NOT IN ("paid","cancelled") ORDER BY created_at DESC LIMIT 1',
            [tableId]
        );
        if (orders.length === 0) return res.status(404).json({ message: 'Bàn này chưa có đơn hàng nào!' });
        const order = orders[0];
        const [items] = await db.query(`
            SELECT oi.*, m.name AS item_name
            FROM order_items oi
            JOIN menu_items m ON oi.item_id = m.item_id
            WHERE oi.order_id = ?
        `, [order.order_id]);
        res.json({ order, items });
    } catch (error) {
        console.log("LỖI LẤY HÓA ĐƠN CƠ BẢN:", error);
        res.status(500).json({ message: 'Lỗi lấy hóa đơn', error: error.message });
    }
};

exports.checkoutTable = async (req, res) => {
    const { tableId, orderId, paymentMethod } = req.body;
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ message: 'Hình thức thanh toán không hợp lệ' });
    }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [orderInfo] = await connection.query('SELECT total_amount FROM orders WHERE order_id = ?', [orderId]);
        if (orderInfo.length === 0) throw badRequest('Không tìm thấy đơn hàng');
        await connection.query(
            'INSERT INTO payments (order_id, amount, payment_method) VALUES (?, ?, ?)',
            [orderId, orderInfo[0].total_amount, paymentMethod]
        );
        await connection.query('UPDATE orders SET order_status = "paid" WHERE order_id = ?', [orderId]);
        await connection.query('UPDATE tables SET status = "available" WHERE table_id = ?', [tableId]);
        await connection.commit();
        res.json({ message: 'Thanh toán thành công!' });
    } catch (error) {
        console.log("LỖI THANH TOÁN CƠ BẢN:", error);
        await connection.rollback();
        res.status(error.status || 500).json({ message: 'Lỗi thanh toán', error: error.message });
    } finally {
        connection.release();
    }
};

// MODULE THU NGÂN (BILLING)
exports.getBillingTables = async (req, res) => {
    try {
        const query = `
            SELECT t.*,
                    (SELECT SUM(oi.item_price * oi.quantity)
                    FROM orders o
                    JOIN order_items oi ON o.order_id = oi.order_id
                    WHERE o.table_id = t.table_id
                      AND o.order_status NOT IN ('paid','cancelled')
                      AND oi.item_status != 'cancelled') AS current_total
            FROM tables t
            ORDER BY t.table_number
        `;
        const [tables] = await db.query(query);
        res.json(tables);
    } catch (error) {
        console.log("LỖI LẤY DANH SÁCH BÀN THU NGÂN:", error);
        res.status(500).json({ error: 'Lỗi lấy danh sách bàn' });
    }
};

exports.getTableBillingDetails = async (req, res) => {
    const { tableId } = req.params;
    try {
        const [items] = await db.query(`
            SELECT oi.*, m.name AS item_name, m.vat_rate,
                   c.full_name AS customer_name, c.phone AS customer_phone, c.points,
                   o.customer_id, o.order_id, o.created_at
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN menu_items m ON oi.item_id = m.item_id
            LEFT JOIN customers c ON o.customer_id = c.customer_id
            WHERE o.table_id = ?
              AND o.order_status NOT IN ('paid','cancelled')
              AND oi.item_status != 'cancelled'
            ORDER BY o.created_at ASC, oi.order_item_id ASC
        `, [tableId]);

        if (items.length === 0) {
            return res.status(404).json({ error: 'Bàn này chưa có đơn hàng nào cần thanh toán!' });
        }
        res.json(items);
    } catch (error) {
        console.log("LỖI LẤY CHI TIẾT HÓA ĐƠN (getTableBillingDetails):", error);
        res.status(500).json({ error: 'Lỗi lấy chi tiết hóa đơn', details: error.message });
    }
};

exports.checkoutBilling = async (req, res) => {
    const { table_id, payment_method, points_used } = req.body;
    if (!table_id) return res.status(400).json({ error: 'Thiếu mã bàn' });
    if (!PAYMENT_METHODS.includes(payment_method)) {
        return res.status(400).json({ error: 'Hình thức thanh toán không hợp lệ' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [orders] = await connection.query(
            `SELECT order_id, customer_id FROM orders
             WHERE table_id = ? AND order_status NOT IN ('paid','cancelled') FOR UPDATE`,
            [table_id]
        );
        if (orders.length === 0) throw badRequest('Không tìm thấy đơn hàng chưa thanh toán!');

        let customerId = null;
        let subTotalAll = 0;
        const bills = [];
        for (const order of orders) {
            if (order.customer_id) customerId = order.customer_id;
            const [lines] = await connection.query(
                `SELECT oi.item_id, oi.quantity, oi.item_price, m.vat_rate
                 FROM order_items oi
                 JOIN menu_items m ON m.item_id = oi.item_id
                 WHERE oi.order_id = ? AND oi.item_status != 'cancelled'`,
                [order.order_id]
            );
            let sub = 0;
            let vat = 0;
            for (const l of lines) {
                const lineTotal = Number(l.item_price) * l.quantity;
                sub += lineTotal;
                vat += (lineTotal * Number(l.vat_rate)) / 100;
            }
            subTotalAll += sub;
            bills.push({ orderId: order.order_id, sub, vat: Math.round(vat), lines });
        }
        if (subTotalAll === 0) throw badRequest('Bàn này không còn món nào cần thanh toán!');

        let pointsApplied = 0;
        if (customerId) {
            const [[cust]] = await connection.query(
                'SELECT points FROM customers WHERE customer_id = ? FOR UPDATE', [customerId]
            );
            const totalBefore = bills.reduce((s, b) => s + b.sub + b.vat, 0);
            const maxUsable = Math.min(Number(cust.points) || 0, Math.floor(totalBefore / POINT_VALUE));
            pointsApplied = Math.max(0, Math.min(parseInt(points_used, 10) || 0, maxUsable));
        }
        let discountLeft = pointsApplied * POINT_VALUE;

        let totalPaid = 0;
        for (const b of bills) {
            const orderTotal = b.sub + b.vat;
            const discount = Math.min(discountLeft, orderTotal);
            discountLeft -= discount;
            const amountPaid = orderTotal - discount;
            totalPaid += amountPaid;

            await connection.query('UPDATE orders SET order_status = "paid", total_amount = ? WHERE order_id = ?', [b.sub, b.orderId]);
            await connection.query('UPDATE order_items SET item_status = "served" WHERE order_id = ? AND item_status != "cancelled"', [b.orderId]);
            await connection.query(
                'INSERT INTO payments (order_id, amount, payment_method) VALUES (?, ?, ?)',
                [b.orderId, amountPaid, payment_method]
            );

            for (const l of b.lines) {
                const [recipes] = await connection.query('SELECT ingredient_id, amount_needed FROM menu_recipes WHERE item_id = ?', [l.item_id]);
                for (const r of recipes) {
                    await connection.query(
                        'UPDATE ingredients SET stock_quantity = stock_quantity - ? WHERE ingredient_id = ?',
                        [r.amount_needed * l.quantity, r.ingredient_id]
                    );
                }
            }
        }

        await connection.query('UPDATE tables SET status = "available" WHERE table_id = ?', [table_id]);

        if (customerId) {
            const earned = Math.floor(subTotalAll / POINT_EARN_STEP);
            await connection.query(
                'UPDATE customers SET points = points - ? + ? WHERE customer_id = ?',
                [pointsApplied, earned, customerId]
            );
        }

        await connection.commit();
        res.json({ message: 'Thanh toán thành công!', paid: totalPaid });
    } catch (error) {
        console.log("LỖI THANH TOÁN BILLING (checkoutBilling):", error);
        await connection.rollback();
        res.status(error.status || 500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

exports.cancelOrderItem = async (req, res) => {
    const { orderItemId } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
            `SELECT oi.order_id, oi.item_status, o.table_id
             FROM order_items oi
             JOIN orders o ON o.order_id = oi.order_id
             WHERE oi.order_item_id = ? FOR UPDATE`,
            [orderItemId]
        );
        if (rows.length === 0) throw Object.assign(new Error('Không tìm thấy món'), { status: 404 });
        if (rows[0].item_status === 'cancelled') throw badRequest('Món này đã được hủy');
        const { order_id: orderId, table_id: tableId } = rows[0];

        await connection.query('UPDATE order_items SET item_status = "cancelled" WHERE order_item_id = ?', [orderItemId]);
        await connection.query(
            `UPDATE orders SET total_amount = (
                SELECT COALESCE(SUM(item_price * quantity), 0) FROM order_items
                WHERE order_id = ? AND item_status != 'cancelled'
             ) WHERE order_id = ?`,
            [orderId, orderId]
        );

        const [[left]] = await connection.query(
            `SELECT COUNT(*) AS n
             FROM order_items oi
             JOIN orders o ON o.order_id = oi.order_id
             WHERE o.table_id = ? AND o.order_status NOT IN ('paid','cancelled') AND oi.item_status != 'cancelled'`,
            [tableId]
        );
        if (Number(left.n) === 0) {
            await connection.query(
                'UPDATE orders SET order_status = "cancelled", total_amount = 0 WHERE table_id = ? AND order_status NOT IN ("paid","cancelled")',
                [tableId]
            );
            await connection.query('UPDATE tables SET status = "available" WHERE table_id = ?', [tableId]);
        }

        await connection.commit();

        try {
            req.app.get('socketio').emit('item_status_updated', { orderItemId, status: 'cancelled' });
        } catch (err) {
            console.log("LỖI GỬI SOCKET HỦY MÓN:", err);
        }
        res.json({ message: 'Đã hủy món' });
    } catch (error) {
        console.log("LỖI HỦY MÓN:", error);
        await connection.rollback();
        res.status(error.status || 500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// MODULE KHÁCH HÀNG & VOUCHER
exports.registerCustomer = async (req, res) => {
    const { phone, full_name, password } = req.body;
    if (!phone || !full_name || !password) {
        return res.status(400).json({ error: 'Vui lòng nhập đủ số điện thoại, họ tên và mật khẩu!' });
    }
    if (String(password).length < 6) {
        return res.status(400).json({ error: 'Mật khẩu cần ít nhất 6 ký tự!' });
    }
    try {
        const [existing] = await db.query('SELECT customer_id FROM customers WHERE phone = ?', [phone]);
        if (existing.length > 0) return res.status(400).json({ error: 'Số điện thoại đã được đăng ký!' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await db.query(
            'INSERT INTO customers (phone, full_name, password, points) VALUES (?, ?, ?, 0)',
            [phone, full_name, hashedPassword]
        );

        res.status(201).json({ message: 'Đăng ký thành công!', customer: { id: result.insertId, phone, full_name, points: 0 } });
    } catch (error) {
        console.log("LỖI ĐĂNG KÝ KHÁCH HÀNG:", error);
        res.status(500).json({ error: 'Lỗi đăng ký khách hàng' });
    }
};

exports.loginCustomer = async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ error: 'Vui lòng nhập số điện thoại và mật khẩu!' });
    }
    try {
        const [customers] = await db.query('SELECT * FROM customers WHERE phone = ?', [phone]);
        if (customers.length === 0) return res.status(404).json({ error: 'Số điện thoại chưa đăng ký!' });

        const customer = customers[0];
        if (!customer.password) {
            return res.status(401).json({ error: 'Tài khoản này chưa có mật khẩu, vui lòng liên hệ quầy để được hỗ trợ!' });
        }
        const validPass = await bcrypt.compare(password, customer.password);
        if (!validPass) return res.status(401).json({ error: 'Mật khẩu không đúng!' });

        res.json({
            message: 'Đăng nhập thành công!',
            customer: { id: customer.customer_id, phone: customer.phone, full_name: customer.full_name, points: customer.points }
        });
    } catch (error) {
        console.log("LỖI ĐĂNG NHẬP KHÁCH HÀNG:", error);
        res.status(500).json({ error: 'Lỗi đăng nhập' });
    }
};

exports.getActiveVouchers = async (req, res) => {
    try {
        const [vouchers] = await db.query('SELECT * FROM vouchers WHERE is_active = 1');
        res.json(vouchers);
    } catch (error) {
        console.log("LỖI LẤY VOUCHER:", error);
        res.status(500).json({ error: 'Lỗi lấy voucher' });
    }
};

exports.getAllVouchers = async (req, res) => {
    try {
        const [vouchers] = await db.query('SELECT * FROM vouchers');
        res.json(vouchers);
    } catch (error) {
        console.log("LỖI LẤY TẤT CẢ VOUCHER:", error);
        res.status(500).json({ error: 'Lỗi' });
    }
};

exports.createVoucher = async (req, res) => {
    const { code, discount_percent, min_order_value } = req.body;
    const percent = parseInt(discount_percent, 10);
    if (!code || !(percent >= 1 && percent <= 100)) {
        return res.status(400).json({ error: 'Mã voucher hoặc phần trăm giảm (1 đến 100) không hợp lệ' });
    }
    try {
        await db.query(
            'INSERT INTO vouchers (code, discount_percent, min_order_value) VALUES (?, ?, ?)',
            [code, percent, min_order_value || 0]
        );
        res.status(201).json({ message: 'Tạo voucher thành công' });
    } catch (error) {
        console.log("LỖI TẠO VOUCHER:", error);
        res.status(500).json({ error: 'Lỗi tạo voucher' });
    }
};

exports.getMarqueeText = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = "marquee_text"');
        res.json({ text: rows.length > 0 ? rows[0].setting_value : '' });
    } catch (error) {
        console.log("LỖI LẤY QUẢNG CÁO:", error);
        res.status(500).json({ error: 'Lỗi lấy quảng cáo' });
    }
};

exports.updateMarqueeText = async (req, res) => {
    const { text } = req.body;
    try {
        await db.query('UPDATE settings SET setting_value = ? WHERE setting_key = "marquee_text"', [text]);
        res.json({ message: 'Đã cập nhật quảng cáo' });
    } catch (error) {
        console.log("LỖI CẬP NHẬT QUẢNG CÁO:", error);
        res.status(500).json({ error: 'Lỗi cập nhật quảng cáo' });
    }
};

// MODULE DASHBOARD (THỐNG KÊ)
exports.getDashboardStats = async (req, res) => {
    try {
        // 1. Tổng doanh thu (chỉ tính đơn đã thanh toán)
        const [revenue] = await db.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM payments'
        );

        // 2. Tổng số đơn hàng
        const [orders] = await db.query('SELECT COUNT(*) as total FROM orders');

        // 3. Tổng số khách hàng
        const [customers] = await db.query('SELECT COUNT(*) as total FROM customers');

        // 4. Số món đang nấu (item_status = 'cooking')
        const [cooking] = await db.query(
            "SELECT COUNT(*) as total FROM order_items WHERE item_status = 'cooking'"
        );

        // 5. 10 đơn hàng gần nhất
        const [recentOrders] = await db.query(`
            SELECT o.order_id, t.table_number, o.total_amount, o.order_status, o.created_at
            FROM orders o
            JOIN tables t ON o.table_id = t.table_id
            ORDER BY o.created_at DESC
            LIMIT 10
        `);

        res.json({
            totalRevenue: Number(revenue[0].total),
            totalOrders: orders[0].total,
            totalCustomers: customers[0].total,
            cookingItems: cooking[0].total,
            recentOrders: recentOrders
        });
    } catch (error) {
        console.log("LỖI LẤY DASHBOARD STATS:", error);
        res.status(500).json({ message: 'Lỗi lấy thống kê', error: error.message });
    }
};

// MODULE QUẢN LÝ ĐƠN HÀNG (DÀNH CHO THU NGÂN/PHỤC VỤ)
// Lấy tất cả đơn hàng đang hoạt động (chưa thanh toán, chưa hủy)
exports.getActiveOrders = async (req, res) => {
    try {
        const query = `
            SELECT o.order_id, t.table_number, o.total_amount, o.order_status, o.created_at
            FROM orders o
            JOIN tables t ON o.table_id = t.table_id
            WHERE o.order_status NOT IN ('paid', 'cancelled')
            ORDER BY o.created_at DESC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.log("LỖI LẤY ĐƠN ACTIVE:", error);
        res.status(500).json({ error: 'Lỗi lấy danh sách đơn' });
    }
};

// Lấy chi tiết 1 đơn hàng (để xem món nào đang nấu, món nào xong)
exports.getOrderDetail = async (req, res) => {
    const { orderId } = req.params;
    try {
        const [orderInfo] = await db.query('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (orderInfo.length === 0) return res.status(404).json({ error: 'Không thấy đơn' });

        const [items] = await db.query(`
            SELECT oi.*, m.name AS item_name 
            FROM order_items oi 
            JOIN menu_items m ON oi.item_id = m.item_id 
            WHERE oi.order_id = ?
        `, [orderId]);

        res.json({ order: orderInfo[0], items });
    } catch (error) {
        console.log("LỖI LẤY CHI TIẾT ĐƠN:", error);
        res.status(500).json({ error: 'Lỗi lấy chi tiết đơn' });
    }
};