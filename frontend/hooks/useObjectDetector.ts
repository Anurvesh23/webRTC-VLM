import { useState, useEffect, useRef } from 'react';
import * as ort from 'onnxruntime-web';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import { DetectionBox, ExtendedMetrics } from '../types';
import { preprocess, postprocess } from '../utils/yolo';

const useObjectDetector = (videoRef: React.RefObject<HTMLVideoElement>, isStreamActive: boolean) => {
    const [detections, setDetections] = useState<DetectionBox[]>([]);
    const [isLoadingModel, setIsLoadingModel] = useState(true);
    const [modelError, setModelError] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<ExtendedMetrics>({
        latencies: [],
        frameCount: 0,
        isBenchmarking: false,
        startTime: 0,
        fps: 0,
        p95Latency: 0,
        medianLatency: 0,
        totalFrames: 0, // New metric
        startBenchmark: () => {},
        stopBenchmark: () => ({ median_e2e_latency_ms: 0, p95_e2e_latency_ms: 0, processed_fps: 0 }),
    });

    const sessionRef = useRef<InferenceSession | null>(null);
    const isProcessingRef = useRef(false);
    const frameCountRef = useRef(0);
    const secondTimerRef = useRef(Date.now());
    const latenciesRef = useRef<number[]>([]);

    useEffect(() => {
        const loadModel = async () => {
            try {
                ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
                const newSession = await InferenceSession.create('/models/yolov5n-quantized.onnx');
                sessionRef.current = newSession;
                setIsLoadingModel(false);
            } catch (error) {
                console.error("Error loading ONNX model:", error);
                setModelError("Failed to load model.");
                setIsLoadingModel(false);
            }
        };
        loadModel();
    }, []);

    useEffect(() => {
        const detectObjects = async () => {
            if (
                !isStreamActive ||
                isProcessingRef.current ||
                !sessionRef.current ||
                !videoRef.current ||
                videoRef.current.readyState < 3
            ) {
                requestAnimationFrame(detectObjects);
                return;
            }

            isProcessingRef.current = true;
            const startTime = performance.now();

            const video = videoRef.current;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) {
                isProcessingRef.current = false;
                requestAnimationFrame(detectObjects);
                return;
            }
            tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

            const inputTensor = preprocess(imageData);
            const feeds: Record<string, Tensor> = {};
            feeds[sessionRef.current.inputNames[0]] = inputTensor;

            try {
                const results = await sessionRef.current.run(feeds);
                const outputTensor = results[sessionRef.current.outputNames[0]];
                const newDetections = postprocess(outputTensor);
                setDetections(newDetections);
                
                const latency = performance.now() - startTime;
                latenciesRef.current.push(latency);
                if (latenciesRef.current.length > 100) {
                    latenciesRef.current.shift(); // Keep last 100 latencies
                }

                frameCountRef.current++;
                if (Date.now() - secondTimerRef.current > 1000) {
                    const sortedLatencies = [...latenciesRef.current].sort((a, b) => a - b);
                    
                    setMetrics(prev => ({
                        ...prev,
                        fps: frameCountRef.current,
                        p95Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
                        medianLatency: sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0,
                        totalFrames: prev.totalFrames + frameCountRef.current,
                    }));

                    frameCountRef.current = 0;
                    secondTimerRef.current = Date.now();
                }

            } catch (error) {
                console.error("Inference failed:", error);
            }

            isProcessingRef.current = false;
            requestAnimationFrame(detectObjects);
        };

        if (isStreamActive && !isLoadingModel) {
            detectObjects();
        }
    }, [isStreamActive, isLoadingModel, videoRef]);

    return { detections, isLoadingModel, modelError, metrics };
};

export default useObjectDetector;