
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import qrcode from 'qrcode-generator';
import useObjectDetector from '../hooks/useObjectDetector';
import { SIGNALING_SERVER_URL, API_SERVER_URL, ICE_SERVERS, COCO_CLASSES, MODEL_WIDTH, MODEL_HEIGHT } from '../constants';
import type { DetectionBox, Metrics } from '../types';

const DesktopView: React.FC = () => {
    const [status, setStatus] = useState('Initializing...');
    const [mode, setMode] = useState('wasm');
    const [showQr, setShowQr] = useState(true);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const metricsRef = useRef<Metrics>({ latencies: [], frameCount: 0, isBenchmarking: false, startTime: 0 });

    const { detections, isLoadingModel, modelError } = useObjectDetector(videoRef, mode === 'wasm' && remoteStream !== null);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const modeParam = urlParams.get('mode') || 'wasm';
        setMode(modeParam);
        setStatus(`Mode: ${modeParam.toUpperCase()}. Waiting for phone to connect...`);

        const portSegment = window.location.port ? `:${window.location.port}` : '';
        const phoneUrl = `${window.location.protocol}//${window.location.hostname}${portSegment}/#/phone`;
        const qr = qrcode(0, 'L');
        qr.addData(phoneUrl);
        qr.make();
        const qrElement = document.getElementById('qrcode');
        if (qrElement) {
            qrElement.innerHTML = qr.createImgTag(5, 5);
        }
    }, []);

    const setupSignaling = useCallback(() => {
        const socket = io(SIGNALING_SERVER_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join');
        });

        socket.on('existing-peers', (peers: string[]) => {
            if (peers.length > 0) {
                setStatus('Phone detected! Creating WebRTC connection...');
                createPeerConnection(peers[0]);
            }
        });

        socket.on('user-joined', (peerId: string) => {
            setStatus('Phone detected! Creating WebRTC connection...');
            createPeerConnection(peerId);
        });

        socket.on('answer', async (payload: { answer: RTCSessionDescriptionInit }) => {
            if (peerConnectionRef.current) {
                try {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
                } catch (error) {
                    console.error('Error setting remote description:', error);
                }
            }
        });

        socket.on('ice-candidate', (payload: { candidate: RTCIceCandidateInit }) => {
            if (peerConnectionRef.current) {
                peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [mode]);

    useEffect(() => {
        const cleanup = setupSignaling();
        return cleanup;
    }, [setupSignaling]);

    const createPeerConnection = useCallback(async (peerId: string) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit('ice-candidate', { target: peerId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
                if (videoRef.current) {
                    videoRef.current.srcObject = event.streams[0];
                }
                setStatus('Video stream connected!');
                setShowQr(false);
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (mode === 'wasm') {
            if (socketRef.current) {
                socketRef.current.emit('offer', { from: socketRef.current.id, target: peerId, offer });
            }
        } else {
            // Server mode handshake
            try {
                const response = await fetch(`${API_SERVER_URL}/offer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sdp: offer.sdp, type: offer.type })
                });
                const answer = await response.json();
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error("Server mode handshake failed:", error);
                setStatus("Error: Failed to connect to server.");
            }
        }
    }, [mode]);

    const drawDetections = useCallback((detectionsToDraw: DetectionBox[]) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        detectionsToDraw.forEach(det => {
            const { x, y, w, h, score, classId } = det;
            const rectX = (x / MODEL_WIDTH) * canvas.width;
            const rectY = (y / MODEL_HEIGHT) * canvas.height;
            const rectWidth = (w / MODEL_WIDTH) * canvas.width;
            const rectHeight = (h / MODEL_HEIGHT) * canvas.height;

            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 3;
            ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

            const label = `${COCO_CLASSES[classId]}: ${score.toFixed(2)}`;
            ctx.fillStyle = '#10B981';
            ctx.font = '16px sans-serif';
            const textWidth = ctx.measureText(label).width;
            ctx.fillRect(rectX, rectY > 20 ? rectY - 22 : rectY, textWidth + 8, 22);
            
            ctx.fillStyle = '#000000';
            ctx.fillText(label, rectX + 4, rectY > 20 ? rectY - 5 : rectY + 16);
        });
    }, []);

    useEffect(() => {
        if (detections.length > 0) {
            drawDetections(detections);
        } else {
            // Clear canvas if no detections
            const canvas = canvasRef.current;
             if(canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
             }
        }
    }, [detections, drawDetections]);
    
    useEffect(() => {
        const startBenchmark = () => {
            metricsRef.current = { latencies: [], frameCount: 0, isBenchmarking: true, startTime: performance.now() };
            console.log("--- BENCHMARK STARTED ---");
            return "Benchmark started. Run window.stopBenchmark() after 30 seconds.";
        };

        const stopBenchmark = () => {
            if (!metricsRef.current.isBenchmarking) return "Benchmark not started.";
            metricsRef.current.isBenchmarking = false;
            const duration = (performance.now() - metricsRef.current.startTime) / 1000;
            const fps = metricsRef.current.frameCount / duration;
            const sortedLatencies = metricsRef.current.latencies.sort((a, b) => a - b);
            const medianLatency = sortedLatencies[Math.floor(sortedLatencies.length / 2)] || 0;
            const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;

            const result = {
                median_e2e_latency_ms: parseFloat(medianLatency.toFixed(2)),
                p95_e2e_latency_ms: parseFloat(p95Latency.toFixed(2)),
                processed_fps: parseFloat(fps.toFixed(2)),
            };
            
            const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'metrics.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log("--- BENCHMARK FINISHED ---");
            console.table(result);
            return "Benchmark finished. metrics.json has been downloaded.";
        };

        (window as any).startBenchmark = startBenchmark;
        (window as any).stopBenchmark = stopBenchmark;

    }, []);


    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8">
            <header className="text-center mb-6">
                <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">Real-time Multi-Object Detection</h1>
                <p className="text-lg text-gray-400 mt-2">Powered by WebRTC & ONNX Runtime (WASM)</p>
            </header>

            <div className="w-full max-w-4xl bg-gray-800 p-2 rounded-xl shadow-2xl border border-gray-700">
                <div className="w-full text-center py-2 px-4 bg-gray-900 rounded-t-lg">
                    <p className="font-mono text-sm text-green-400 animate-pulse">{isLoadingModel ? "Loading Model..." : (modelError || status)}</p>
                </div>
                <div className="relative w-full aspect-video bg-black rounded-b-lg overflow-hidden">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
                    <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
                </div>
            </div>

            {showQr && (
                <div className="mt-8 p-6 bg-white rounded-lg shadow-lg text-center text-gray-800 flex flex-col items-center">
                    <h2 className="text-xl font-semibold mb-4">Scan with your phone to connect</h2>
                    <div id="qrcode" className="leading-[0]"></div>
                </div>
            )}
        </div>
    );
};

export default DesktopView;
