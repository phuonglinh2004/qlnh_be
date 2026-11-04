// const db = require('../config/db');
// const jwt = require('jsonwebtoken');
//
// exports.login = async (req, res) => {
//     try {
//         const { username, password } = req.body;
//         const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
//
//         if (users.length === 0) return res.status(404).json({ message: 'Sai tài khoản!' });
//
//         const user = users[0];
//         // Tạm thời test pass thường
//         if (password !== '123456') return res.status(401).json({ message: 'Sai mật khẩu!' });
//
//         const token = jwt.sign({ id: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
//         res.json({ message: 'Thành công', token, role: user.role });
//     } catch (error) {
//         res.status(500).json({ message: 'Lỗi server' });
//     }
// };


// 1.1
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); // Thêm bcrypt

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);

        if (users.length === 0) return res.status(404).json({ message: 'Sai tài khoản!' });

        const user = users[0];

        // 1. Kiểm tra tài khoản có bị khóa không (is_active)
        if (user.is_active === 0 || user.is_active === false) {
            return res.status(403).json({ message: 'Tài khoản đã bị khóa!' });
        }

        // 2. So sánh mật khẩu bằng bcrypt (thay cho password !== '123456')
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Sai mật khẩu!' });
        }

        // 3. Tạo Token chứa đầy đủ thông tin id, role, username, full_name
        const token = jwt.sign(
            { id: user.user_id, role: user.role, username: user.username, full_name: user.full_name },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '1d' }
        );

        // Trả về đúng cấu trúc mà Frontend đang chờ
        res.json({
            message: 'Thành công',
            token,
            role: user.role,
            user: {
                user_id: user.user_id,
                username: user.username,
                full_name: user.full_name,
                role: user.role
            }
        });
    } catch (error) {
        console.error("LỖI ĐĂNG NHẬP:", error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};