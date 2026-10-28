const db = require('../config/db');
const { generateVietQRUrl } = require('../utils/vietqr');

// 1. API Tạo đơn hàng (Gọi món) - ĐÃ CẬP NHẬT SOCKET
exports.createOrder = async (req, res) => {
    const { table_id, items } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [orderResult] = await connection.query(
            'INSERT INTO orders (table_id, order_status) VALUES (?, "pending")', [table_id]
        );
        const orderId = orderResult.insertId;

        let total = 0;
        for (let item of items) {
            const [menu] = await connection.query('SELECT price, name FROM menu_items WHERE item_id = ?', [item.item_id]);
            const price = menu[0].price;
            total += price * item.quantity;

            await connection.query(
                'INSERT INTO order_items (order_id, item_id, quantity, item_price, note) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.item_id, item.quantity, price, item.note || '']
            );
        }

        await connection.query('UPDATE orders SET total_amount = ? WHERE order_id = ?', [total, orderId]);
        await connection.query('UPDATE tables SET status = "occupied" WHERE table_id = ?', [table_id]);

        await connection.commit();

        // === PHẦN THÊM MỚI: LẤY DATA VÀ PHÁT SOCKET CHO BẾP ===
        const [tableInfo] = await connection.query('SELECT table_number FROM tables WHERE table_id = ?', [table_id]);
        const [orderDetails] = await connection.query(`
            SELECT oi.*, m.name as item_name 
            FROM order_items oi 
            JOIN menu_items m ON oi.item_id = m.item_id 
            WHERE oi.order_id = ?
        `, [orderId]);

        // Phát tín hiệu Real-time cho màn hình Bếp
        const io = req.app.get('socketio');
        io.emit('new_order', {
            orderId: orderId,
            tableName: tableInfo[0].table_number,
            items: orderDetails,
            total: total
        });

        res.status(201).json({ message: 'Gọi món thành công', orderId, total });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Lỗi gọi món', error: error.message });
    } finally {
        connection.release();
    }
};

// 2. API Tạo mã QR Thanh toán
exports.getPaymentQR = async (req, res) => {
    try {
        const [order] = await db.query('SELECT total_amount FROM orders WHERE order_id = ?', [req.params.orderId]);
        if (order.length === 0) return res.status(404).json({ message: 'Không thấy đơn' });

        const qrUrl = generateVietQRUrl(order[0].total_amount, req.params.orderId);
        res.json({ qrUrl, amount: order[0].total_amount });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tạo QR' });
    }
};

// 3. API Lấy danh sách thực đơn
exports.getAllMenuItems = async (req, res) => {
    try {
        const query = `
            SELECT m.*, c.category_name 
            FROM menu_items m 
            LEFT JOIN categories c ON m.category_id = c.category_id 
            WHERE m.is_available = 1
        `;
        const [items] = await db.query(query);
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy thực đơn', error: error.message });
    }
};

// === PHẦN THÊM MỚI: API CHO MÀN HÌNH BẾP (KDS) ===

// 4. Lấy danh sách các món đang chờ nấu hoặc đang nấu
exports.getKitchenOrders = async (req, res) => {
    try {
        const query = `
            SELECT o.order_id, t.table_number, o.created_at, 
                   oi.order_item_id, oi.quantity, oi.item_status, oi.note, 
                   m.name as item_name
            FROM orders o
            JOIN tables t ON o.table_id = t.table_id
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN menu_items m ON oi.item_id = m.item_id
            WHERE oi.item_status IN ('pending', 'cooking')
            ORDER BY o.created_at ASC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy đơn bếp', error: error.message });
    }
};

// 5. Cập nhật trạng thái món (Bắt đầu nấu / Hoàn thành)
exports.updateItemStatus = async (req, res) => {
    const { orderItemId } = req.params;
    const { status } = req.body; // 'cooking' hoặc 'served'
    try {
        await db.query('UPDATE order_items SET item_status = ? WHERE order_item_id = ?', [status, orderItemId]);

        // Phát tín hiệu cho Phục vụ biết món đã xong (nếu cần)
        const io = req.app.get('socketio');
        io.emit('item_status_updated', { orderItemId, status });

        res.json({ message: 'Cập nhật thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi cập nhật', error: error.message });
    }
};
// 6. API Lấy thông tin hóa đơn của Bàn (để hiển thị trước khi thanh toán)
exports.getTableBill = async (req, res) => {
    const { tableId } = req.params;
    try {
        // Lấy đơn hàng đang chưa thanh toán của bàn này
        const [orders] = await db.query(
            'SELECT * FROM orders WHERE table_id = ? AND order_status != "paid" ORDER BY created_at DESC LIMIT 1',
            [tableId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ message: 'Bàn này chưa có đơn hàng nào!' });
        }

        const order = orders[0];

        // Lấy chi tiết các món trong đơn
        const [items] = await db.query(`
            SELECT oi.*, m.name as item_name 
            FROM order_items oi 
            JOIN menu_items m ON oi.item_id = m.item_id 
            WHERE oi.order_id = ?
        `, [order.order_id]);

        res.json({ order, items });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy hóa đơn', error: error.message });
    }
};

// 7. API Xác nhận thanh toán (Chốt hóa đơn)
exports.checkoutTable = async (req, res) => {
    const { tableId, orderId, paymentMethod } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Lưu vào bảng payments
        const [orderInfo] = await connection.query('SELECT total_amount FROM orders WHERE order_id = ?', [orderId]);
        await connection.query(
            'INSERT INTO payments (order_id, amount, payment_method) VALUES (?, ?, ?)',
            [orderId, orderInfo[0].total_amount, paymentMethod]
        );

        // 2. Đổi trạng thái đơn hàng thành 'paid'
        await connection.query('UPDATE orders SET order_status = "paid" WHERE order_id = ?', [orderId]);

        // 3. Đổi trạng thái bàn về 'available' (Trống)
        await connection.query('UPDATE tables SET status = "available" WHERE table_id = ?', [tableId]);

        await connection.commit();
        res.json({ message: 'Thanh toán thành công!' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Lỗi thanh toán', error: error.message });
    } finally {
        connection.release();
    }
};
// API Public cho Khách hàng
exports.getPublicMenu = async (req, res) => {
    try {
        const [items] = await db.query('SELECT m.*, c.category_name FROM menu_items m LEFT JOIN categories c ON m.category_id = c.category_id WHERE m.is_available = 1');
        res.json(items);
    } catch (error) { res.status(500).json({ message: 'Lỗi' }); }
};

exports.createPublicOrder = async (req, res) => {
    const { table_id, items } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [orderResult] = await connection.query('INSERT INTO orders (table_id, order_status) VALUES (?, "pending")', [table_id]);
        const orderId = orderResult.insertId;
        let total = 0;
        for (let item of items) {
            const [menu] = await connection.query('SELECT price FROM menu_items WHERE item_id = ?', [item.item_id]);
            total += menu[0].price * item.quantity;
            await connection.query('INSERT INTO order_items (order_id, item_id, quantity, item_price) VALUES (?, ?, ?, ?)', [orderId, item.item_id, item.quantity, menu[0].price]);
        }
        await connection.query('UPDATE orders SET total_amount = ? WHERE order_id = ?', [total, orderId]);
        await connection.query('UPDATE tables SET status = "occupied" WHERE table_id = ?', [table_id]);
        await connection.commit();

        // Bắn Socket cho Bếp
        const [tableInfo] = await connection.query('SELECT table_number FROM tables WHERE table_id = ?', [table_id]);
        const [orderDetails] = await connection.query('SELECT oi.*, m.name as item_name FROM order_items oi JOIN menu_items m ON oi.item_id = m.item_id WHERE oi.order_id = ?', [orderId]);
        const io = req.app.get('socketio');
        io.emit('new_order', { orderId, tableName: tableInfo[0].table_number, items: orderDetails });

        res.status(201).json({ message: 'Thành công' });
    } catch (error) {
        await connection.rollback(); res.status(500).json({ message: 'Lỗi' });
    } finally { connection.release(); }
};