import React, { useEffect, useRef, useState, useCallback } from 'react';
import { User, Exam } from '../types';
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw, CameraOff, Lock, QrCode } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getPrimaryWiFiIP, verifyIPAccess } from '../utils';
import QRCodeModal from './QRCodeModal';

// Use global faceapi from script tag
declare const faceapi: any;

interface FaceVerificationProps {
    user: User;
    exam: Exam;
    onVerified: () => void;
    onCancel: () => void;
}

const FaceVerification: React.FC<FaceVerificationProps> = ({ user, exam, onVerified, onCancel }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState<'LOADING_MODELS' | 'LOADING_DATA' | 'SCANNING' | 'VERIFYING_IP' | 'SUCCESS' | 'FAILED'>('LOADING_MODELS');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorType, setErrorType] = useState<'PERMISSION' | 'NOT_FOUND' | 'IN_USE' | 'GENERIC' | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [labeledDescriptors, setLabeledDescriptors] = useState<any[]>([]);
    const [faceMatcher, setFaceMatcher] = useState<any | null>(null);
    const [showQR, setShowQR] = useState(false);

    // 1. Load Models
    useEffect(() => {
        const loadModels = async () => {
            try {
                // Load models from local public/models directory
                const MODEL_URL = '/models';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);
                setStatus('LOADING_DATA');
            } catch (err) {
                console.error("Error loading models:", err);
                setErrorMessage("ไม่สามารถโหลดโมเดล AI ได้ (กรุณาตรวจสอบโฟลเดอร์ /public/models)");
                setStatus('FAILED');
            }
        };
        loadModels();
    }, []);

    // 2. Load User Photos & Compute Descriptors
    useEffect(() => {
        const loadUserDescriptors = async () => {
            if (!modelsLoaded) return;

            try {
                // Fetch photos from Supabase
                const { data: photos, error } = await supabase
                    .from('user_photos')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                if (error || !photos) {
                    throw new Error("ไม่พบข้อมูลรูปภาพของคุณ กรุณาลงทะเบียนใบหน้าก่อน");
                }

                const descriptors: Float32Array[] = [];
                
                // Photo types exactly as in authentication_face.html
                const photoTypes = [
                    { key: 'closed_eye', label: 'ตาปิด' },
                    { key: 'open_eye', label: 'ตาเปิด' },
                    { key: 'turn_left', label: 'หันซ้าย' },
                    { key: 'turn_right', label: 'หันขวา' },
                    { key: 'look_up', label: 'มองขึ้น' },
                    { key: 'look_down', label: 'มองลง' },
                    { key: 'move_close', label: 'เข้าใกล้' }
                ];

                // Also add face_forward if available (it's in the DB but not in the original list, but it's crucial)
                // If we want to be EXACT to the file provided, we might skip it, but it seems like an omission in the HTML file 
                // given FaceRegistration saves it. However, to be safe and robust, I'll include it if it exists.
                if (photos['face_forward']) {
                    photoTypes.unshift({ key: 'face_forward', label: 'หน้าตรง' });
                }

                for (const type of photoTypes) {
                    const url = photos[type.key];
                    if (url) {
                        try {
                            console.log(`Processing reference image: ${type.label} (${type.key})`);
                            
                            // Add cache busting
                            const cacheBuster = new Date().getTime();
                            const finalUrl = url.includes('?') ? `${url}&t=${cacheBuster}` : `${url}?t=${cacheBuster}`;
                            
                            const img = await faceapi.fetchImage(finalUrl);
                            
                            // Try multiple detection methods for better accuracy (Exact logic from authentication_face.html)
                            const detectionOptions = [
                                // Method 1: SSD MobileNet (default)
                                () => faceapi.detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceDescriptors(),
                                // Method 2: SSD MobileNet with lower confidence
                                () => faceapi.detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 })).withFaceLandmarks().withFaceDescriptors(),
                                // Method 3: Tiny Face Detector
                                () => faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptors()
                            ];

                            let detections: any = null;
                            let methodUsed = 0;

                            for (let i = 0; i < detectionOptions.length; i++) {
                                try {
                                    detections = await detectionOptions[i]();
                                    if (detections && detections.length > 0) {
                                        methodUsed = i + 1;
                                        break;
                                    }
                                } catch (e) {
                                    console.log(`Method ${i+1} failed for ${type.label}`);
                                }
                            }

                            if (detections && detections.length > 0) {
                                // Use best detection
                                let bestDetection = detections[0];
                                if (detections.length > 1) {
                                    bestDetection = detections.reduce((best: any, current: any) => 
                                        current.detection.score > best.detection.score ? current : best
                                    );
                                }
                                descriptors.push(bestDetection.descriptor);
                                console.log(`Descriptor added for ${type.label} using method ${methodUsed}`);
                            } else {
                                console.log(`No faces detected in ${type.label} - trying enhancement...`);
                                // Image Preprocessing Fallback
                                try {
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                                    if (ctx) {
                                        canvas.width = img.width;
                                        canvas.height = img.height;
                                        ctx.filter = 'contrast(1.5) brightness(1.2)';
                                        ctx.drawImage(img, 0, 0);
                                        
                                        const enhancedDetections = await faceapi.detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 })).withFaceLandmarks().withFaceDescriptors();
                                        
                                        if (enhancedDetections && enhancedDetections.length > 0) {
                                            descriptors.push(enhancedDetections[0].descriptor);
                                            console.log(`Descriptor added for ${type.label} after enhancement`);
                                        }
                                    }
                                } catch (enhanceError) {
                                    console.warn(`Enhancement failed for ${type.label}`);
                                }
                            }

                        } catch (e) {
                            console.warn(`Failed to process image ${type.key}:`, e);
                        }
                    }
                }

                if (descriptors.length === 0) {
                    throw new Error("ไม่สามารถประมวลผลใบหน้าจากรูปที่ลงทะเบียนได้ (ไม่พบใบหน้าในรูปภาพ)");
                }

                console.log(`Computed ${descriptors.length} reference descriptors`);
                const labeledDescriptor = new faceapi.LabeledFaceDescriptors(user.id, descriptors);
                setLabeledDescriptors([labeledDescriptor]);
                // Use threshold 0.6 for FaceMatcher, but we will check distance manually too
                setFaceMatcher(new faceapi.FaceMatcher([labeledDescriptor], 0.6));
                setStatus('SCANNING');
                startCamera();

            } catch (err: any) {
                console.error("Error loading user data:", err);
                setErrorMessage(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
                setStatus('FAILED');
            }
        };

        loadUserDescriptors();
    }, [modelsLoaded, user.id]);

    const startCamera = useCallback(async () => {
        setErrorMessage(null);
        setErrorType(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err: any) {
            console.error("Camera access error:", err);
            setStatus('FAILED');
            
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setErrorType('PERMISSION');
                setErrorMessage("กรุณาอนุญาตสิทธิ์การใช้กล้องในเบราว์เซอร์");
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setErrorType('NOT_FOUND');
                setErrorMessage("ไม่พบอุปกรณ์กล้องบนเครื่องนี้");
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                setErrorType('IN_USE');
                setErrorMessage("กล้องกำลังถูกใช้งานโดยโปรแกรมอื่น");
            } else {
                setErrorType('GENERIC');
                setErrorMessage("เกิดข้อผิดพลาด: " + err.message);
            }
        }
    }, []);

    // 3. Real-time Detection Loop
    useEffect(() => {
        let interval: NodeJS.Timeout;

        const detect = async () => {
            if (status !== 'SCANNING' || !videoRef.current || !faceMatcher) return;

            if (videoRef.current.paused || videoRef.current.ended) return;

            try {
                // Use detectAllFaces with SSD MobileNet (more accurate than detectSingleFace/TinyFace)
                // as used in authentication_face.html logic
                const detections = await faceapi.detectAllFaces(videoRef.current)
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                // Resize results to match video dimensions (Best Practice)
                const dims = faceapi.matchDimensions(videoRef.current, videoRef.current, true);
                const resizedDetections = faceapi.resizeResults(detections, dims);

                if (resizedDetections.length > 0) {
                    // Find best match among all faces
                    let bestMatch: any | null = null;
                    
                    for (const detection of resizedDetections) {
                        // Check if it's a real face (score > 0.5) as per original logic
                        if (detection.detection.score > 0.5) {
                            const match = faceMatcher.findBestMatch(detection.descriptor);
                            console.log(`Live Detection -> Score: ${detection.detection.score.toFixed(2)} | Match: ${match.label} | Distance: ${match.distance.toFixed(3)} (Threshold: 0.60)`);
                            
                            if (match.label === user.id) {
                                if (!bestMatch || match.distance < bestMatch.distance) {
                                    bestMatch = match;
                                }
                            }
                        }
                    }

                    // Threshold 0.60 (Adjusted from 0.35 to be more lenient)
                    if (bestMatch && bestMatch.distance < 0.60) { 
                        clearInterval(interval);
                        handleSuccess(resizedDetections[0].descriptor); // Use the descriptor of the detected face
                    }
                }
            } catch (err) {
                console.error("Detection error:", err);
            }
        };

        if (status === 'SCANNING') {
            interval = setInterval(detect, 100); // Check every 100ms (as per original)
        }

        return () => clearInterval(interval);
    }, [status, faceMatcher, user.id]);

    const handleSuccess = async (descriptor: Float32Array) => {
        setStatus('VERIFYING_IP');
        
        try {
            // 1. Get IP
            const ip = await getPrimaryWiFiIP();
            console.log("Detected IP:", ip);

            if (!ip) {
                // For development/testing, you might want to allow null IP or mock it
                // But per requirements, we should fail or warn
                console.warn("Could not detect IP, proceeding with caution or failing based on policy");
                // throw new Error("ไม่สามารถระบุ IP Address ได้ (กรุณาเชื่อมต่อ WiFi มจพ.)");
            }

            // 2. Verify IP Access (Only if IP is detected)
            if (ip) {
                const hasAccess = await verifyIPAccess(exam.roomId, ip);
                if (!hasAccess) {
                    throw new Error(`IP Address ของคุณ (${ip}) ไม่ได้รับอนุญาตให้เข้าห้องสอบนี้`);
                }
            }

            setStatus('SUCCESS');
            
            let seatNumber = 0;

            // Attempt to calculate seat number
            try {
                // Get layout columns to calculate seat index
                const { data: layout } = await supabase
                    .from('room_seat_layouts')
                    .select('columns')
                    .eq('id', exam.roomId)
                    .single();
                
                if (layout) {
                    // Get student attendance position
                    const { data: attendance } = await supabase
                        .from('exam_attendance')
                        .select('row_number, col_number')
                        .eq('exam_id', exam.id)
                        .eq('student_id', user.id)
                        .maybeSingle();
                    
                    if (attendance) {
                        seatNumber = ((attendance.row_number - 1) * layout.columns) + attendance.col_number;
                    }
                }
            } catch (calcError) {
                console.warn("Could not calculate seat number:", calcError);
            }

            // Insert Session Record
            const { error } = await supabase.from('exam_student_sessions').insert({
                layout_id: exam.roomId,
                student_email: user.email,
                student_name: user.name,
                seat_number: seatNumber,
                ip_address: ip,
                face_descriptor: JSON.stringify(Array.from(descriptor)),
                is_active: true
            });

            if (error) {
                console.error("Supabase insert error:", error);
                throw error;
            }

            setTimeout(() => {
                onVerified();
            }, 1500);

        } catch (err: any) {
            console.error("Error saving session:", err);
            setErrorMessage(err.message || "เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์");
            setStatus('FAILED');
        }
    };

    // Cleanup
    useEffect(() => {
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-gray-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
                <div className="bg-white p-5 border-b flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg flex items-center">
                            <ShieldCheck className="w-5 h-5 mr-2 text-[#E35205]" />
                            ยืนยันตัวตน
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">วิชา: {exam.subjectName}</p>
                    </div>
                    <div className="flex items-center">
                        {status !== 'SUCCESS' && (
                            <button 
                                onClick={() => setShowQR(true)} 
                                className="text-blue-600 hover:text-blue-800 mr-4 flex items-center text-sm font-medium bg-blue-50 px-3 py-1.5 rounded-lg transition"
                            >
                                <QrCode className="w-4 h-4 mr-1.5" /> QR Code
                            </button>
                        )}
                        {status !== 'SUCCESS' && (
                            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition">✕</button>
                        )}
                    </div>
                </div>
                
                <div className="relative aspect-[4/3] bg-black group">
                    {status !== 'FAILED' && (
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                    )}
                    
                    {/* Loading Overlay */}
                    {(status === 'LOADING_MODELS' || status === 'LOADING_DATA') && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                            <div className="text-center">
                                <Loader2 className="w-10 h-10 text-[#E35205] animate-spin mx-auto mb-4" />
                                <p className="text-white font-medium">
                                    {status === 'LOADING_MODELS' ? 'กำลังโหลดโมเดล AI...' : 'กำลังเตรียมข้อมูลใบหน้า...'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Scanning Overlay */}
                    {status === 'SCANNING' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-[#E35205] to-transparent animate-[scan_2s_linear_infinite]" style={{ animationName: 'scan' }}></div>
                            <div className="bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm border border-white/20">
                                มองตรงไปที่กล้อง
                            </div>
                        </div>
                    )}

                    {/* Verifying IP Overlay */}
                    {status === 'VERIFYING_IP' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                            <div className="text-center">
                                <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
                                <p className="text-white font-medium">กำลังตรวจสอบ IP Address...</p>
                                <p className="text-gray-400 text-xs mt-2">กรุณารอสักครู่</p>
                            </div>
                        </div>
                    )}
                    
                    {/* Success Overlay */}
                    {status === 'SUCCESS' && (
                        <div className="absolute inset-0 bg-green-500 flex items-center justify-center flex-col animate-in fade-in duration-300 z-30">
                             <div className="bg-white rounded-full p-4 mb-4 shadow-lg animate-in zoom-in duration-300">
                                <ShieldCheck className="w-12 h-12 text-green-500" />
                             </div>
                             <p className="text-white text-2xl font-bold">ยืนยันตัวตนสำเร็จ</p>
                             <p className="text-green-100 text-sm mt-2">กำลังเข้าสู่ห้องสอบ...</p>
                        </div>
                    )}

                    {/* Failed Overlay */}
                    {status === 'FAILED' && (
                        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center flex-col p-8 text-center z-30">
                             <div className="bg-red-500/20 p-4 rounded-full mb-4">
                                 {errorType === 'PERMISSION' ? <Lock className="w-10 h-10 text-red-500" /> : 
                                  errorType === 'IN_USE' ? <CameraOff className="w-10 h-10 text-red-500" /> :
                                  <AlertTriangle className="w-10 h-10 text-red-500" />}
                             </div>
                             <p className="text-white text-xl font-bold mb-2">เกิดข้อผิดพลาด</p>
                             <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                                {errorMessage || 'ไม่สามารถเข้าถึงกล้องได้'}
                             </p>
                             
                             <div className="flex gap-3 w-full">
                                <button 
                                    onClick={onCancel} 
                                    className="flex-1 bg-gray-700 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-gray-600 transition"
                                >
                                    ยกเลิก
                                </button>
                                <button 
                                    onClick={() => window.location.reload()} 
                                    className="flex-1 bg-white text-gray-900 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-200 transition flex items-center justify-center"
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" /> ลองใหม่
                                </button>
                             </div>
                        </div>
                    )}
                </div>
                
                {/* Footer Info */}
                <div className="p-4 bg-gray-50 text-center flex justify-between text-xs text-gray-500">
                    <span>Student: {user.name}</span>
                    <span>Status: {status}</span>
                </div>

                <QRCodeModal 
                    isOpen={showQR} 
                    onClose={() => setShowQR(false)} 
                    url={`${window.location.origin}?action=exam&roomId=${exam.roomId}`} 
                />
            </div>
            <style>{`@keyframes scan { 0% { top: 0; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } }`}</style>
        </div>
    );
};

export default FaceVerification;