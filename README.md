# Real-time WebRTC VLM Multi-Object Detection

This project performs real-time multi-object detection on a live video stream from a phone's browser to a desktop browser using WebRTC and in-browser WASM inference with a YOLOv5 model.

## Features

-   **Phone to Browser Streaming**: No app installation needed; uses the phone's web browser.
-   **Reproducible Environment**: Dockerized for a reliable one-command start.
-   **In-browser Object Detection**: Uses ONNX Runtime (WASM) for efficient, client-side inference.
-   **Simple Connection**: Scan a QR code to connect the phone.
-   **Benchmarking**: Includes a script to generate performance metrics.

## Tech Stack

-   **Frontend**: React, TypeScript, Vite, Tailwind CSS
-   **Real-time Communication**: WebRTC, Socket.IO
-   **Object Detection**: ONNX Runtime Web (WASM), YOLOv5

## Quick Start

### Prerequisites

-   Docker and Docker Compose

### Instructions

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/Anurvesh23/webRTC-VLM.git](https://github.com/Anurvesh23/webRTC-VLM.git)
    cd webRTC-VLM
    ```

2.  **Run the application:**
    This single command will build the Docker images and start all services in the background.
    ```bash
    chmod +x start.sh
    ./start.sh
    ```

3.  **Connect your Phone:**
    -   Open **http://localhost:3000** in your desktop browser.
    -   Scan the on-screen QR code with your phone.
    -   Allow camera permissions on your phone when prompted.
    -   The live video stream with object detection overlays will appear on your desktop.

## Benchmarking

To generate the `metrics.json` file as required:

1.  With the application running, open your browser's **Developer Console** (F12 or Ctrl+Shift+I).
2.  Type the following command and press Enter to start a 30-second test:
    ```javascript
    window.startBenchmark()
    ```
3.  After 30 seconds, type this command and press Enter to stop the test and download the results:
    ```javascript
    window.stopBenchmark()
    ```
4.  A `metrics.json` file will be saved to your browser's default download location.