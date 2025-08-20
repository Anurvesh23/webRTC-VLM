import React, { useState, useEffect } from 'react';
import * as ort from 'onnxruntime-web';
import { MODEL_PATH, MODEL_WIDTH, MODEL_HEIGHT, CONFIDENCE_THRESHOLD, COCO_CLASSES } from '../constants';
import type { DetectionBox } from '../types';

const TestDetection: React.FC = () => {
    const [status, setStatus] = useState('Initializing...');
    const [detections, setDetections] = useState<DetectionBox[]>([]);
    const [testImage, setTestImage] = useState<HTMLCanvasElement | null>(null);

    useEffect(() => {
        // Create a simple test image
        const canvas = document.createElement('canvas');
        canvas.width = MODEL_WIDTH;
        canvas.height = MODEL_HEIGHT;
        const ctx = canvas.getContext('2d')!;
        
        // Draw some test objects
        ctx.fillStyle = 'red';
        ctx.fillRect(100, 100, 200, 150); // Rectangle
        
        ctx.fillStyle = 'blue';
        ctx.fillRect(300, 200, 100, 100); // Square
        
        ctx.fillStyle = 'green';
        ctx.beginPath();
        ctx.arc(500, 300, 50, 0, 2 * Math.PI);
        ctx.fill(); // Circle
        
        setTestImage(canvas);
    }, []);

    const runTest = async () => {
        if (!testImage) return;
        
        setStatus('Loading model...');
        try {
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
            
            const modelResponse = await fetch(MODEL_PATH);
            if (!modelResponse.ok) {
                throw new Error(`HTTP ${modelResponse.status} fetching model`);
            }
            
            const modelBuffer = await modelResponse.arrayBuffer();
            setStatus('Creating session...');
            
            const session = await ort.InferenceSession.create(modelBuffer);
            setStatus('Running inference...');
            
            // Get image data
            const ctx = testImage.getContext('2d')!;
            const imageData = ctx.getImageData(0, 0, MODEL_WIDTH, MODEL_HEIGHT);
            
            // Preprocess
            const float32Data = new Float32Array(3 * MODEL_WIDTH * MODEL_HEIGHT);
            for (let i = 0; i < imageData.data.length; i += 4) {
                const j = i / 4;
                float32Data[j] = imageData.data[i] / 255.0;
                float32Data[MODEL_WIDTH * MODEL_HEIGHT + j] = imageData.data[i + 1] / 255.0;
                float32Data[2 * MODEL_WIDTH * MODEL_HEIGHT + j] = imageData.data[i + 2] / 255.0;
            }
            
            const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, MODEL_HEIGHT, MODEL_WIDTH]);
            
            // Get the input name from the model
            const inputNames = session.inputNames;
            const inputName = inputNames[0];
            console.log('Model input names:', inputNames);
            
            const results = await session.run({ [inputName]: inputTensor });
            setStatus('Processing results...');
            
            // Process results
            const output = results.output.data as Float32Array;
            console.log('Test output shape:', results.output.dims);
            console.log('Test output length:', output.length);
            
            const boxes: DetectionBox[] = [];
            const numClasses = 80;
            const numProposals = 25200;
            const boxStride = numClasses + 5;
            
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
            
            setDetections(boxes);
            setStatus(`Test completed! Found ${boxes.length} detections`);
            
        } catch (error) {
            setStatus(`Error: ${(error as Error).message}`);
            console.error('Test failed:', error);
        }
    };

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold mb-4">Model Test</h2>
            <div className="mb-4">
                <button 
                    onClick={runTest}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                    Run Test
                </button>
            </div>
            
            <div className="mb-4">
                <p className="text-sm text-gray-400">{status}</p>
            </div>
            
            {testImage && (
                <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2">Test Image:</h3>
                    <canvas 
                        ref={(canvas) => {
                            if (canvas && testImage) {
                                const ctx = canvas.getContext('2d')!;
                                ctx.drawImage(testImage, 0, 0);
                            }
                        }}
                        width={MODEL_WIDTH}
                        height={MODEL_HEIGHT}
                        className="border border-gray-300"
                    />
                </div>
            )}
            
            {detections.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold mb-2">Detections:</h3>
                    <div className="space-y-2">
                        {detections.map((det, index) => (
                            <div key={index} className="text-sm">
                                <span className="font-mono">
                                    {COCO_CLASSES[det.classId] || `Class ${det.classId}`}: 
                                    {det.score.toFixed(3)} at [{det.x.toFixed(1)}, {det.y.toFixed(1)}, {det.w.toFixed(1)}, {det.h.toFixed(1)}]
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TestDetection;
