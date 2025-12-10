'use client';

import { useRef, useEffect } from 'react';

export default function CameraModal({
    showCamera,
    cameraStream,
    setCameraStream,
    onClose,
    onCapture
}) {
    const videoRef = useRef(null);

    useEffect(() => {
        if (showCamera && videoRef.current && cameraStream) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [showCamera, cameraStream]);

    const capturePhoto = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `camera-${Date.now()}.png`, { type: 'image/png' });
                onCapture(file, URL.createObjectURL(blob));
                onClose();
            }
        }, 'image/png');
    };

    if (!showCamera) return null;

    return (
        <div className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="flex-1 relative">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                />
            </div>
            <div className="p-4 bg-gray-900 flex items-center justify-between">
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={capturePhoto}
                    className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 hover:border-blue-500 transition-colors flex items-center justify-center"
                >
                    <div className="w-12 h-12 bg-white rounded-full"></div>
                </button>
                <div className="w-20"></div>
            </div>
        </div>
    );
}
