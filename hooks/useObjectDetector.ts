import React, { useState, useEffect, useRef, useCallback } from 'react';
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

    const onnxSessionRef = useRef<ort.InferenceSession | null>(null);
    const isProcessingRef = useRef(false);
    const latestFrameRef = useRef<ImageData | null>(null);
    const animationFrameId = useRef<number>();

    const loadModel = useCallback(async () => {
        if (!enabled || onnxSessionRef.current) return;
        console.log("Starting model load...");
        setIsLoadingModel(true);
        setModelError(null);
        
        try {
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
            const modelResponse = await fetch(MODEL_PATH, { cache: 'no-store' });
             if (!modelResponse.ok) {
                throw new Error(`Model fetch failed with status: ${modelResponse.status}`);
            }
            console.log("Model fetched successfully.");
            const modelBuffer = await modelResponse.arrayBuffer();
            console.log("Creating ONNX session...");
            const session = await ort.InferenceSession.create(modelBuffer);
            onnxSessionRef.current = session;
            console.log("ONNX session created successfully.");
        } catch (e) {
            console.error('Failed to load ONNX model:', e);
            setModelError(`Error: Failed to load model. ${(e as Error).message}`);
        }
        setIsLoadingModel(false);
    }, [enabled]);

    useEffect(() => {
        loadModel();
    }, [loadModel]);

    const preprocess = useCallback((imageData: ImageData): ort.Tensor => {
        const { width, height } = imageData;
        
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
    
        const float32Data = new Float32Array(3 * MODEL_WIDTH * MODEL_HEIGHT);
        for (let i = 0; i < resizedImageData.data.length; i += 4) {
            const j = i / 4;
            float32Data[j] = resizedImageData.data[i] / 255.0;
            float32Data[MODEL_WIDTH * MODEL_HEIGHT + j] = resizedImageData.data[i + 1] / 255.0;
            float32Data[2 * MODEL_WIDTH * MODEL_HEIGHT + j] = resizedImageData.data[i + 2] / 255.0;
        }
        
        return new ort.Tensor('float32', float32Data, [1, 3, MODEL_HEIGHT, MODEL_WIDTH]);
    }, []);
    
    const postprocess = useCallback((output: Float32Array): DetectionBox[] => {
        const boxes: DetectionBox[] = [];
        const numClasses = 80;
        const numProposals = 25200;
        const boxStride = numClasses + 5;
        
        if (output.length !== numProposals * boxStride) {
            console.warn(`Unexpected output length: ${output.length}, expected: ${numProposals * boxStride}`);
            return [];
        }
        
        let detectionsCount = 0;
        for (let i = 0; i < numProposals; i++) {
            const offset = i * boxStride;
            const confidence = output[offset + 4];
            
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
                detectionsCount++;
                const centerX = output[offset];
                const centerY = output[offset + 1];
                const width = output[offset + 2];
                const height = output[offset + 3];
    
                boxes.push({
                    x: centerX - width / 2, y: centerY - height / 2, w: width, h: height,
                    score: finalScore, classId,
                });
            }
        }
        
        if(detectionsCount > 0) {
             console.log(`Found ${detectionsCount} potential objects before filtering.`);
        }

        const finalDetections = nonMaxSuppression(boxes);
        if(finalDetections.length > 0) {
            console.log(`Final detections after filtering: ${finalDetections.length}`);
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
        if (!onnxSessionRef.current || isProcessingRef.current || !latestFrameRef.current) {
            animationFrameId.current = requestAnimationFrame(runDetectionLoop);
            return;
        }
        
        isProcessingRef.current = true;
        const currentFrame = latestFrameRef.current;
        latestFrameRef.current = null;
    
        try {
            console.log("Running inference on a new frame...");
            const inputTensor = preprocess(currentFrame);
            const inputName = onnxSessionRef.current.inputNames[0];
            const feeds = { [inputName]: inputTensor };
            const results = await onnxSessionRef.current.run(feeds);
            console.log("Inference complete. Post-processing results...");
            const newDetections = postprocess(results.output.data as Float32Array);
            setDetections(newDetections);

        } catch(e) {
            console.error('Detection error:', e);
        }
        
        isProcessingRef.current = false;
        animationFrameId.current = requestAnimationFrame(runDetectionLoop);
    }, [preprocess, postprocess]);
    
    useEffect(() => {
        const video = videoRef.current;
        if (!enabled || !video) {
            return;
        }

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
            }
            frameCaptureId = requestAnimationFrame(captureFrame);
        }

        const onPlay = () => {
            console.log("Video is playing. Starting detection loop.");
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

    return { detections, isLoadingModel, modelError };
};

export default useObjectDetector;