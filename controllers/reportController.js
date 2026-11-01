const ExcelJS = require('exceljs');
const db = require('../config/db');

exports.exportMonthlyReport = async (req, res) => {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'Vui lòng chọn tháng và năm' });

    try {
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        // 1. Tổng doanh thu trong tháng
        const [revenueResult] = await db.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(paid_at) BETWEEN ? AND ?',
            [startDate, endDate]
        );
        const totalRevenue = Number(revenueResult[0].total);

        // 2. Tổng chi phí nhập kho trong tháng
        const [costResult] = await db.query(
            'SELECT COALESCE(SUM(total_cost), 0) as total FROM purchase_orders WHERE DATE(created_at) BETWEEN ? AND ?',
            [startDate, endDate]
        );
        const totalCost = Number(costResult[0].total);

        // 3. Lợi nhuận ròng
        const netProfit = totalRevenue - totalCost;

        // 4. Chi tiết doanh thu từng ngày
        const [dailyRevenue] = await db.query(`
            SELECT DATE(paid_at) as date, SUM(amount) as revenue
            FROM payments WHERE DATE(paid_at) BETWEEN ? AND ?
            GROUP BY DATE(paid_at) ORDER BY date
        `, [startDate, endDate]);

        // 5. Chi tiết nhập kho từng ngày
        const [dailyCost] = await db.query(`
            SELECT DATE(created_at) as date, SUM(total_cost) as cost
            FROM purchase_orders WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY DATE(created_at) ORDER BY date
        `, [startDate, endDate]);

        // 6. Tạo Excel
        const workbook = new ExcelJS.Workbook();

        const summarySheet = workbook.addWorksheet('Tổng quan tháng');
        summarySheet.columns = [
            { header: 'Chỉ số', key: 'metric', width: 30 },
            { header: 'Giá trị (VNĐ)', key: 'value', width: 20, style: { numFmt: '#,##0' } }
        ];
        summarySheet.getRow(1).font = { bold: true };
        summarySheet.addRow({ metric: 'Tháng báo cáo', value: `${month}/${year}` });
        summarySheet.addRow({ metric: 'Tổng Doanh Thu', value: totalRevenue });
        summarySheet.addRow({ metric: 'Tổng Chi Phí Nhập Kho', value: totalCost });
        const profitRow = summarySheet.addRow({ metric: 'LỢI NHUẬN RÒNG', value: netProfit });
        profitRow.font = { bold: true, size: 14, color: { argb: netProfit >= 0 ? 'FF008000' : 'FFFF0000' } };

        const detailSheet = workbook.addWorksheet('Chi tiết theo ngày');
        detailSheet.columns = [
            { header: 'Ngày', key: 'date', width: 15 },
            { header: 'Doanh Thu', key: 'revenue', width: 18, style: { numFmt: '#,##0' } },
            { header: 'Chi Phí Nhập Kho', key: 'cost', width: 18, style: { numFmt: '#,##0' } },
            { header: 'Lãi/Lỗ Ngày', key: 'profit', width: 18, style: { numFmt: '#,##0' } }
        ];
        detailSheet.getRow(1).font = { bold: true };

        const allDates = new Set([...dailyRevenue.map(r => r.date.toISOString().split('T')[0]), ...dailyCost.map(c => c.date.toISOString().split('T')[0])]);
        const sortedDates = Array.from(allDates).sort();

        sortedDates.forEach(dateStr => {
            const rev = dailyRevenue.find(r => r.date.toISOString().split('T')[0] === dateStr)?.revenue || 0;
            const cost = dailyCost.find(c => c.date.toISOString().split('T')[0] === dateStr)?.cost || 0;
            detailSheet.addRow({ date: dateStr, revenue: Number(rev), cost: Number(cost), profit: Number(rev) - Number(cost) });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="BaoCao_Thang_${month}_${year}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.log("LỖI XUẤT BÁO CÁO THÁNG:", error);
        res.status(500).json({ error: 'Lỗi xuất báo cáo', details: error.message });
    }
};