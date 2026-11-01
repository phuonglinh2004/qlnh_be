const db = require('../config/db');

// Mở ca
exports.openShift = async (req, res) => {
    const { user_id, starting_cash } = req.body;
    try {
        const [open] = await db.query('SELECT * FROM shifts WHERE user_id = ? AND status = "open"', [user_id]);
        if (open.length > 0) return res.status(400).json({ error: 'Bạn đang có ca làm việc chưa đóng!' });

        await db.query('INSERT INTO shifts (user_id, starting_cash) VALUES (?, ?)', [user_id, starting_cash || 0]);
        res.status(201).json({ message: 'Mở ca thành công!' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi mở ca' });
    }
};

// Lấy ca hiện tại
exports.getCurrentShift = async (req, res) => {
    const { user_id } = req.params;
    try {
        const [shifts] = await db.query('SELECT * FROM shifts WHERE user_id = ? AND status = "open" LIMIT 1', [user_id]);
        res.json(shifts.length > 0 ? shifts[0] : null);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi lấy ca' });
    }
};

// Đóng ca & tính doanh thu
exports.closeShift = async (req, res) => {
    const { shift_id } = req.body;
    try {
        const [shift] = await db.query('SELECT * FROM shifts WHERE shift_id = ?', [shift_id]);
        const startTime = shift[0].start_time;

        // Tính tổng doanh thu từ lúc mở ca
        const [revenue] = await db.query('SELECT SUM(amount) as total FROM payments WHERE paid_at >= ?', [startTime]);
        const totalRevenue = revenue[0].total || 0;

        await db.query('UPDATE shifts SET end_time = NOW(), total_revenue = ?, status = "closed" WHERE shift_id = ?', [totalRevenue, shift_id]);
        res.json({ message: 'Đóng ca thành công!', totalRevenue });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi đóng ca' });
    }
};

// Cập nhật trạng thái bàn sang "Chờ thanh toán" (Màu vàng)
exports.requestPayment = async (req, res) => {
    const { table_id } = req.body;
    try {
        await db.query('UPDATE tables SET status = "waiting_payment" WHERE table_id = ?', [table_id]);
        res.json({ message: 'Đã chuyển sang chờ thanh toán' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi cập nhật bàn' });
    }
};