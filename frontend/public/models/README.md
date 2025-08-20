Place your ONNX model here as `yolov5n-quantized.onnx` so it is served at `/models/yolov5n-quantized.onnx`.

On Netlify or any static host:
- Ensure this file is uploaded (not empty). The app fetches it from `/models/yolov5n-quantized.onnx`.
- Netlify usually serves unknown binaries with `application/octet-stream`. If it serves HTML (redirect/404), the loader will fail with a protobuf parsing error. Verify by opening the URL directly.
