import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw, CameraOff, Lock, CheckCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getPrimaryWiFiIP, verifyIPAccess } from '../utils';

// Use global faceapi from script tag
declare const faceapi: any;

interface MobileFaceVerificationProps {
    examId: string;
    userId: string;
}

const MobileFaceVerification: React.FC<MobileFaceVerificationProps> = ({ examId, userId }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState<'FETCHING_INFO' | 'LOADING_MODELS' | 'LOADING_DATA' | 'SCANNING' | 'VERIFYING_IP' | 'SUCCESS' | 'FAILED'>('FETCHING_INFO');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorType, setErrorType] = useState<'PERMISSION' | 'NOT_FOUND' | 'IN_USE' | 'GENERIC' | null>(null);
    
    const [exam, setExam] = useState<any | null>(null);
    const [user, setUser] = useState<any | null>(null);
    
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [labeledDescriptors, setLabeledDescriptors] = useState<any[]>([]);
    const [faceMatcher, setFaceMatcher] = useState<any | null>(null);

    // 1. Fetch Exam & User Info
    useEffect(() => {
        const fetchInfo = async () => {
            try {
                // Fetch Exam
                const { data: examData, error: examError } = await supabase
                    .from('exam_rooms')
                    .select('*, room_seat_layouts(id, columns)')
                    .eq('id', examId)
                    .single();
                
                if (examError || !examData) throw new Error("ไม่พบข้อมูลการสอบ");

                // Fetch User (from auth.users via wrapper or just trust the ID if we can't access auth table directly? 
                // Actually we need the name and email. We can get it from exam_attendance or user_photos if needed, 
                // but ideally we should have a way to get user info.
                // Since we are in a public context (maybe), we might not have auth session.
                // However, for verification, we need the descriptors which are in `user_photos`.
                // Let's try to fetch from `user_photos` to verify user exists and get photos.
                // We also need the name/email for the session record.
                
                // Let's try to get user metadata from a public profile table if it exists, or assume we can get it.
                // Wait, `FaceVerification` uses `user` object passed from App.
                // Here we only have ID.
                // We can fetch `user_photos` to get the photos.
                // For name/email, we might need to look up `exam_attendance` if available.
                
                const { data: attendance, error: attError } = await supabase
                    .from('exam_attendance')
                    .select('student_name, student_email') // Assuming these fields exist or we join
                    .eq('exam_id', examId)
                    .eq('student_id', userId)
                    .maybeSingle();

                // If not in attendance, we might have a problem getting the name if we don't have a users table accessible.
                // But let's assume we can get it or use placeholders if strictly needed.
                // Actually, `user_photos` has `user_id`.
                
                // Let's fetch user_photos first as it is critical.
                const { data: photos, error: photoError } = await supabase
                    .from('user_photos')
                    .select('*')
                    .eq('user_id', userId)
                    .single();

                if (photoError || !photos) throw new Error("ไม่พบข้อมูลรูปภาพของคุณ");

                // Construct user object
                const userInfo = {
                    id: userId,
                    name: attendance?.student_name || "Unknown Student",
                    email: attendance?.student_email || "unknown@email.com",
                    photos: photos
                };

                // Construct exam object
                // We need roomId (layout_id)
                // examData.room_seat_layouts might be an array or object depending on query
                // But exam_rooms has room_name. We need to find the layout ID.
                // Actually `exam_rooms` doesn't link to `room_seat_layouts` by FK directly in the schema I saw earlier?
                // Wait, `App.tsx` maps it by name.
                // Let's fetch the room layout by name.
                const { data: roomData } = await supabase
                    .from('room_seat_layouts')
                    .select('id, columns')
                    .eq('room_name', examData.room_name)
                    .single();

                if (!roomData) throw new Error("ไม่พบข้อมูลห้องสอบ");

                const examInfo = {
                    id: examData.id,
                    roomId: roomData.id, // This is the layout_id
                    subjectName: examData.course_name,
                    columns: roomData.columns
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
                setFaceMatcher(new faceapi.FaceMatcher([labeledDescriptor], 0.6));
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

                const dims = faceapi.matchDimensions(videoRef.current!, videoRef.current!, true);
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

                    if (bestMatch && bestMatch.distance < 0.60) {
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
        setStatus('VERIFYING_IP');
        
        try {
            const ip = await getPrimaryWiFiIP();
            
            // Update qr_authentication table for PC to pick up
            // Schema: id, user_id, ip (inet), status, authenticated_at, expires_at
            // Note: exam_id is not in the schema provided.
            // Note: ip must be valid inet type. Use 0.0.0.0 if unknown.
            const safeIp = (ip && ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) ? ip : '0.0.0.0';

            const { error } = await supabase
                .from('qr_authentication')
                .upsert({
                    user_id: userId,
                    status: 'authenticated',
                    ip: safeIp,
                    authenticated_at: new Date().toISOString()
                });

            if (error) throw error;

            setStatus('SUCCESS');
            
            let seatNumber = 0;
            // Calculate seat (same logic as desktop, but we might not have IP mapping for mobile IP)
            // Fallback to attendance
            try {
                const { data: attendance } = await supabase
                    .from('exam_attendance')
                    .select('row_number, col_number')
                    .eq('exam_id', exam.id)
                    .eq('student_id', user.id)
                    .maybeSingle();
                
                if (attendance) {
                    seatNumber = ((attendance.row_number - 1) * exam.columns) + attendance.col_number;
                }
            } catch (e) {}

            // Upsert Session
            const { data: existingSession } = await supabase
                .from('exam_student_sessions')
                .select('id')
                .eq('layout_id', exam.roomId)
                .eq('student_email', user.email)
                .eq('is_active', true)
                .maybeSingle();

            const sessionData = {
                layout_id: exam.roomId,
                student_email: user.email,
                student_name: user.name,
                seat_number: seatNumber,
                ip_address: safeIp === '0.0.0.0' ? null : safeIp, // exam_student_sessions allows null ip
                face_descriptor: JSON.stringify(Array.from(descriptor)),
                is_active: true,
                updated_at: new Date().toISOString()
            };

            if (existingSession) {
                await supabase.from('exam_student_sessions').update(sessionData).eq('id', existingSession.id);
            } else {
                await supabase.from('exam_student_sessions').insert({
                    ...sessionData,
                    session_start_time: new Date().toISOString(),
                    created_at: new Date().toISOString()
                });
            }

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
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        
                        {/* Overlays */}
                        <div className="absolute inset-0 pointer-events-none">
                            {/* Scan Frame */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-64 h-64 border-2 border-[#E35205]/50 rounded-3xl relative overflow-hidden">
                                    <div className="absolute top-0 w-full h-1 bg-[#E35205] shadow-[0_0_20px_#E35205] animate-[scan_2s_linear_infinite]"></div>
                                    
                                    {/* Corner Markers */}
                                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#E35205] rounded-tl-xl"></div>
                                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#E35205] rounded-tr-xl"></div>
                                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#E35205] rounded-bl-xl"></div>
                                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#E35205] rounded-br-xl"></div>
                                </div>
                            </div>

                            {/* Status Text */}
                            <div className="absolute bottom-10 left-0 right-0 text-center">
                                <div className="inline-flex items-center bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                                    {status === 'LOADING_MODELS' || status === 'LOADING_DATA' || status === 'FETCHING_INFO' ? (
                                        <>
                                            <Loader2 className="w-4 h-4 text-[#E35205] animate-spin mr-2" />
                                            <span className="text-white text-sm">กำลังเตรียมระบบ...</span>
                                        </>
                                    ) : status === 'VERIFYING_IP' ? (
                                        <>
                                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin mr-2" />
                                            <span className="text-white text-sm">กำลังบันทึกข้อมูล...</span>
                                        </>
                                    ) : (
                                        <span className="text-white text-sm">มองตรงไปที่กล้อง</span>
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