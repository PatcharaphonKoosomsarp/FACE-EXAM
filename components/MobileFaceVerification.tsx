import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw, CameraOff, Lock, CheckCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
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
    const [matchScore, setMatchScore] = useState<{ distance: number, label: string } | null>(null);
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
                    { key: 'closed_eye', label: 'ตาปิด' },
                    { key: 'open_eye', label: 'ตาเปิด' },
                    { key: 'turn_left', label: 'หันซ้าย' },
                    { key: 'turn_right', label: 'หันขวา' },
                    { key: 'look_up', label: 'มองขึ้น' },
                    { key: 'look_down', label: 'มองลง' },
                    { key: 'move_close', label: 'เข้าใกล้' }
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
                setFaceMatcher(new faceapi.FaceMatcher([labeledDescriptor], 0.55));
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
                    facingMode: 'user' // 'environment' for back camera, 'user' for front. Verification usually uses front.
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
                const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions()) // Use Tiny for mobile performance? Or SSD?
                    // Let's stick to SSD if possible, but Tiny is faster on mobile.
                    // FaceVerification uses SSD. Let's try SSD first. If slow, we might need to switch.
                    // Actually, let's use SSD for consistency with desktop.
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
                        setMatchScore({ distance: bestMatch.distance, label: bestMatch.label });
                        
                        if (bestMatch.distance < 0.55) {
                            clearInterval(interval);
                            handleSuccess(resizedDetections[0].descriptor);
                        }
                    } else {
                        setMatchScore(null);
                    }
                } else {
                    setMatchScore(null);
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
            
            // Update qr_authentication table for PC to pick up
            // Schema: id, user_id, ip (inet), status, authenticated_at, expires_at
            // Note: ip must be valid inet type. Use 0.0.0.0 if unknown.
            const safeIp = (ip && ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) ? ip : '0.0.0.0';

            // 1. Delete existing records (Clean slate, like in the HTML reference)
            await supabase.from('qr_authentication').delete().eq('user_id', userId);

            // Calculate expiration time (2 minutes from now)
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 2);

            // 2. Insert new record
            const { error } = await supabase
                .from('qr_authentication')
                .insert({
                    user_id: userId,
                    status: 'authenticated',
                    ip: safeIp,
                    authenticated_at: new Date().toISOString(),
                    expires_at: expiresAt.toISOString()
                });

            if (error) throw error;

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

    return (
        <div className="min-h-screen bg-black flex flex-col">
            {/* Header */}
            <div className="bg-gray-900 p-4 flex items-center justify-between z-10">
                <div className="flex items-center text-white">
                    <ShieldCheck className="w-6 h-6 text-[#E35205] mr-2" />
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
                        <div className="text-sm text-gray-600">
                            (หน้าจอนี้จะปิดเองไม่ได้ กรุณาปิดด้วยตนเอง)
                        </div>
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
                                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 w-1 h-2 bg-[#E35205]"></div>
                                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 w-1 h-2 bg-[#E35205]"></div>
                                <div className="absolute top-1/2 left-0 transform -translate-x-1 -translate-y-1/2 w-2 h-1 bg-[#E35205]"></div>
                                <div className="absolute top-1/2 right-0 transform translate-x-1 -translate-y-1/2 w-2 h-1 bg-[#E35205]"></div>
                                
                                {/* Scanning Line Animation */}
                                {status === 'SCANNING' && (
                                    <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-[#E35205]/80 to-transparent animate-[scan_2s_linear_infinite] opacity-50"></div>
                                )}
                            </div>

                            {/* Status Text (Centered below face box) */}
                            <div className="absolute bottom-20 left-0 right-0 flex flex-col items-center z-20 gap-3">
                                {matchScore && (
                                    <div className="bg-black/50 text-white px-4 py-1 rounded-full text-xs backdrop-blur-sm border border-white/10 mb-2">
                                        Distance: {matchScore.distance.toFixed(4)} ({Math.round((1 - matchScore.distance) * 100)}%)
                                    </div>
                                )}
                                <div className="bg-black/70 text-white px-6 py-2 rounded-full text-lg font-semibold backdrop-blur-sm border border-white/10 whitespace-nowrap shadow-lg animate-in slide-in-from-bottom-4">
                                    {status === 'LOADING_MODELS' || status === 'LOADING_DATA' || status === 'FETCHING_INFO' ? (
                                        <span className="flex items-center">
                                            <Loader2 className="w-5 h-5 text-[#E35205] animate-spin mr-2" />
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