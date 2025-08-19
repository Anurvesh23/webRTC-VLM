
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SIGNALING_SERVER_URL, ICE_SERVERS } from '../constants';

const PhoneView: React.FC = () => {
    const [status, setStatus] = useState('Initializing...');
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    
    const startCamera = useCallback(async () => {
        if (!(navigator.mediaDevices && (navigator.mediaDevices as any).getUserMedia)) {
            setStatus('Camera API unavailable. On iOS this requires opening the page over HTTPS (trusted certificate).');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: 1280, height: 720 },
                audio: false
            });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            setStatus('Camera active. Waiting for desktop connection.');
        } catch (err) {
            console.error('Error accessing camera:', err);
            setStatus(`Error accessing camera: ${(err as Error).message}`);
        }
    }, []);

    const createPeerConnection = useCallback((peerId: string) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit('ice-candidate', { target: peerId, candidate: event.candidate });
            }
        };

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current!);
            });
        }
    }, []);

    useEffect(() => {
        startCamera();

        const socket = io(SIGNALING_SERVER_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            setStatus('Connected to signaling server.');
            socket.emit('join');
        });

        socket.on('offer', async (payload: { from: string; offer: RTCSessionDescriptionInit }) => {
            setStatus('Received offer, creating answer...');
            createPeerConnection(payload.from);
            
            if (!peerConnectionRef.current) return;

            try {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.offer));
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                
                socket.emit('answer', { target: payload.from, answer: answer });
                setStatus('Streaming video to desktop.');
            } catch (error) {
                console.error("Failed to create answer:", error);
                setStatus("Error: Failed to establish WebRTC connection.");
            }
        });

        socket.on('ice-candidate', (payload: { candidate: RTCIceCandidateInit }) => {
            if (peerConnectionRef.current) {
                peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        });

        return () => {
            socket.disconnect();
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if(peerConnectionRef.current) {
                peerConnectionRef.current.close();
            }
        };
    }, [startCamera, createPeerConnection]);

    return (
        <div className="relative w-screen h-screen bg-black">
            <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-black bg-opacity-50 text-center">
                <h1 className="text-xl font-bold">Streaming Camera</h1>
                <p className="text-md text-green-400">{status}</p>
            </div>
        </div>
    );
};

export default PhoneView;
