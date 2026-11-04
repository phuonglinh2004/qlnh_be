const db = require('../config/db');

// 1. Khách hàng gửi yêu cầu đặt bàn (Không cần đăng nhập / Token)
exports.createReservation = async (req, res) => {
    const { full_name, phone, guest_count, reservation_time, note } = req.body;

    if (!full_name || !phone || !guest_count || !reservation_time) {
        return res.status(400).json({ error: 'Vui lòng nhập đủ Họ tên, SĐT, Số lượng khách và Thời gian!' });
    }

    try {
        // Tự động kiểm tra hoặc lưu thông tin khách vào bảng customers để tích điểm sau này
        let customerId = null;
        const [existingCustomer] = await db.query('SELECT customer_id FROM customers WHERE phone = ?', [phone]);

        if (existingCustomer.length > 0) {
            customerId = existingCustomer[0].customer_id;
        } else {
            const [newCust] = await db.query(
                'INSERT INTO customers (phone, full_name) VALUES (?, ?)',
                [phone, full_name]
            );
            customerId = newCust.insertId;
        }

        // Tạo đơn đặt bàn với trạng thái mặc định 'pending' (Chờ duyệt)
        await db.query(
            `INSERT INTO reservations (customer_id, guest_count, reservation_time, note, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [customerId, guest_count, reservation_time, note || '']
        );

        res.status(201).json({ message: 'Đặt bàn thành công! Nhà hàng sẽ liên hệ xác nhận sớm nhất.' });
    } catch (error) {
        console.error("LỖI ĐẶT BÀN KHÁCH:", error);
        res.status(500).json({ error: 'Lỗi máy chủ khi gửi yêu cầu đặt bàn' });
    }
};

// 2. Lấy danh sách đặt bàn (Thu ngân / Phục vụ / Admin)
exports.getAllReservations = async (req, res) => {
    try {
        const query = `
            SELECT r.*, c.full_name AS customer_name, c.phone AS customer_phone, t.table_number
            FROM reservations r
            LEFT JOIN customers c ON r.customer_id = c.customer_id
            LEFT JOIN tables t ON r.table_id = t.table_id
            ORDER BY r.reservation_time DESC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.error("LỖI LẤY DANH SÁCH ĐẶT BÀN:", error);
        res.status(500).json({ error: 'Lỗi lấy danh sách đặt bàn' });
    }
};

// 3. Duyệt / Hủy đơn đặt bàn
exports.updateReservationStatus = async (req, res) => {
    const { id } = req.params;
    const { status, table_id } = req.body; // status: 'confirmed', 'cancelled'

    try {
        const [existing] = await db.query('SELECT * FROM reservations WHERE reservation_id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy đơn đặt bàn' });
        }

        await db.query(
            'UPDATE reservations SET status = ?, table_id = COALESCE(?, table_id) WHERE reservation_id = ?',
            [status, table_id || null, id]
        );

        // Nếu Duyệt và có gán bàn, chuyển trạng thái bàn sang 'reserved' (Đã đặt)
        if (status === 'confirmed' && (table_id || existing[0].table_id)) {
            const targetTableId = table_id || existing[0].table_id;
            await db.query('UPDATE tables SET status = "reserved" WHERE table_id = ?', [targetTableId]);
        }

        res.json({ message: 'Cập nhật trạng thái đặt bàn thành công!' });
    } catch (error) {
        console.error("LỖI CẬP NHẬT ĐẶT BÀN:", error);
        res.status(500).json({ error: 'Lỗi cập nhật trạng thái đặt bàn' });
    }
};