import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw, CameraOff, Lock, CheckCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { authService } from '../services/authService';
import { getPrimaryWiFiIP, verifyIPAccess } from '../utils';

// Use global faceapi from script tag
declare const faceapi: any;

interface MobileFaceVerificationProps {
    examId: string;
    userId: string;
    agentIp?: string;
}

const MobileFaceVerification: React.FC<MobileFaceVerificationProps> = ({ examId, userId, agentIp }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState<'FETCHING_INFO' | 'LOADING_MODELS' | 'LOADING_DATA' | 'SCANNING' | 'VERIFYING_IP' | 'SUCCESS' | 'FAILED'>('FETCHING_INFO');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorType, setErrorType] = useState<'PERMISSION' | 'NOT_FOUND' | 'IN_USE' | 'GENERIC' | null>(null);
    
    const [exam, setExam] = useState<any | null>(null);
    const [user, setUser] = useState<any | null>(null);
    
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [labeledDescriptors, setLabeledDescriptors] = useState<any[]>([]);
    const [faceMatcher, setFaceMatcher] = useState<any | null>(null);
    const [currentDistance, setCurrentDistance] = useState<number | null>(null);
    const successHandled = useRef(false);

    // 1. Fetch User Photos (Critical) & Exam Info (Optional)
    useEffect(() => {
        const fetchInfo = async () => {
            try {
                // 1. Fetch User Photos (Critical)
                const { data: photos, error: photoError } = await supabase
                    .from('user_photos')
                    .select('*')
                    .eq('user_id', userId)
                    .single();

                if (photoError || !photos) {
                    console.error("Photo fetch error:", photoError);
                    throw new Error("ไม่พบข้อมูลรูปภาพของคุณ (กรุณาติดต่อเจ้าหน้าที่)");
                }

                // 2. Fetch Exam Info (Optional - for display only)
                let subjectName = "การสอบ";
                try {
                    const { data: examData } = await supabase
                        .from('exam_rooms')
                        .select('course_name')
                        .eq('id', examId)
                        .single();
                    if (examData) subjectName = examData.course_name;
                } catch (e) {
                    console.warn("Could not fetch exam details (non-critical)");
                }

                // Construct user object
                const userInfo = {
                    id: userId,
                    photos: photos
                };

                const examInfo = {
                    id: examId,
                    subjectName: subjectName
                };

                setExam(examInfo);
                setUser(userInfo);
                setStatus('LOADING_MODELS');

            } catch (e: any) {
                console.error("Error fetching info:", e);
                setErrorMessage(e.message);
                setStatus('FAILED');
            }
        };

        fetchInfo();
    }, [examId, userId]);

    // 2. Load Models
    useEffect(() => {
        if (status !== 'LOADING_MODELS') return;

        const loadModels = async () => {
            try {
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
                setErrorMessage("ไม่สามารถโหลดโมเดล AI ได้");
                setStatus('FAILED');
            }
        };
        loadModels();
    }, [status]);

    // 3. Compute Descriptors
    useEffect(() => {
        if (status !== 'LOADING_DATA' || !user || !modelsLoaded) return;

        const loadUserDescriptors = async () => {
            try {
                const photos = user.photos;
                const descriptors: Float32Array[] = [];
                
                const photoTypes = [
                    { key: 'face_forward', label: 'หน้าตรง' },
                    // { key: 'closed_eye', label: 'ตาปิด' }, // Removed
                    { key: 'open_eye', label: 'ตาเปิด' },
                    { key: 'turn_left', label: 'หันซ้าย' },
                    { key: 'turn_right', label: 'หันขวา' },
                    // { key: 'look_up', label: 'มองขึ้น' }, // Removed
                    // { key: 'look_down', label: 'มองลง' }, // Removed
                    // { key: 'move_close', label: 'เข้าใกล้' } // Removed
                ];

                for (const type of photoTypes) {
                    const url = photos[type.key];
                    if (url) {
                        try {
                            const cacheBuster = new Date().getTime();
                            const finalUrl = url.includes('?') ? `${url}&t=${cacheBuster}` : `${url}?t=${cacheBuster}`;
                            const img = await faceapi.fetchImage(finalUrl);
                            
                            // Use SSD MobileNet for accuracy
                            const detections = await faceapi.detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
                                .withFaceLandmarks()
                                .withFaceDescriptors();

                            if (detections.length > 0) {
                                // Get best detection
                                const best = detections.reduce((prev: any, current: any) => 
                                    (prev.detection.score > current.detection.score) ? prev : current
                                );
                                descriptors.push(best.descriptor);
                            }
                        } catch (e) {
                            console.warn(`Failed to process ${type.key}`);
                        }
                    }
                }

                if (descriptors.length === 0) {
                    throw new Error("ไม่สามารถประมวลผลใบหน้าต้นฉบับได้");
                }

                const labeledDescriptor = new faceapi.LabeledFaceDescriptors(user.id, descriptors);
                setLabeledDescriptors([labeledDescriptor]);
                // Use high threshold (2.0) to ensure we get distance feedback even if not yet verified
                // The actual verification check is done manually with < 0.50
                setFaceMatcher(new faceapi.FaceMatcher([labeledDescriptor], 2.0));
                setStatus('SCANNING');
                startCamera();

            } catch (err: any) {
                console.error("Error processing data:", err);
                setErrorMessage(err.message);
                setStatus('FAILED');
            }
        };

        loadUserDescriptors();
    }, [status, user, modelsLoaded]);

    const startCamera = useCallback(async () => {
        try {
            // Use back camera if available, else front
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'user', // 'environment' for back camera, 'user' for front. Verification usually uses front.
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err: any) {
            console.error("Camera error:", err);
            setStatus('FAILED');
            setErrorMessage("ไม่สามารถเปิดกล้องได้: " + err.message);
        }
    }, []);

    // 4. Detection Loop
    useEffect(() => {
        if (status !== 'SCANNING' || !videoRef.current || !faceMatcher) return;

        let interval: NodeJS.Timeout;

        const detect = async () => {
            if (videoRef.current?.paused || videoRef.current?.ended) return;

            try {
                // Use SSD MobileNet for consistency with PC (More accurate than Tiny)
                const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                if (!videoRef.current) return;

                const dims = faceapi.matchDimensions(videoRef.current, videoRef.current, true);
                const resizedDetections = faceapi.resizeResults(detections, dims);

                if (resizedDetections.length > 0) {
                    let bestMatch: any | null = null;
                    for (const detection of resizedDetections) {
                        if (detection.detection.score > 0.5) {
                            const match = faceMatcher.findBestMatch(detection.descriptor);
                            if (match.label === user.id) {
                                if (!bestMatch || match.distance < bestMatch.distance) {
                                    bestMatch = match;
                                }
                            }
                        }
                    }

                    if (bestMatch) {
                        setCurrentDistance(bestMatch.distance);
                    } else {
                        setCurrentDistance(null);
                    }

                    // Threshold 0.50 (Stricter)
                    if (bestMatch && bestMatch.distance < 0.50) {
                        clearInterval(interval);
                        handleSuccess(resizedDetections[0].descriptor);
                    }
                }
            } catch (err) {
                console.error("Detection loop error:", err);
            }
        };

        interval = setInterval(detect, 200); // Slightly slower interval for mobile
        return () => clearInterval(interval);
    }, [status, faceMatcher, user]);

    const handleSuccess = async (descriptor: Float32Array) => {
        if (successHandled.current) return;
        successHandled.current = true;

        setStatus('VERIFYING_IP');
        
        try {
            // Use Agent IP from URL if available (Preferred), otherwise try to detect (Fallback)
            let ip = agentIp;
            if (!ip) {
                console.warn("No Agent IP provided in URL, falling back to local detection...");
                ip = await getPrimaryWiFiIP();
            }
            
            console.log("Using IP for authentication:", ip);
            
            await authService.authenticateMobile(userId, ip);

            // Note: We do NOT create the exam session here. 
            // The PC (FaceVerification.tsx) polls this table, sees 'authenticated', 
            // and then creates the session using the PC's IP and context.

            setStatus('SUCCESS');

        } catch (err: any) {
            console.error("Success handler error:", err);
            setErrorMessage(err.message);
            setStatus('FAILED');
        }
    };

    const handleClose = () => {
        window.close();
        // Hack for some mobile browsers
        try { window.open('', '_self', ''); window.close(); } catch (e) {}
        
        // Fallback if blocked
        setTimeout(() => {
            alert("กรุณากดปิดหน้าต่างที่ตัวเบราว์เซอร์");
        }, 500);
    };

    return (
        <div className="min-h-screen bg-black flex flex-col">
            {/* Header */}
            <div className="bg-gray-900 p-4 flex items-center justify-between z-10">
                <div className="flex items-center text-white">
                    <ShieldCheck className="w-6 h-6 text-primary mr-2" />
                    <span className="font-bold">Mobile Verification</span>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                {status === 'SUCCESS' ? (
                    <div className="text-center p-8 animate-in zoom-in duration-300">
                        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30">
                            <CheckCircle className="w-12 h-12 text-white" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">ยืนยันตัวตนสำเร็จ!</h2>
                        <p className="text-gray-400 mb-8">คุณสามารถดำเนินการต่อบนหน้าจอคอมพิวเตอร์ได้เลย</p>
                        <button 
                            onClick={handleClose}
                            className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition shadow-lg shadow-white/10"
                        >
                            ปิดหน้าต่าง
                        </button>
                    </div>
                ) : status === 'FAILED' ? (
                    <div className="text-center p-8">
                        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-10 h-10 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">เกิดข้อผิดพลาด</h3>
                        <p className="text-gray-400 mb-6">{errorMessage}</p>
                        <button 
                            onClick={() => window.location.reload()}
                            className="bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition"
                        >
                            ลองใหม่อีกครั้ง
                        </button>
                    </div>
                ) : (
                    <>
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            muted 
                            playsInline 
                            className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
                        />
                        
                        {/* Overlays */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            {/* Live Indicator */}
                            <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm flex items-center z-20 backdrop-blur-sm border border-white/10">
                                <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                                Live Face Detection
                            </div>

                            {/* Face Box Overlay (Oval with dark background outside) */}
                            <div className="absolute w-72 h-96 border-2 border-white/40 rounded-[50%] top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] z-10">
                                {/* Corner Markers (Optional, but adds tech feel) */}
                                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 w-1 h-2 bg-primary"></div>
                                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 w-1 h-2 bg-primary"></div>
                                <div className="absolute top-1/2 left-0 transform -translate-x-1 -translate-y-1/2 w-2 h-1 bg-primary"></div>
                                <div className="absolute top-1/2 right-0 transform translate-x-1 -translate-y-1/2 w-2 h-1 bg-primary"></div>
                                
                                {/* Scanning Line Animation */}
                                {status === 'SCANNING' && (
                                    <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/80 to-transparent animate-[scan_2s_linear_infinite] opacity-50"></div>
                                )}
                            </div>

                            {/* Status Text (Centered below face box) */}
                            <div className="absolute bottom-20 left-0 right-0 flex flex-col items-center z-20 gap-3">
                                <div className="bg-black/70 text-white px-6 py-2 rounded-full text-lg font-semibold backdrop-blur-sm border border-white/10 whitespace-nowrap shadow-lg animate-in slide-in-from-bottom-4">
                                    {status === 'LOADING_MODELS' || status === 'LOADING_DATA' || status === 'FETCHING_INFO' ? (
                                        <span className="flex items-center">
                                            <Loader2 className="w-5 h-5 text-primary animate-spin mr-2" />
                                            กำลังเตรียมระบบ...
                                        </span>
                                    ) : status === 'VERIFYING_IP' ? (
                                        <span className="flex items-center">
                                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-2" />
                                            กำลังบันทึกข้อมูล...
                                        </span>
                                    ) : (
                                        <span>มองตรงไปที่กล้อง</span>
                                    )}
                                </div>

                                {/* Real-time Distance Feedback */}
                                {status === 'SCANNING' && currentDistance !== null && (
                                    <div className="bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 flex flex-col items-center animate-in slide-in-from-bottom-2 mb-2">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-sm text-gray-300">ความเหมือน</span>
                                            <span className={`text-xl font-bold font-mono ${currentDistance < 0.50 ? 'text-green-400' : currentDistance < 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {((1 - currentDistance) * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        
                                        {/* Visual Bar */}
                                        <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden relative">
                                            {/* Threshold Marker at 55% (Distance 0.50) */}
                                            <div className="absolute top-0 bottom-0 w-0.5 bg-white/50 left-[60%] z-10"></div>
                                            
                                            <div 
                                                className={`h-full transition-all duration-300 ${currentDistance < 0.50 ? 'bg-green-500' : currentDistance < 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                style={{ width: `${Math.min(100, Math.max(5, (1 - currentDistance) * 100))}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between w-full text-[10px] text-gray-500 mt-1 px-1">
                                            <span>0%</span>
                                            <span>เป้าหมาย &gt; 55%</span>
                                            <span>100%</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
            <style>{`@keyframes scan { 0% { top: 0; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } }`}</style>
        </div>
    );
};

export default MobileFaceVerification;