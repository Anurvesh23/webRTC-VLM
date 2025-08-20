import React,{ useState, useEffect, useRef, useCallback } from 'react';
import * as ort from 'onnxruntime-web';
import { MODEL_PATH, MODEL_WIDTH, MODEL_HEIGHT, CONFIDENCE_THRESHOLD, NMS_IOU_THRESHOLD } from '../constants';
import type { DetectionBox } from '../types';

const useObjectDetector = (
    videoRef: React.RefObject<HTMLVideoElement>,
    enabled: boolean
) => {
    const [detections, setDetections] = useState<DetectionBox[]>([]);
    const [isLoadingModel, setIsLoadingModel] = useState(false);
    const [modelError, setModelError] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<string>('');
    const onnxSessionRef = useRef<ort.InferenceSession | null>(null);
    const isProcessingRef = useRef(false);
    const latestFrameRef = useRef<ImageData | null>(null);
    const animationFrameId = useRef<number>();
    const frameCountRef = useRef(0);
    const loadModel = useCallback(async () => {
        if (!enabled || onnxSessionRef.current) return;
        console.log('[DEBUG] Starting model load...');
        setIsLoadingModel(true);
        setModelError(null);
        setDebugInfo('Loading model...');
        try {
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
            console.log('[DEBUG] Fetching model from:', MODEL_PATH);
            const modelResponse = await fetch(MODEL_PATH, { cache: 'no-store' });
            console.log('[DEBUG] Model response status:', modelResponse.status);
            console.log('[DEBUG] Model response headers:', Object.fromEntries(modelResponse.headers.entries()));
            if (!modelResponse.ok) {
                throw new Error(`HTTP ${modelResponse.status} fetching ${MODEL_PATH}`);
            }
            const contentType = modelResponse.headers.get('content-type') || '';
            console.log('[DEBUG] Content-Type:', contentType);
            if (contentType.includes('text/html')) {
                throw new Error(`Expected binary model but received HTML (check that /models/yolov5n-quantized.onnx exists in public/)`);
            }

            const modelBuffer = await modelResponse.arrayBuffer();

            console.log('[DEBUG] Model buffer size:', modelBuffer.byteLength, 'bytes');
            console.log('[DEBUG] Creating ONNX session...');

            const session = await ort.InferenceSession.create(modelBuffer);

            onnxSessionRef.current = session;

            console.log('[DEBUG] Model loaded successfully!');

            setDebugInfo('Model loaded successfully');

        } catch (e) {

            console.error('Failed to load ONNX model:', e);

            setModelError(`Error: Failed to load model. ${(e as Error).message}`);

            setDebugInfo(`Model load failed: ${(e as Error).message}`);

        }

        setIsLoadingModel(false);

    }, [enabled]);



    useEffect(() => {

        loadModel();

    }, [loadModel]);

    const preprocess = useCallback((imageData: ImageData): ort.Tensor => {

        const { data, width, height } = imageData;

        console.log('[DEBUG] Preprocessing frame:', width, 'x', height);

        const tempCanvas = document.createElement('canvas');

        tempCanvas.width = MODEL_WIDTH;

        tempCanvas.height = MODEL_HEIGHT;

        const tempCtx = tempCanvas.getContext('2d')!;

       

        const tempImgCanvas = document.createElement('canvas');

        tempImgCanvas.width = width;

        tempImgCanvas.height = height;

        tempImgCanvas.getContext('2d')!.putImageData(imageData, 0, 0);

       

        tempCtx.drawImage(tempImgCanvas, 0, 0, MODEL_WIDTH, MODEL_HEIGHT);

        const resizedImageData = tempCtx.getImageData(0, 0, MODEL_WIDTH, MODEL_HEIGHT);

   

        // YOLOv5 expects RGB format with values normalized to [0, 1]

        const float32Data = new Float32Array(3 * MODEL_WIDTH * MODEL_HEIGHT);

        for (let i = 0; i < resizedImageData.data.length; i += 4) {

            const j = i / 4;

            // RGB channels

            float32Data[j] = resizedImageData.data[i] / 255.0;     // R

            float32Data[MODEL_WIDTH * MODEL_HEIGHT + j] = resizedImageData.data[i + 1] / 255.0; // G

            float32Data[2 * MODEL_WIDTH * MODEL_HEIGHT + j] = resizedImageData.data[i + 2] / 255.0; // B

        }

        console.log('[DEBUG] Input tensor shape: [1, 3,', MODEL_HEIGHT, ',', MODEL_WIDTH, ']');

        console.log('[DEBUG] Input tensor size:', float32Data.length);

        return new ort.Tensor('float32', float32Data, [1, 3, MODEL_HEIGHT, MODEL_WIDTH]);

    }, []);

    const postprocess = useCallback((output: Float32Array): DetectionBox[] => {

        console.log('[DEBUG] Postprocessing output, length:', output.length);

        console.log('[DEBUG] Output shape expected: 25200 x 85 (5 + 80 classes)');

        const boxes: DetectionBox[] = [];

        const numClasses = 80;

        const numProposals = 25200;

        const boxStride = numClasses + 5;

        // Check if output length matches expected format

        if (output.length !== numProposals * boxStride) {

            console.warn(`[DEBUG] Unexpected output length: ${output.length}, expected: ${numProposals * boxStride}`);

            // Try alternative format: [1, 25200, 85]

            if (output.length === numProposals * boxStride) {

                console.log('[DEBUG] Using standard YOLOv5 output format');

            } else {
                console.error('[DEBUG] Unknown output format, cannot process');
                return [];
            }
        }

        for (let i = 0; i < numProposals; i++) {

            const offset = i * boxStride;

            const confidence = output[offset + 4];

            // Debug first few proposals

            if (i < 5) {

                console.log(`[DEBUG] Proposal ${i}: confidence=${confidence.toFixed(4)}`);

            }
            if (confidence < CONFIDENCE_THRESHOLD) continue;
            let maxProb = 0;
            let classId = 0;
            for (let j = 0; j < numClasses; j++) {

                const classProb = output[offset + 5 + j];

                if (classProb > maxProb) {

                    maxProb = classProb;

                    classId = j;

                }

            }

            const finalScore = maxProb * confidence;

            if (finalScore > CONFIDENCE_THRESHOLD) {

                const centerX = output[offset];

                const centerY = output[offset + 1];

                const width = output[offset + 2];

                const height = output[offset + 3];
                boxes.push({

                    x: centerX - width / 2, y: centerY - height / 2, w: width, h: height,

                    score: finalScore, classId,

                });

                // Debug first few detections

                if (boxes.length <= 3) {

                    console.log(`[DEBUG] Detection ${boxes.length}: class=${classId}, score=${finalScore.toFixed(4)}, bbox=[${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${width.toFixed(1)}, ${height.toFixed(1)}]`);

                }

            }

        }

        console.log('[DEBUG] Raw detections before NMS:', boxes.length);

        const finalDetections = nonMaxSuppression(boxes);

        console.log('[DEBUG] Final detections after NMS:', finalDetections.length);

        if (finalDetections.length > 0) {

            console.log('[DEBUG] Detection details:', finalDetections.map(d => ({

                class: d.classId,

                score: d.score.toFixed(3),

                bbox: [d.x.toFixed(1), d.y.toFixed(1), d.w.toFixed(1), d.h.toFixed(1)]

            })));

        }

        return finalDetections;

    }, []);

    const nonMaxSuppression = (boxes: DetectionBox[]): DetectionBox[] => {

        const sortedBoxes = boxes.sort((a, b) => b.score - a.score);

        const result: DetectionBox[] = [];

        while (sortedBoxes.length > 0) {

            result.push(sortedBoxes[0]);

            const current = sortedBoxes.shift()!;

            for (let i = sortedBoxes.length - 1; i >= 0; i--) {

                const iou = calculateIoU(current, sortedBoxes[i]);

                if (iou > NMS_IOU_THRESHOLD) {

                    sortedBoxes.splice(i, 1);
                }
            }
        }
        return result;
    };

    const calculateIoU = (box1: DetectionBox, box2: DetectionBox): number => {

        const x1 = Math.max(box1.x, box2.x);

        const y1 = Math.max(box1.y, box2.y);

        const x2 = Math.min(box1.x + box1.w, box2.x + box2.w);

        const y2 = Math.min(box1.y + box1.h, box2.y + box2.h);

        const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);

        const union = box1.w * box1.h + box2.w * box2.h - intersection;

        return intersection / union;

    };

    const runDetectionLoop = useCallback(async () => {

        if (!onnxSessionRef.current) {

            console.log('[DEBUG] No ONNX session, skipping detection');

            animationFrameId.current = requestAnimationFrame(runDetectionLoop);

            return;

        }

        if (isProcessingRef.current) {
            console.log('[DEBUG] Already processing, skipping frame');
            animationFrameId.current = requestAnimationFrame(runDetectionLoop);
            return;
        }

        if (!latestFrameRef.current) {

            console.log('[DEBUG] No frame available, skipping detection');

            animationFrameId.current = requestAnimationFrame(runDetectionLoop);

            return;

        }
        isProcessingRef.current = true;

        frameCountRef.current++;

        const currentFrame = latestFrameRef.current;

        latestFrameRef.current = null;

        console.log(`[DEBUG] Processing frame ${frameCountRef.current}`);

        try {
            const inputTensor = preprocess(currentFrame);

            // Get the input name from the model
            const inputNames = onnxSessionRef.current.inputNames;
            const inputName = inputNames[0]; // Use the first input
            console.log('[DEBUG] Model input names:', inputNames);
            console.log('[DEBUG] Using input name:', inputName);
            const feeds = { [inputName]: inputTensor };
            console.log('[DEBUG] Running inference...');
            const results = await onnxSessionRef.current.run(feeds);
            console.log('[DEBUG] Inference completed, output shape:', results.output.dims);
            console.log('[DEBUG] Output tensor size:', results.output.data.length);

            // Check if we have the expected output format
            const outputShape = results.output.dims;
            if (outputShape.length === 3 && outputShape[0] === 1 && outputShape[1] === 25200 && outputShape[2] === 85) {
                console.log('[DEBUG] Using standard YOLOv5 output format [1, 25200, 85]');
                const newDetections = postprocess(results.output.data as Float32Array);
                setDetections(newDetections);
                setDebugInfo(`Processed ${frameCountRef.current} frames, ${newDetections.length} detections`);
            } else if (outputShape.length === 2 && outputShape[0] === 25200 && outputShape[1] === 85) {
                console.log('[DEBUG] Using flattened YOLOv5 output format [25200, 85]');
                const newDetections = postprocess(results.output.data as Float32Array);
                setDetections(newDetections);
                setDebugInfo(`Processed ${frameCountRef.current} frames, ${newDetections.length} detections`);
            } else {
                console.error('[DEBUG] Unexpected output format:', outputShape);
                setDebugInfo(`Unexpected output format: ${outputShape.join('x')}`);
            }
        } catch(e) {
            console.error('[DEBUG] Detection error:', e);
            setDebugInfo(`Detection error: ${(e as Error).message}`);
        }
        isProcessingRef.current = false;
        animationFrameId.current = requestAnimationFrame(runDetectionLoop);
    }, [preprocess, postprocess]);

    useEffect(() => {
        const video = videoRef.current;
        if (!enabled || !video) {
            console.log('[DEBUG] Detection disabled or no video element');
            return;
        }
        console.log('[DEBUG] Setting up video capture...');
        let frameCaptureId: number;
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        const captureFrame = () => {
            if (video.paused || video.ended) {
                frameCaptureId = requestAnimationFrame(captureFrame);
                return;
            }
            if (tempCtx && video.videoWidth > 0) {
                tempCanvas.width = video.videoWidth;
                tempCanvas.height = video.videoHeight;
                tempCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                latestFrameRef.current = tempCtx.getImageData(0, 0, video.videoWidth, video.videoHeight);
                console.log('[DEBUG] Captured frame:', video.videoWidth, 'x', video.videoHeight);
            }
            frameCaptureId = requestAnimationFrame(captureFrame);
        }
        const onPlay = () => {
            console.log('[DEBUG] Video started playing, starting detection loop');
            frameCaptureId = requestAnimationFrame(captureFrame);
            animationFrameId.current = requestAnimationFrame(runDetectionLoop);
        };
        video.addEventListener('play', onPlay);
        return () => {
            video.removeEventListener('play', onPlay);
            if (frameCaptureId) cancelAnimationFrame(frameCaptureId);
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, [enabled, videoRef, runDetectionLoop]);
    return { detections, isLoadingModel, modelError, debugInfo };
};
export default useObjectDetector;