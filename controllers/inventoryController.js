// const db = require('../config/db');
//
// // Tạo phiếu nhập kho
// exports.createPurchaseOrder = async (req, res) => {
//     const { supplier_id, items, note } = req.body;
//     const user_id = req.user.id;
//     const connection = await db.getConnection();
//
//     try {
//         await connection.beginTransaction();
//
//         let totalCost = 0;
//         for (let item of items) {
//             totalCost += item.quantity * item.unit_price;
//         }
//
//         const [poResult] = await connection.query(
//             'INSERT INTO purchase_orders (supplier_id, user_id, total_cost, note) VALUES (?, ?, ?, ?)',
//             [supplier_id, user_id, totalCost, note]
//         );
//         const poId = poResult.insertId;
//
//         for (let item of items) {
//             await connection.query(
//                 'INSERT INTO purchase_order_items (po_id, ingredient_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
//                 [poId, item.ingredient_id, item.quantity, item.unit_price]
//             );
//             await connection.query(
//                 'UPDATE ingredients SET stock_quantity = stock_quantity + ?, cost_price = ? WHERE ingredient_id = ?',
//                 [item.quantity, item.unit_price, item.ingredient_id]
//             );
//         }
//
//         await connection.commit();
//         res.status(201).json({ message: 'Nhập kho thành công', poId, totalCost });
//     } catch (error) {
//         await connection.rollback();
//         res.status(500).json({ error: error.message });
//     } finally {
//         connection.release();
//     }
// };
//
// // Lấy danh sách nguyên liệu
// exports.getAllIngredients = async (req, res) => {
//     try {
//         const [rows] = await db.query('SELECT * FROM ingredients');
//         res.json(rows);
//     } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
// };
//
// // Lấy lịch sử nhập kho (có tên người nhập)
// exports.getPurchaseHistory = async (req, res) => {
//     try {
//         const query = `
//             SELECT po.*, s.name as supplier_name, u.full_name as user_name
//             FROM purchase_orders po
//             LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
//             JOIN users u ON po.user_id = u.user_id
//             ORDER BY po.created_at DESC
//         `;
//         const [rows] = await db.query(query);
//         res.json(rows);
//     } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
// };
//
// // Lấy danh sách nhà cung cấp
// exports.getAllSuppliers = async (req, res) => {
//     try {
//         const [rows] = await db.query('SELECT * FROM suppliers');
//         res.json(rows);
//     } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
// };

const db = require('../config/db');

// ==========================================
// 1. NGUYÊN LIỆU (INGREDIENTS)
// ==========================================

// Lấy tất cả nguyên liệu
exports.getAllIngredients = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM ingredients ORDER BY name');
        res.json(rows);
    } catch (error) {
        console.log("LỖI LẤY NGUYÊN LIỆU:", error);
        res.status(500).json({ error: 'Lỗi lấy nguyên liệu' });
    }
};

// Thêm nguyên liệu mới
exports.createIngredient = async (req, res) => {
    const { name, unit, stock_quantity, cost_price, min_stock } = req.body;
    if (!name || !unit || cost_price === undefined) {
        return res.status(400).json({ error: 'Thiếu tên, đơn vị hoặc giá vốn' });
    }
    try {
        const [result] = await db.query(
            'INSERT INTO ingredients (name, unit, stock_quantity, cost_price, min_stock) VALUES (?, ?, ?, ?, ?)',
            [name, unit, stock_quantity || 0, cost_price, min_stock || 10]
        );
        res.status(201).json({ message: 'Thêm nguyên liệu thành công', ingredient_id: result.insertId });
    } catch (error) {
        console.log("LỖI THÊM NGUYÊN LIỆU:", error);
        res.status(500).json({ error: 'Lỗi thêm nguyên liệu' });
    }
};

// Cập nhật nguyên liệu
exports.updateIngredient = async (req, res) => {
    const { id } = req.params;
    const { name, unit, stock_quantity, cost_price, min_stock } = req.body;
    try {
        const [result] = await db.query(
            'UPDATE ingredients SET name = ?, unit = ?, stock_quantity = ?, cost_price = ?, min_stock = ? WHERE ingredient_id = ?',
            [name, unit, stock_quantity, cost_price, min_stock, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu' });
        res.json({ message: 'Cập nhật thành công' });
    } catch (error) {
        console.log("LỖI CẬP NHẬT NGUYÊN LIỆU:", error);
        res.status(500).json({ error: 'Lỗi cập nhật' });
    }
};

// Xóa nguyên liệu
exports.deleteIngredient = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM ingredients WHERE ingredient_id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu' });
        res.json({ message: 'Đã xóa nguyên liệu' });
    } catch (error) {
        console.log("LỖI XÓA NGUYÊN LIỆU:", error);
        res.status(500).json({ error: 'Lỗi xóa (có thể do nguyên liệu đang dùng trong công thức)' });
    }
};

// Nhập thêm hàng vào kho (cộng tồn kho + cập nhật giá vốn)
exports.importStock = async (req, res) => {
    const { ingredient_id, amount, cost_price } = req.body;
    if (!ingredient_id || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Số lượng nhập không hợp lệ' });
    }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [ing] = await connection.query('SELECT * FROM ingredients WHERE ingredient_id = ?', [ingredient_id]);
        if (ing.length === 0) throw new Error('Không tìm thấy nguyên liệu');

        const newPrice = cost_price || ing[0].cost_price;
        await connection.query(
            'UPDATE ingredients SET stock_quantity = stock_quantity + ?, cost_price = ? WHERE ingredient_id = ?',
            [amount, newPrice, ingredient_id]
        );

        await connection.commit();
        res.json({ message: 'Nhập kho thành công' });
    } catch (error) {
        await connection.rollback();
        console.log("LỖI NHẬP KHO:", error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// ==========================================
// 2. CÔNG THỨC ĐỊNH LƯỢNG (BOM)
// ==========================================

// Lấy tất cả công thức
exports.getAllRecipes = async (req, res) => {
    try {
        const query = `
            SELECT r.*, m.name AS item_name, m.price AS item_price, 
                   i.name AS ingredient_name, i.unit
            FROM menu_recipes r
            JOIN menu_items m ON r.item_id = m.item_id
            JOIN ingredients i ON r.ingredient_id = i.ingredient_id
            ORDER BY m.name, i.name
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.log("LỖI LẤY CÔNG THỨC:", error);
        res.status(500).json({ error: 'Lỗi lấy công thức' });
    }
};

// Thêm công thức định lượng
exports.createRecipe = async (req, res) => {
    const { item_id, ingredient_id, amount_needed } = req.body;
    if (!item_id || !ingredient_id || !amount_needed || amount_needed <= 0) {
        return res.status(400).json({ error: 'Dữ liệu định lượng không hợp lệ' });
    }
    try {
        await db.query(
            'INSERT INTO menu_recipes (item_id, ingredient_id, amount_needed) VALUES (?, ?, ?)',
            [item_id, ingredient_id, amount_needed]
        );
        res.status(201).json({ message: 'Đã thêm định lượng' });
    } catch (error) {
        console.log("LỖI THÊM CÔNG THỨC:", error);
        res.status(500).json({ error: 'Lỗi thêm định lượng' });
    }
};

// Xóa công thức
exports.deleteRecipe = async (req, res) => {
    const { recipeId } = req.params;
    try {
        const [result] = await db.query('DELETE FROM menu_recipes WHERE recipe_id = ?', [recipeId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy định lượng' });
        res.json({ message: 'Đã xóa định lượng' });
    } catch (error) {
        console.log("LỖI XÓA CÔNG THỨC:", error);
        res.status(500).json({ error: 'Lỗi xóa định lượng' });
    }
};

// ==========================================
// 3. NHÀ CUNG CẤP & PHIẾU NHẬP (PURCHASE ORDERS)
// ==========================================

// Lấy danh sách nhà cung cấp
exports.getAllSuppliers = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM suppliers ORDER BY name');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi lấy nhà cung cấp' });
    }
};

// Tạo phiếu nhập kho
exports.createPurchaseOrder = async (req, res) => {
    const { supplier_id, items, note } = req.body;
    const user_id = req.user.id;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Chưa chọn nguyên liệu nào' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        let totalCost = 0;
        for (let item of items) {
            totalCost += item.quantity * item.unit_price;
        }

        const [poResult] = await connection.query(
            'INSERT INTO purchase_orders (supplier_id, user_id, total_cost, note) VALUES (?, ?, ?, ?)',
            [supplier_id || null, user_id, totalCost, note || '']
        );
        const poId = poResult.insertId;

        for (let item of items) {
            await connection.query(
                'INSERT INTO purchase_order_items (po_id, ingredient_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
                [poId, item.ingredient_id, item.quantity, item.unit_price]
            );
            await connection.query(
                'UPDATE ingredients SET stock_quantity = stock_quantity + ?, cost_price = ? WHERE ingredient_id = ?',
                [item.quantity, item.unit_price, item.ingredient_id]
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'Nhập kho thành công', poId, totalCost });
    } catch (error) {
        await connection.rollback();
        console.log("LỖI TẠO PHIẾU NHẬP:", error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// Lấy lịch sử nhập kho
exports.getPurchaseHistory = async (req, res) => {
    try {
        const query = `
            SELECT po.*, s.name AS supplier_name, u.full_name AS user_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
            JOIN users u ON po.user_id = u.user_id
            ORDER BY po.created_at DESC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.log("LỖI LẤY LỊCH SỬ NHẬP:", error);
        res.status(500).json({ error: 'Lỗi lấy lịch sử' });
    }
};
// Xem chi tiết 1 phiếu nhập kho (gồm những nguyên liệu gì)
exports.getPurchaseOrderDetail = async (req, res) => {
    const { poId } = req.params;
    try {
        // Lấy thông tin phiếu nhập
        const [poInfo] = await db.query(`
            SELECT po.*, s.name AS supplier_name, u.full_name AS user_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
            JOIN users u ON po.user_id = u.user_id
            WHERE po.po_id = ?
        `, [poId]);

        if (poInfo.length === 0) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });

        // Lấy chi tiết các nguyên liệu trong phiếu
        const [items] = await db.query(`
            SELECT poi.*, i.name AS ingredient_name, i.unit
            FROM purchase_order_items poi
            JOIN ingredients i ON poi.ingredient_id = i.ingredient_id
            WHERE poi.po_id = ?
        `, [poId]);

        res.json({ order: poInfo[0], items });
    } catch (error) {
        console.log("LỖI LẤY CHI TIẾT PHIẾU NHẬP:", error);
        res.status(500).json({ error: 'Lỗi lấy chi tiết phiếu nhập' });
    }
};