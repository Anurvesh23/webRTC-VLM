# Design Report: Real-time WebRTC VLM

This report details the key design choices for the real-time object detection application.

### 1. Architecture and Design Choices

The application is architected with a decoupled frontend and signaling server, containerized using Docker for reproducibility.

-   **Frontend**: A **React** application built with **Vite** was chosen for its modern tooling and fast development experience. Object detection is performed client-side using **ONNX Runtime Web (WASM)**, which meets the "low-resource" requirement by running inference directly on the user's CPU without needing a dedicated server or GPU.
-   **Signaling Server**: A minimal **Node.js and Socket.IO** server facilitates the WebRTC handshake. This lightweight setup is ideal for passing the session description protocol (SDP) and ICE candidates needed to establish a direct peer-to-peer connection between the phone and the desktop.
-   **Reproducibility**: **Docker and Docker Compose** were used to encapsulate all dependencies and services. This allows anyone to run the entire application with a single `./start.sh` command, eliminating environment-specific issues and fulfilling a core requirement of the assignment.

### 2. Low-Resource Mode

The primary mode of operation is the low-resource WASM mode.

-   **Implementation**: It leverages a quantized YOLOv5n ONNX model, which is small and optimized for CPU execution. The model is loaded directly into the browser, and video frames are processed in a `requestAnimationFrame` loop.
-   **Advantages**: This approach is highly scalable as it offloads all heavy computation to the client, keeping server costs minimal. It also offers lower latency by avoiding a network round-trip for inference and enhances privacy since the video stream never leaves the local machine.

### 3. Backpressure Policy

To prevent the application from lagging when video frames arrive faster than they can be processed, a **"process latest frame"** backpressure policy was implemented.

-   **Strategy**: One `requestAnimationFrame` loop continuously captures the most recent frame from the video element. A separate processing loop, also on `requestAnimationFrame`, only runs an inference if it is not already busy. This implicitly drops any intermediate frames, ensuring the model is always working on the most up-to-date data and keeping the user-facing overlays as close to real-time as possible.