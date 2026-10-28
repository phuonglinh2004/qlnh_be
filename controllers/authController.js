const db = require('../config/db');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);

        if (users.length === 0) return res.status(404).json({ message: 'Sai tài khoản!' });

        const user = users[0];
        // Tạm thời test pass thường
        if (password !== '123456') return res.status(401).json({ message: 'Sai mật khẩu!' });

        const token = jwt.sign({ id: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ message: 'Thành công', token, role: user.role });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server' });
    }
};