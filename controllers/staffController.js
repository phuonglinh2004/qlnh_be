const db = require('../config/db');
const bcrypt = require('bcrypt');

// Lấy danh sách nhân viên
exports.getAllStaff = async (req, res) => {
    try {
        // Không trả về password
        const [staff] = await db.query('SELECT user_id, username, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC');
        res.json(staff);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi lấy danh sách nhân viên' });
    }
};

// Tạo tài khoản nhân viên mới
exports.createStaff = async (req, res) => {
    const { username, password, full_name, role } = req.body;
    try {
        // 1. Kiểm tra username tồn tại chưa
        const [existing] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại!' });
        }

        // 2. Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Lưu vào database
        await db.query(
            'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, full_name, role]
        );

        res.status(201).json({ message: 'Tạo tài khoản nhân viên thành công!' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi tạo tài khoản: ' + error.message });
    }
};

// Khóa / Mở khóa tài khoản nhân viên
exports.toggleStaffStatus = async (req, res) => {
    const { id } = req.params;
    try {
        const [user] = await db.query('SELECT is_active FROM users WHERE user_id = ?', [id]);
        if (user.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

        const newStatus = !user[0].is_active;
        await db.query('UPDATE users SET is_active = ? WHERE user_id = ?', [newStatus, id]);

        res.json({ message: 'Cập nhật trạng thái thành công', is_active: newStatus });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi cập nhật trạng thái' });
    }
};