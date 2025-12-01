import React, { useEffect, useRef, useState, useCallback } from 'react';
import { User, Exam } from '../types';
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw, CameraOff, Lock, Monitor, Smartphone } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getPrimaryWiFiIP, verifyIPAccess } from '../utils';
import { QRCodeCanvas } from 'qrcode.react';
import { agentService } from '../services/agentService';

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
    const [method, setMethod] = useState<'WEBCAM' | 'QR' | null>(null);
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<'LOADING_MODELS' | 'LOADING_DATA' | 'SCANNING' | 'VERIFYING_IP' | 'SUCCESS' | 'FAILED'>('LOADING_MODELS');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorType, setErrorType] = useState<'PERMISSION' | 'NOT_FOUND' | 'IN_USE' | 'GENERIC' | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [labeledDescriptors, setLabeledDescriptors] = useState<any[]>([]);
    const [faceMatcher, setFaceMatcher] = useState<any | null>(null);
    const [detectedSeat, setDetectedSeat] = useState<number | null>(null);
    const isVerifyingRef = useRef(false);

    const handleMobileSuccess = useCallback(async (mobileIp: string) => {
        if (isVerifyingRef.current) return;
        isVerifyingRef.current = true;

        setStatus('VERIFYING_IP');
        try {
            // 1. Get PC IP (The machine running the exam)
            let pcIp = await agentService.getLocalIP();
            if (!pcIp || pcIp === '127.0.0.1') {
                pcIp = await getPrimaryWiFiIP();
            }
            
            console.log("Mobile Auth Success. Mobile IP:", mobileIp, "PC IP:", pcIp);

            // 2. Verify PC IP Access (Ensure the PC is in the exam room)
            if (pcIp) {
                 const hasAccess = await verifyIPAccess(exam.id, pcIp);
                 if (!hasAccess) {
                     throw new Error(`Computer IP (${pcIp}) ไม่ได้รับอนุญาตให้เข้าห้องสอบนี้`);
                 }
            }

            setStatus('SUCCESS');
            
            // Calculate Seat (Reuse logic from handleSuccess)
            let seatNumber = 0;
            try {
                const { data: mapping } = await supabase
                    .from('room_seat_ip_mappings')
                    .select('seat_number')
                    .eq('layout_id', exam.roomId)
                    .eq('ip_address', pcIp || mobileIp) // Use PC IP if available
                    .maybeSingle();

                if (mapping) {
                    seatNumber = mapping.seat_number;
                    setDetectedSeat(seatNumber);
                }
            } catch (e) { console.warn(e); }

            // Create/Update Session with PC IP
            await createSession(pcIp || mobileIp, seatNumber, "Mobile Verified");
            
            setTimeout(() => {
                onVerified();
            }, 1500);

        } catch (err: any) {
            console.error("Mobile success handling error:", err);
            setErrorMessage(err.message);
            setStatus('FAILED');
            isVerifyingRef.current = false; // Reset lock on failure
        }
    }, [exam.id, exam.roomId, user.email, user.name, onVerified]); // Add dependencies

    // Check for existing valid authentication on mount
    useEffect(() => {
        const checkExistingAuth = async () => {
            try {
                // Check for auth record in the last 10 minutes
                const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
                
                const { data } = await supabase
                    .from('qr_authentication')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('status', 'authenticated')
                    .gt('authenticated_at', tenMinutesAgo)
                    .order('authenticated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (data) {
                    console.log('Found recent authentication:', data);
                    await handleMobileSuccess(data.ip);
                }
            } catch (err) {
                console.error("Error checking existing auth:", err);
            }
        };

        checkExistingAuth();
    }, [handleMobileSuccess, user.id]); // Add handleMobileSuccess to deps

    // Ref for the callback to avoid restarting the interval
    const handleMobileSuccessRef = useRef(handleMobileSuccess);
    useEffect(() => {
        handleMobileSuccessRef.current = handleMobileSuccess;
    }, [handleMobileSuccess]);

    // QR Code Logic
    useEffect(() => {
        let pollInterval: NodeJS.Timeout | null = null;
        let isMounted = true;

        if (method === 'QR') {
            const startProcess = async () => {
                try {
                    // 1. Get Local IP from Agent (preferred) or WebRTC
                    let ip = await agentService.getLocalIP();
                    if (!ip || ip === '127.0.0.1') {
                        ip = await getPrimaryWiFiIP();
                    }
                    
                    if (!isMounted) return;

                    console.log('Generating QR with IP:', ip);

                    const baseUrl = window.location.origin;
                    // Construct URL for mobile auth page (using query params as per App.tsx)
                    const url = `${baseUrl}/?mode=mobile-verify&exam_id=${exam.id}&user_id=${user.id}&ip=${ip || ''}`;
                    setQrUrl(url);

                    // 2. Start Polling for Handshake
                    pollInterval = setInterval(async () => {
                        if (!isMounted) return;
                        try {
                            // Check qr_authentication table for the LATEST authenticated record
                            const { data } = await supabase
                                .from('qr_authentication')
                                .select('*')
                                .eq('user_id', user.id)
                                .eq('status', 'authenticated')
                                .order('authenticated_at', { ascending: false })
                                .limit(1)
                                .maybeSingle();

                            if (data) {
                                console.log('Mobile authentication successful:', data);
                                if (pollInterval) clearInterval(pollInterval);
                                // Proceed to session creation using the IP from the handshake
                                if (handleMobileSuccessRef.current) {
                                    await handleMobileSuccessRef.current(data.ip);
                                }
                            }
                        } catch (e) {
                            console.error("Polling error:", e);
                        }
                    }, 2000);

                } catch (err) {
                    console.error("Error generating QR:", err);
                    if (isMounted) setErrorMessage("ไม่สามารถสร้าง QR Code ได้");
                }
            };

            startProcess();
        }

        return () => {
            isMounted = false;
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [method, exam.id, user.id]); // Removed handleMobileSuccess from deps

    const createSession = async (ip: string, seatNumber: number, descriptorStr: string) => {
         // Check for existing active session
         const { data: existingSession, error: findError } = await supabase
         .from('exam_student_sessions')
         .select('id')
         .eq('layout_id', exam.roomId)
         .eq('student_email', user.email)
         .eq('is_active', true)
         .order('created_at', { ascending: false })
         .limit(1);

        // Prepare profile URL with User ID hash for "Kick" functionality
        const profileUrl = user.avatarUrl 
            ? `${user.avatarUrl}#${user.id}`
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random#${user.id}`;

        if (!findError && existingSession && existingSession.length > 0) {
            // Update existing session
            await supabase
                .from('exam_student_sessions')
                .update({
                    student_name: user.name,
                    seat_number: seatNumber,
                    ip_address: ip,
                    face_descriptor: descriptorStr, 
                    student_profile_url: profileUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingSession[0].id);
        } else {
            // Insert Session Record
            await supabase.from('exam_student_sessions').insert({
                layout_id: exam.roomId,
                student_email: user.email,
                student_name: user.name,
                seat_number: seatNumber,
                ip_address: ip,
                face_descriptor: descriptorStr,
                student_profile_url: profileUrl,
                is_active: true,
                session_start_time: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }
    };

    // 1. Load Models (Only if WEBCAM is selected)
    useEffect(() => {
        if (method !== 'WEBCAM') return;

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
    }, [method]);

    // 2. Load User Photos & Compute Descriptors
    useEffect(() => {
        if (method !== 'WEBCAM' || !modelsLoaded) return;

        const loadUserDescriptors = async () => {
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
                setFaceMatcher(new faceapi.FaceMatcher([labeledDescriptor], 0.50));
                setStatus('SCANNING');
                startCamera();

            } catch (err: any) {
                console.error("Error loading user data:", err);
                setErrorMessage(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
                setStatus('FAILED');
            }
        };

        loadUserDescriptors();
    }, [method, modelsLoaded, user.id]);

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
        if (method !== 'WEBCAM') return;

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
                    if (bestMatch && bestMatch.distance < 0.50) { 
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
    }, [method, status, faceMatcher, user.id]);

    const handleSuccess = async (descriptor: Float32Array) => {
        if (isVerifyingRef.current) return;
        isVerifyingRef.current = true;

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
                const hasAccess = await verifyIPAccess(exam.id, ip);
                if (!hasAccess) {
                    throw new Error(`IP Address ของคุณ (${ip}) ไม่ได้รับอนุญาตให้เข้าห้องสอบนี้`);
                }
            }

            setStatus('SUCCESS');
            
            let seatNumber = 0;

            // 1. Try to get seat from IP Mapping (Most accurate for fixed seat rooms)
            try {
                const { data: mapping } = await supabase
                    .from('room_seat_ip_mappings')
                    .select('seat_number')
                    .eq('layout_id', exam.roomId)
                    .eq('ip_address', ip)
                    .maybeSingle();

                if (mapping) {
                    seatNumber = mapping.seat_number;
                    setDetectedSeat(seatNumber);
                }
            } catch (e) {
                console.warn("Error fetching seat from IP:", e);
            }

            // 2. If not found by IP, try to calculate from Attendance (Fallback)
            // REMOVED: exam_attendance table does not exist.

            // Use createSession to handle DB logic (avoid duplication)
            await createSession(ip || '', seatNumber, JSON.stringify(Array.from(descriptor)));

            setTimeout(() => {
                onVerified();
            }, 1500);

        } catch (err: any) {
            console.error("Error saving session:", err);
            setErrorMessage(err.message || "เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์");
            setStatus('FAILED');
            isVerifyingRef.current = false; // Reset lock on failure
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

    if (!method && status !== 'VERIFYING_IP' && status !== 'SUCCESS') {
        return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-8 max-w-lg w-full text-center animate-in zoom-in-95 duration-200">
                    <h2 className="text-2xl font-bold mb-6 text-gray-800">เลือกวิธีการยืนยันตัวตน</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button 
                            onClick={() => setMethod('WEBCAM')}
                            className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-[#E35205] hover:bg-orange-50 transition group"
                        >
                            <Monitor className="w-12 h-12 mb-3 text-gray-400 group-hover:text-[#E35205] transition-colors" />
                            <span className="font-semibold text-gray-700">ใช้กล้องเว็บแคม</span>
                            <span className="text-xs text-gray-500 mt-1">บนอุปกรณ์นี้</span>
                        </button>
                        <button 
                            onClick={() => setMethod('QR')}
                            className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-[#E35205] hover:bg-orange-50 transition group"
                        >
                            <Smartphone className="w-12 h-12 mb-3 text-gray-400 group-hover:text-[#E35205] transition-colors" />
                            <span className="font-semibold text-gray-700">สแกน QR Code</span>
                            <span className="text-xs text-gray-500 mt-1">เปิดกล้องผ่านมือถือ</span>
                        </button>
                    </div>
                    <button onClick={onCancel} className="mt-8 text-gray-500 hover:text-gray-800 underline text-sm transition">ยกเลิก</button>
                </div>
            </div>
        );
    }

    if (method === 'QR' && status !== 'VERIFYING_IP' && status !== 'SUCCESS' && status !== 'FAILED') {
        return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center animate-in zoom-in-95 duration-200">
                    <h2 className="text-xl font-bold mb-4">สแกนเพื่อเปิดกล้องมือถือ</h2>
                    
                    <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 mb-6 inline-block">
                        {qrUrl ? (
                            <QRCodeCanvas value={qrUrl} size={200} level="H" />
                        ) : (
                            <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-100 rounded-lg">
                                <span className="text-gray-400">กำลังสร้าง QR Code...</span>
                            </div>
                        )}
                    </div>

                    <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                        ใช้โทรศัพท์มือถือสแกน QR Code นี้<br/>
                        เพื่อดำเนินการยืนยันตัวตนต่อบนมือถือ
                    </p>
                    
                    <button onClick={() => setMethod(null)} className="mt-4 text-sm text-gray-500 hover:text-gray-900 underline">
                        ย้อนกลับ
                    </button>
                </div>
            </div>
        );
    }

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
                        <button onClick={() => setMethod(null)} className="text-gray-400 hover:text-gray-600 transition mr-2 text-sm">เปลี่ยนวิธี</button>
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
                             {detectedSeat && (
                                <div className="mt-4 bg-white/20 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/30 text-center animate-in slide-in-from-bottom-4 duration-500">
                                    <p className="text-green-50 text-xs uppercase tracking-wider font-bold mb-1">Your Seat</p>
                                    <p className="text-white text-4xl font-bold">No. {detectedSeat}</p>
                                </div>
                             )}
                             <p className="text-green-100 text-sm mt-6">กำลังเข้าสู่ห้องสอบ...</p>
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


            </div>
            <style>{`@keyframes scan { 0% { top: 0; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } }`}</style>
        </div>
    );
};

export default FaceVerification;