const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./config/db');
const apiRoutes = require('./routes/apiRoutes');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.set('socketio', io);

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

app.get('/', (req, res) => res.send('Backend đang chạy!'));

// Socket.IO (Dùng cho bếp)
io.on('connection', (socket) => {
    console.log('Client kết nối:', socket.id);
});

// Test API Bếp báo xong món
app.post('/api/kitchen/done/:orderItemId', async (req, res) => {
    try {
        await db.query('UPDATE order_items SET item_status = "served" WHERE order_item_id = ?', [req.params.orderItemId]);
        io.emit('item_ready', { orderItemId: req.params.orderItemId });
        res.json({ message: 'Đã báo phục vụ' });
    } catch (error) {
        res.status(500).json(error);
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server Backend chạy tại http://localhost:${PORT}`));