import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SIGNALING_SERVER_URL, ICE_SERVERS } from '../constants';

const PhoneView: React.FC = () => {
    const [status, setStatus] = useState('Initializing...');
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const setupSignaling = useCallback(() => {
        const socket = io(SIGNALING_SERVER_URL, { transports: ['websocket', 'polling'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[phone] connected to signaling', SIGNALING_SERVER_URL, 'id=', socket.id);
            setStatus('Connected to server. Waiting for desktop...');
            socket.emit('join');
        });

        socket.on('offer', async (payload: { offer: RTCSessionDescriptionInit; from: string }) => {
            setStatus('Desktop detected! Creating connection...');
            createPeerConnection(payload.from, payload.offer);
        });

        socket.on('ice-candidate', (payload: { candidate: RTCIceCandidateInit }) => {
            if (peerConnectionRef.current) {
                peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const startCamera = useCallback(async (mode: 'user' | 'environment') => {
        try {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: mode }
            });

            localStreamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                 videoRef.current.play().catch(e => console.error("Local video play failed:", e));
            }
            return stream;
        } catch (error) {
            console.error('Error accessing camera:', error);
            setStatus('Error: Could not access camera.');
            return null;
        }
    }, []);


    useEffect(() => {
        startCamera(facingMode).then(stream => {
            if (stream) {
                 const cleanup = setupSignaling();
                 return cleanup;
            }
        });

        return () => {
            localStreamRef.current?.getTracks().forEach(track => track.stop());
            socketRef.current?.disconnect();
            peerConnectionRef.current?.close();
        };
    }, []);


    const switchCamera = useCallback(async () => {
        const newFacingMode = facingMode === 'environment' ? 'user' : 'environment';
        const newStream = await startCamera(newFacingMode);

        if (newStream && peerConnectionRef.current) {
            const videoTrack = newStream.getVideoTracks()[0];
            const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
                setStatus(`Switched to ${newFacingMode} camera`);
            }
        }
        setFacingMode(newFacingMode);
    }, [facingMode, startCamera]);


    const createPeerConnection = useCallback(async (peerId: string, offer: RTCSessionDescriptionInit) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                try {
                    pc.addTrack(track, localStreamRef.current!);
                } catch (e) {
                    console.error("Error adding track:", e);
                }
            });
        }

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit('ice-candidate', { target: peerId, candidate: event.candidate });
            }
        };

        pc.oniceconnectionstatechange = () => {
            setStatus(`ICE: ${pc.iceConnectionState}`);
        };

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            if (socketRef.current) {
                socketRef.current.emit('answer', { target: peerId, answer: answer });
            }
        } catch (error) {
            console.error("Error creating peer connection:", error);
        }
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <h1 className="text-3xl font-bold mb-4">Phone Camera</h1>
            <div className="relative w-full max-w-md bg-black rounded-lg overflow-hidden shadow-lg mb-4">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            </div>
            <p className="font-mono text-sm text-green-400 mb-4 animate-pulse">{status}</p>
            <button
                onClick={switchCamera}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-transform transform hover:scale-105"
            >
                Switch Camera
            </button>
        </div>
    );
};

export default PhoneView;