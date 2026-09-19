BỘ KHUNG WEBGIS METRO HCM

1. Chép 2 file GeoJSON do ArcGIS Pro xuất vào thư mục data:
   - metro_line1.geojson
   - metro_stations.geojson

2. Không nên mở index.html bằng double-click vì fetch() có thể bị trình duyệt chặn.

3. Cách chạy đơn giản:
   - VS Code + Live Server, hoặc
   - mở Terminal/Command Prompt trong thư mục này và chạy:
       python -m http.server 8000
   - sau đó mở:
       http://localhost:8000

4. Nếu bản đồ hiện tuyến + 14 ga thì bước WebGIS cơ bản đã hoàn thành.

Bước tiếp theo:
- tạo marker tàu;
- nội suy vị trí tàu dọc theo tuyến;
- chạy 2 chiều Bến Thành <-> Suối Tiên;
- thêm lịch chạy/ETA.
