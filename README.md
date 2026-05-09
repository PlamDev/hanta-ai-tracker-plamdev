# Hanta Monitor AI

Một website + backend Node.js để:
- quét tin công khai từ WHO và GDELT
- cố gắng trích xuất vị trí ổ dịch
- geocode lên bản đồ
- tự làm mới theo chu kỳ

## Chạy trên máy tính

### 1) Cài Node.js 18+
### 2) Cài thư viện
```bash
npm install
```

### 3) Chạy
```bash
npm start
```

Mở `http://localhost:3000`

## Triển khai lên Render

1. Đẩy toàn bộ thư mục này lên GitHub.
2. Vào Render và tạo **Web Service** từ repo GitHub của bạn.
3. Chọn:
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Thêm nếu cần:
   - `PORT` thường Render sẽ tự set
5. Deploy.

## Lưu ý
- Đây là dashboard theo dõi tin công khai. Không phải hệ thống y tế chính thức.
- Kết quả trích xuất vị trí phụ thuộc vào nội dung bài báo và có thể sai lệch.
- Nếu muốn chính xác hơn, hãy thêm nguồn dữ liệu chuyên môn hoặc tích hợp mô hình AI/LLM riêng của bạn.
