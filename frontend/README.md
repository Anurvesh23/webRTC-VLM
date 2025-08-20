# Real-time WebRTC VLM Multi-Object Detection

This is a React application that demonstrates real-time multi-object detection on a live video stream from a phone's browser to a desktop browser using WebRTC and in-browser WASM inference with a YOLOv5 model.

## Features

  * **Real-time Video Streaming**: Streams video from a phone's camera to a desktop browser in real-time using WebRTC.
  * **In-browser Object Detection**: Performs multi-object detection directly in the browser using ONNX Runtime and a quantized YOLOv5 model.
  * **Desktop and Phone Views**: A dedicated view for the desktop to receive and process the video, and a separate view for the phone to send the camera feed.
  * **Signaling Server**: Uses a simple Socket.IO server for WebRTC signaling.
  * **Switchable Camera**: The phone view allows switching between the front and rear cameras.

## How It Works

The application is split into two main components:

1.  **`PhoneView`**: This is designed to be opened on a mobile device. It accesses the phone's camera and streams the video feed to the `DesktopView` using WebRTC.
2.  **`DesktopView`**: This is opened on a desktop browser. It receives the video stream from the `PhoneView` and performs real-time object detection on the frames using a YOLOv5 model running in the browser with ONNX Runtime.

A **Signaling Server** (`server.js`) is used to facilitate the WebRTC connection between the phone and the desktop.

## Tech Stack

  * **Frontend**: React, TypeScript, Vite, Tailwind CSS
  * **Real-time Communication**: WebRTC, Socket.IO
  * **Object Detection**: ONNX Runtime Web, YOLOv5

## Getting Started

### Prerequisites

  * Node.js
  * A desktop computer and a mobile phone on the same network.

### Installation & Running

1.  **Clone the repository and install dependencies**:

    ```bash
    git clone https://github.com/your-username/webrtc-vlm.git
    cd webrtc-vlm
    npm install
    ```

2.  **Start the signaling server**:

    In a separate terminal, run the following command:

    ```bash
    npm run signal
    ```

    This will start the signaling server on port 3001.

3.  **Run the development server**:

    In another terminal, run:

    ```bash
    npm run dev
    ```

    This will start the Vite development server, usually on port 5173.

4.  **Connect the devices**:

      * Open the desktop view URL in your desktop browser (e.g., `http://<your-local-ip>:5173`).
      * Scan the QR code on the desktop view with your phone to open the phone view.

## Deployment

This application can be deployed to any static hosting service, such as Netlify or Vercel. You will also need to deploy the signaling server (`server.js`) to a service that supports Node.js, like Render or Railway.

The `netlify.toml` file is included for easy deployment to Netlify.

## Project Structure

```
.
├── public
│   └── models
│       ├── yolov5n-quantized.onnx  # The ONNX model for object detection
│       └── README.md
├── src
│   ├── components
│   │   ├── DesktopView.tsx       # The main view for the desktop browser
│   │   └── PhoneView.tsx         # The view for the phone's camera
│   ├── hooks
│   │   └── useObjectDetector.ts  # Custom hook for ONNX object detection
│   ├── App.tsx                   # Main application component with routing
│   ├── index.tsx                 # Entry point for the React application
│   ├── constants.ts              # Project constants
│   └── types.ts                  # TypeScript types
├── server.js                     # The Socket.IO signaling server
└── package.json                  # Project dependencies and scripts
```
