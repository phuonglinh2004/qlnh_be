function generateVietQRUrl(amount, orderId) {
    const bankId = 'vcb'; // Vietcombank
    const accountNo = '1031495439'; // Số tài khoản của bạn
    const accountName = 'TRAN NGOC PHUONG LINH';
    const template = 'compact2';
    const addInfo = encodeURIComponent(`Thanh toan don ${orderId}`);

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${amount}&addInfo=${addInfo}&accountName=${encodeURIComponent(accountName)}`;
}
module.exports = { generateVietQRUrl };