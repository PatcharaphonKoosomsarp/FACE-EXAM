import React, { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Camera as CameraIcon, RefreshCw, CheckCircle, Smartphone, Monitor, AlertTriangle, Lock, VideoOff } from 'lucide-react';
import { FaceRegistrationStep } from '../types';
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { authService } from '../services/authService';
import { storageService } from '../services/storageService';

declare const faceapi: any;

const QUALITY_MIN_DETECTION_SCORE_DESKTOP = 0.82;
const QUALITY_MIN_DETECTION_SCORE_MOBILE = 0.75;
const QUALITY_MIN_FACE_WIDTH_DESKTOP = 120;
const QUALITY_MIN_FACE_WIDTH_MOBILE = 90;

const stepsData: FaceRegistrationStep[] = [
  { id: '1', instruction: 'หน้าตรง', description: 'มองตรงไปที่กล้อง', isCompleted: false },
  { id: '2', instruction: 'หลับตา-ลืมตา', description: 'หลับตาลงช้าๆ แล้วลืมตา', isCompleted: false },
  { id: '3', instruction: 'หันซ้าย', description: 'หันหน้าไปทางซ้ายช้าๆ', isCompleted: false },
  { id: '4', instruction: 'หันขวา', description: 'หันหน้าไปทางขวาช้าๆ', isCompleted: false },
  { id: '5', instruction: 'เงยหน้า-ก้มหน้า', description: 'ขยับศีรษะขึ้นและลง', isCompleted: false },
  { id: '6', instruction: 'ใบหน้าเข้าใกล้', description: 'ขยับใบหน้าเข้าใกล้กล้อง', isCompleted: false },
];

interface FaceRegistrationProps {
  onComplete: () => void;
  onCancel: () => void;
  targetUserId?: string; // Optional: For mobile registration mode
}

const FaceRegistration: React.FC<FaceRegistrationProps> = ({ onComplete, onCancel, targetUserId }) => {
    const isMobileRegistration = Boolean(targetUserId);
    const qualityMinScore = isMobileRegistration ? QUALITY_MIN_DETECTION_SCORE_MOBILE : QUALITY_MIN_DETECTION_SCORE_DESKTOP;
    const qualityMinFaceWidth = isMobileRegistration ? QUALITY_MIN_FACE_WIDTH_MOBILE : QUALITY_MIN_FACE_WIDTH_DESKTOP;
  const [method, setMethod] = useState<'WEBCAM' | 'QR' | null>(targetUserId ? 'WEBCAM' : null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState(stepsData);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // เพิ่ม state สำหรับเก็บ User Profile ที่ดึงมา (กรณีเปิดหน้าเว็บ Mobile)
  const [mobileUser, setMobileUser] = useState<any>(null);
  const [errorType, setErrorType] = useState<'PERMISSION' | 'NOT_FOUND' | 'IN_USE' | 'GENERIC' | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Liveness State
  const [capturedPhotos, setCapturedPhotos] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<string>('กำลังเตรียมกล้อง...');
  const [distanceRatio, setDistanceRatio] = useState<number>(0);
    const [qualityWarning, setQualityWarning] = useState<string | null>(null);
    const [qualityModelReady, setQualityModelReady] = useState(false);
        const captureFrameRef = useRef<{ width: number; height: number } | null>(null);
    const qualityStateRef = useRef({
            isValid: false,
            score: 0,
            faceWidth: 0,
            warning: 'Face not clear'
    });
  
  // Internal Logic State
  const internalState = useRef({
      baselineEyeDist: null as number | null,
      done: { 
          faceForward: false,
          eyeClosed: false, 
          eyeOpen: false, 
          left: false, 
          right: false, 
          up: false, 
          down: false, 
          close: false 
      },
      sequence: ['faceForward', 'eyeClosed', 'eyeOpen', 'left', 'right', 'up', 'down', 'close'],
      currentSeqIndex: 0,
      lastLandmarks: null as any,
      holdStartTime: 0
  });

  const T = {
      leftTurn: -0.35,
      rightTurn: 0.35,
      up: 0.45,
      down: 0.65,
      blinkEAR: 0.18,
      openEAR: 0.20,
      closeRatio: 1.25
  };

  const EAR = (lm: any[], idx: number[]) => {
      const [p1, p2, p3, p4, p5, p6] = idx.map(i => lm[i]);
      const vertical1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
      const vertical2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
      const horizontal = Math.hypot(p1.x - p4.x, p1.y - p4.y);
      return (vertical1 + vertical2) / (2.0 * horizontal);
  };

  const capturePhoto = useCallback(async (action: string, landmarks: any) => {
      if (!videoRef.current) return;
      
      const video = videoRef.current;
      const captureFrame = captureFrameRef.current;
      const sourceWidth = video.videoWidth || captureFrame?.width || 640;
      const sourceHeight = video.videoHeight || captureFrame?.height || 480;

      const canvas = document.createElement('canvas');
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Draw Mirrored Video (Flip Horizontal) to match user view
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Crop logic if landmarks exist
      if (landmarks) {
          let targetLandmarks = landmarks;
          let padding = 0.08; // Default padding for face
          const isEyeAction = action === 'eyeClosed' || action === 'eyeOpen';

          // Special cropping for Eyes (Close/Open)
          if (isEyeAction) {
             // Use comprehensive eye landmarks (16 points per eye) for better coverage
             const leftEyeIdx = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
             const rightEyeIdx = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
             // Combine indices
             const indices = [...leftEyeIdx, ...rightEyeIdx];
             targetLandmarks = indices.map(i => landmarks[i]);
             padding = 0.03; // Tighter padding for eyes
          }

          let minX = 1, minY = 1, maxX = 0, maxY = 0;
          for (let i = 0; i < targetLandmarks.length; i++) {
              const p = targetLandmarks[i];
              if (p.x < minX) minX = p.x;
              if (p.x > maxX) maxX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.y > maxY) maxY = p.y;
          }

          // Forehead-aware extension: FaceMesh top landmark usually stops around forehead,
          // so estimate extra space above to avoid cutting hair/head.
          if (!isEyeAction && landmarks.length > 152) {
              const topFace = landmarks[10];
              const chin = landmarks[152];
              if (topFace && chin) {
                  const faceVertical = Math.max(0.01, chin.y - topFace.y);
                  const estimatedForeheadTop = topFace.y - (faceVertical * 0.65);
                  minY = Math.min(minY, estimatedForeheadTop);
              }
          }

          // Adjust for Mirroring: Flip X coordinates
          // Original: 0 (Left) -> 1 (Right)
          // Mirrored: 1 (Left) -> 0 (Right)
          // So, new_x = 1 - old_x
          const tempMinX = minX;
          minX = 1 - maxX;
          maxX = 1 - tempMinX;

          if (isEyeAction) {
              minX = Math.max(0, minX - padding);
              minY = Math.max(0, minY - padding);
              maxX = Math.min(1, maxX + padding);
              maxY = Math.min(1, maxY + padding);
          } else {
              const faceWidth = Math.max(0.01, maxX - minX);
              const faceHeight = Math.max(0.01, maxY - minY);

              // Expand more to top to avoid cutting forehead/hairline
              minX -= faceWidth * 0.24;
              maxX += faceWidth * 0.24;
              minY -= faceHeight * 0.50;
              maxY += faceHeight * 0.20;

              // Keep portrait framing and center face in crop
              const targetAspect = 0.74; // width / height (taller portrait frame)
              let cropWidth = Math.max(0.01, maxX - minX);
              let cropHeight = Math.max(0.01, maxY - minY);
              const centerX = (minX + maxX) / 2;
              const centerY = ((minY + maxY) / 2) - (cropHeight * 0.08);

              if (cropWidth / cropHeight < targetAspect) {
                  cropWidth = cropHeight * targetAspect;
              } else {
                  cropHeight = cropWidth / targetAspect;
              }

              minX = centerX - cropWidth / 2;
              maxX = centerX + cropWidth / 2;
              minY = centerY - cropHeight / 2;
              maxY = centerY + cropHeight / 2;

              // Shift crop back into normalized frame bounds
              if (minX < 0) {
                  maxX -= minX;
                  minX = 0;
              }
              if (maxX > 1) {
                  minX -= (maxX - 1);
                  maxX = 1;
              }
              if (minY < 0) {
                  maxY -= minY;
                  minY = 0;
              }
              if (maxY > 1) {
                  minY -= (maxY - 1);
                  maxY = 1;
              }

              minX = Math.max(0, minX);
              minY = Math.max(0, minY);
              maxX = Math.min(1, maxX);
              maxY = Math.min(1, maxY);
          }

          const sx = Math.floor(minX * canvas.width);
          const sy = Math.floor(minY * canvas.height);
          const sw = Math.max(1, Math.floor((maxX - minX) * canvas.width));
          const sh = Math.max(1, Math.floor((maxY - minY) * canvas.height));

          const croppedCanvas = document.createElement('canvas');
          croppedCanvas.width = sw;
          croppedCanvas.height = sh;
          const croppedCtx = croppedCanvas.getContext('2d');
          
          if (croppedCtx) {
              croppedCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
              
              // Convert to blob/base64
              const blob = await new Promise<Blob | null>(resolve => croppedCanvas.toBlob(resolve, 'image/png'));
              if (blob) {
                  setCapturedPhotos(prev => [...prev, { action, blob }]);
                  console.log(`Captured ${action}`);
              }
          }
      }
  }, []);

  const onResults = useCallback((results: Results) => {
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
          setFeedback("ไม่พบใบหน้า");
          setDistanceRatio(0);
          return;
      }

      if (qualityModelReady && !qualityStateRef.current.isValid) {
          internalState.current.holdStartTime = 0;
          setFeedback(qualityStateRef.current.warning || "Face not clear");
          return;
      }

      const lm = results.multiFaceLandmarks[0];
      internalState.current.lastLandmarks = lm;
      
      // Logic
      const leftIdx = [33, 160, 158, 133, 153, 144];
      const rightIdx = [362, 385, 387, 263, 373, 380];
      const ear = (EAR(lm, leftIdx) + EAR(lm, rightIdx)) / 2;

      const nose = lm[1];
      const L = lm[234];
      const R = lm[454];
      const cx = (L.x + R.x) / 2;
      let offsetX = (nose.x - cx) / (R.x - L.x);
      offsetX *= -1; // Mirror effect adjustment

      const vertRatio = (nose.y - lm[10].y) / (lm[152].y - lm[10].y);

      const eyeDist = Math.hypot(lm[33].x - lm[263].x, lm[33].y - lm[263].y);
      if (internalState.current.baselineEyeDist === null) {
          internalState.current.baselineEyeDist = eyeDist;
      }
      const ratio = eyeDist / (internalState.current.baselineEyeDist || 1);
      setDistanceRatio(ratio);

      const state = internalState.current;
      const currentSeq = state.sequence[state.currentSeqIndex];

      // Check Logic
      let isPoseValid = false;
      let feedbackMsg = "";

      // 0. Face Forward (Implicit Step 1)
      if (currentSeq === 'faceForward') {
          if (Math.abs(offsetX) < 0.1 && vertRatio > 0.4 && vertRatio < 0.6) {
              isPoseValid = true;
              feedbackMsg = "หน้าตรง: ค้างไว้...";
          } else {
              feedbackMsg = "กรุณามองตรง";
          }
      }
      // 1. Eye Closed
      else if (currentSeq === 'eyeClosed') {
          if (ear < T.blinkEAR) {
              isPoseValid = true;
              feedbackMsg = "หลับตา: ค้างไว้...";
          } else {
              feedbackMsg = "กรุณาหลับตา";
          }
      }
      // 2. Eye Open
      else if (currentSeq === 'eyeOpen') {
          if (ear > T.openEAR) {
              isPoseValid = true;
              feedbackMsg = "ลืมตา: ค้างไว้...";
          } else {
              feedbackMsg = "กรุณาลืมตา";
          }
      }
      // 3. Left
      else if (currentSeq === 'left') {
          if (offsetX < T.leftTurn) {
              isPoseValid = true;
              feedbackMsg = "หันซ้าย: ค้างไว้...";
          } else {
              feedbackMsg = "กรุณาหันซ้าย";
          }
      }
      // 4. Right
      else if (currentSeq === 'right') {
          if (offsetX > T.rightTurn) {
              isPoseValid = true;
              feedbackMsg = "หันขวา: ค้างไว้...";
          } else {
              feedbackMsg = "กรุณาหันขวา";
          }
      }
      // 5. Up
      else if (currentSeq === 'up') {
          if (vertRatio < T.up) {
              isPoseValid = true;
              feedbackMsg = "เงยหน้า: ค้างไว้...";
          } else {
              feedbackMsg = "กรุณาเงยหน้า";
          }
      }
      // 6. Down
      else if (currentSeq === 'down') {
          if (vertRatio > T.down) {
              isPoseValid = true;
              feedbackMsg = "ก้มหน้า: ค้างไว้...";
          } else {
              feedbackMsg = "กรุณาก้มหน้า";
          }
      }
      // 7. Close
      else if (currentSeq === 'close') {
          if (ratio > T.closeRatio) {
              isPoseValid = true;
              feedbackMsg = "ใกล้กล้อง: ค้างไว้...";
          } else {
              feedbackMsg = "กรุณาขยับหน้าเข้าใกล้กล้อง";
          }
      }

      if (isPoseValid) {
          if (state.holdStartTime === 0) {
              state.holdStartTime = Date.now();
          }
          
          const elapsed = Date.now() - state.holdStartTime;
          // Hold for 800ms to ensure stability and reduce blur
          // For eyes, maybe shorter is fine, but consistency is good
          const HOLD_DURATION = 400; 

          if (elapsed >= HOLD_DURATION) {
              // Capture
              // @ts-ignore
              state.done[currentSeq] = true;
              capturePhoto(currentSeq, lm);
              state.currentSeqIndex++;
              state.holdStartTime = 0; // Reset

              if (currentSeq === 'faceForward') {
                  completeUIStep(0);
              } else if (currentSeq === 'eyeOpen') {
                  completeUIStep(1);
              } else if (currentSeq === 'left') {
                  completeUIStep(2);
              } else if (currentSeq === 'right') {
                  completeUIStep(3);
              } else if (currentSeq === 'down') {
                  completeUIStep(4);
              } else if (currentSeq === 'close') {
                  completeUIStep(5);
                  // All done
                  setIsReviewing(true);
              }
          } else {
              setFeedback(feedbackMsg);
          }
      } else {
          state.holdStartTime = 0; // Reset if pose lost
          setFeedback(feedbackMsg);
      }

  }, [capturePhoto]);

    useEffect(() => {
        if (method !== 'WEBCAM') return;

        let isMounted = true;
        const loadQualityModel = async () => {
            try {
                const MODEL_URL = '/models';
                await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
                if (isMounted) setQualityModelReady(true);
            } catch (error) {
                console.warn('Quality model load failed:', error);
            }
        };

        loadQualityModel();
        return () => {
            isMounted = false;
        };
    }, [method]);

    useEffect(() => {
        if (method !== 'WEBCAM' || !isCapturing || !qualityModelReady || !videoRef.current) return;

        let isMounted = true;
        let isChecking = false;

        const qualityCheckLoop = async () => {
            if (!isMounted || isChecking || !videoRef.current) return;
            isChecking = true;

            try {
                const detection = await faceapi
                    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }));

                if (!isMounted) return;

                if (!detection) {
                    qualityStateRef.current = { isValid: false, score: 0, faceWidth: 0, warning: 'Face not clear' };
                    setQualityWarning('Face not clear');
                    return;
                }

                const score = detection.score || 0;
                const faceWidth = detection.box?.width || 0;

                if (score < qualityMinScore) {
                    qualityStateRef.current = { isValid: false, score, faceWidth, warning: 'Face not clear' };
                    setQualityWarning('Face not clear');
                } else if (faceWidth < qualityMinFaceWidth) {
                    qualityStateRef.current = { isValid: false, score, faceWidth, warning: 'Please move closer' };
                    setQualityWarning('Please move closer');
                } else {
                    qualityStateRef.current = { isValid: true, score, faceWidth, warning: '' };
                    setQualityWarning(null);
                }
            } catch (error) {
                qualityStateRef.current = { isValid: false, score: 0, faceWidth: 0, warning: 'Face not clear' };
                setQualityWarning('Face not clear');
            } finally {
                isChecking = false;
            }
        };

        const interval = setInterval(qualityCheckLoop, 250);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [method, isCapturing, qualityModelReady, qualityMinFaceWidth, qualityMinScore]);

  const completeUIStep = (index: number) => {
      setSteps(prev => {
          const newSteps = [...prev];
          if (newSteps[index]) {
              newSteps[index].isCompleted = true;
          }
          return newSteps;
      });
      setCurrentStepIndex(index + 1);
  };

  // Mimic the HTML's fake authentication for QR access
  const authenticateForQRAccess = async (userId: string) => {
      await authService.authenticateForQRAccess(userId);
      return true;
  };

  const finishRegistration = async () => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      setFeedback("กำลังบันทึกข้อมูล...");
      
      // Upload to Supabase
      try {
          let userId = targetUserId;
          let isQrMode = !!targetUserId;
          let uploadClient = supabase; // Default to global client

          // Check authentication if not in mobile target mode
          if (!userId) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user found");
            userId = user.id;
          } else {
             console.log("Proceeding with targetUserId (QR Mode):", userId);
             
             // QR Mode Strategy: Match HTML Logic
             // 1. Authenticate with Fake Session (as per HTML)
             // This sets a fake token in localStorage which the HTML version relies on.
             await authenticateForQRAccess(userId);
             
             console.log("QR Mode: Attempting upload (matching HTML logic)");
             uploadClient = supabase; 
          }

          const photoData: any = { user_id: userId };
          const actionMapping: any = {
              'faceForward': 'face_forward',
              'eyeClosed': 'closed_eye',
              'eyeOpen': 'open_eye',
              'left': 'turn_left',
              'right': 'turn_right',
              'up': 'look_up',
              'down': 'look_down',
              'close': 'move_close'
          };

          // Upload each photo
          for (const photo of capturedPhotos) {
              const col = actionMapping[photo.action];
              if (col) {
                  // Upload directly. If it fails, the main catch block will handle it.
                  // We DO NOT want to fall back to Base64 anymore.
                  const publicUrl = await storageService.uploadPhoto(userId, photo.action, photo.blob, isQrMode);
                  
                  // Add timestamp to URL to prevent caching issues on client side
                  photoData[col] = `${publicUrl}?t=${Date.now()}`;
              }
          }

          // Save to DB
          console.log("Saving to DB. Mode:", isQrMode ? "QR (RPC)" : "Normal (Direct)", "UserID:", userId);
          if (isQrMode) {
              // Use RPC functions for QR mode to bypass RLS (as seen in qr_register_face.html)
              // These functions must exist in the database as SECURITY DEFINER
              
              // Use the uploadClient for RPC as well, just in case
              
              // 1. Check existing via RPC
              const { data: existingData, error: checkError } = await uploadClient
                  .rpc('get_user_photos_qr', { p_user_id: userId });
              
              let existingId = null;
              if (!checkError && existingData && existingData.length > 0) {
                  existingId = existingData[0].id;
              }

              if (existingId) {
                  console.log('Updating existing record via QR access function...');
                  const { data: result, error: updateError } = await uploadClient
                      .rpc('update_user_photos_qr', {
                          p_record_id: existingId,
                          p_photo_data: photoData
                      });
                  
                  if (updateError) throw updateError;
                  if (result && result.error) throw new Error(result.error);

              } else {
                  console.log('Inserting new record via QR access function...');
                  const { data: result, error: insertError } = await uploadClient
                      .rpc('insert_user_photos_qr', {
                          p_user_id: userId,
                          p_photo_data: photoData
                      });
                  
                  if (insertError) throw insertError;
                  if (result && result.error) throw new Error(result.error);
              }

          } else {
              // Normal authenticated mode
              const { data: existing } = await supabase
                  .from('user_photos')
                  .select('id')
                  .eq('user_id', userId)
                  .maybeSingle();

              if (existing) {
                  await supabase.from('user_photos').update(photoData).eq('id', existing.id);
              } else {
                  await supabase.from('user_photos').insert(photoData);
              }
          }

          onComplete();

      } catch (err: any) {
          console.error("Registration error:", err);
          const errorMsg = err.message || "Unknown error";
          setError("เกิดข้อผิดพลาดในการบันทึก: " + errorMsg);
          setErrorType('GENERIC');
          
          // Show alert for mobile users who might miss the error UI
          alert("บันทึกไม่สำเร็จ: " + errorMsg + "\nกรุณาลองใหม่อีกครั้ง");
      } finally {
          setIsSubmitting(false);
      }
  };

  // Webcam Logic
  useEffect(() => {
    let camera: Camera | null = null;
    let faceMesh: FaceMesh | null = null;

    const startCamera = async () => {
      if (method === 'WEBCAM' && !isCapturing && videoRef.current) {
        try {
          setError(null);
          setErrorType(null);

          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("SecureContextRequired");
          }
          
          faceMesh = new FaceMesh({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
          }});
          
          faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });
          
          faceMesh.onResults(onResults);

          if (videoRef.current) {
              camera = new Camera(videoRef.current, {
                onFrame: async () => {
                  if (videoRef.current && faceMesh) {
                      await faceMesh.send({image: videoRef.current});
                  }
                },
                                width: isMobileRegistration && window.innerHeight > window.innerWidth ? 480 : 640,
                                height: isMobileRegistration && window.innerHeight > window.innerWidth ? 640 : 480
              });
              await camera.start();

              if (videoRef.current?.srcObject) {
                  const stream = videoRef.current.srcObject as MediaStream;
                  const track = stream.getVideoTracks()[0];
                  const settings = track?.getSettings?.();
                  if (settings?.width && settings?.height) {
                      captureFrameRef.current = { width: settings.width, height: settings.height };
                  }
              }

              setIsCapturing(true);
          }

        } catch (err: any) {
          console.error("Camera error:", err);
           if (err.message === 'SecureContextRequired') {
             setErrorType('GENERIC');
             setError("กรุณาใช้งานผ่าน HTTPS หรือ Localhost เท่านั้น (Browser Blocked Camera)");
           } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
             setErrorType('PERMISSION');
             setError("สิทธิ์การเข้าถึงกล้องถูกปฏิเสธ");
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
             setErrorType('NOT_FOUND');
             setError("ไม่พบอุปกรณ์กล้อง");
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
             setErrorType('IN_USE');
             setError("กล้องถูกใช้งานโดยโปรแกรมอื่น");
          } else {
             setErrorType('GENERIC');
             setError("ไม่สามารถเข้าถึงกล้องได้: " + err.message);
          }
        }
      }
    };

    startCamera();

    return () => {
      if (camera) camera.stop();
      if (faceMesh) faceMesh.close();
    };
  }, [method, retryCount, onResults]);

  // QR Code Generation & Polling Logic
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (method === 'QR') {
        const startProcess = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // 1. Generate QR
                const baseUrl = window.location.origin;
                const url = `${baseUrl}/?mode=mobile-register&user_id=${encodeURIComponent(user.id)}`;
                setQrUrl(url);

                // 2. Get Initial State (to detect changes)
                let initialFaceForward: string | null = null;
                try {
                    const { data: initialData } = await supabase
                        .from('user_photos')
                        .select('face_forward')
                        .eq('user_id', user.id)
                        .maybeSingle();
                    if (initialData) {
                        initialFaceForward = initialData.face_forward;
                    }
                } catch (e) { console.warn("Error fetching initial state:", e); }

                // 3. Start Polling
                pollInterval = setInterval(async () => {
                    try {
                        const { data: currentData } = await supabase
                            .from('user_photos')
                            .select('face_forward')
                            .eq('user_id', user.id)
                            .maybeSingle();

                        if (currentData && currentData.face_forward) {
                            // If we didn't have a record before, and now we do -> Success
                            if (!initialFaceForward) {
                                clearInterval(pollInterval);
                                onComplete();
                            } 
                            // If we had a record, check if it changed (timestamp in URL changes)
                            else if (currentData.face_forward !== initialFaceForward) {
                                clearInterval(pollInterval);
                                onComplete();
                            }
                        }
                    } catch (e) {
                        console.error("Polling error:", e);
                    }
                }, 3000); // Check every 3 seconds
            }
        };
        startProcess();
    }

    return () => {
        if (pollInterval) clearInterval(pollInterval);
    };
  }, [method, onComplete]);

  const handleRetry = () => {
      setError(null);
      setErrorType(null);
      setRetryCount(prev => prev + 1);
      setIsCapturing(false);
  };

  const handleRetake = () => {
      setCapturedPhotos([]);
      setIsReviewing(false);
      setCurrentStepIndex(0);
      setSteps(stepsData.map(s => ({...s, isCompleted: false})));
      internalState.current = {
          baselineEyeDist: null,
          done: { 
              faceForward: false,
              eyeClosed: false, 
              eyeOpen: false, 
              left: false, 
              right: false, 
              up: false, 
              down: false, 
              close: false 
          },
          sequence: ['faceForward', 'eyeClosed', 'eyeOpen', 'left', 'right', 'up', 'down', 'close'],
          currentSeqIndex: 0,
          lastLandmarks: null
      };
      setFeedback('กำลังเตรียมกล้อง...');
  };

  if (isReviewing) {
      const actionLabels: Record<string, string> = {
        'faceForward': 'หน้าตรง',
        'eyeClosed': 'หลับตา',
        'eyeOpen': 'ลืมตา',
        'left': 'หันซ้าย',
        'right': 'หันขวา',
        'up': 'เงยหน้า',
        'down': 'ก้มหน้า',
        'close': 'ใกล้กล้อง'
      };

      return (
        <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">ตรวจสอบรูปถ่ายของคุณ</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {capturedPhotos.map((photo, idx) => (
                        <div key={idx} className="flex flex-col items-center group">
                            <div className="relative overflow-hidden rounded-lg border border-gray-200 shadow-sm aspect-[4/3] w-full">
                                <img 
                                    src={URL.createObjectURL(photo.blob)} 
                                    alt={photo.action} 
                                    className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                                />
                            </div>
                            <span className="text-sm mt-2 text-gray-600 font-medium">{actionLabels[photo.action] || photo.action}</span>
                        </div>
                    ))}
                </div>
                <div className="flex justify-center gap-4">
                    <button 
                        onClick={handleRetake}
                        className="px-6 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
                    >
                        ถ่ายใหม่ทั้งหมด
                    </button>
                    <button 
                        onClick={() => finishRegistration()}
                        disabled={isSubmitting}
                        className={`px-8 py-2 rounded-full text-white font-bold transition shadow-lg flex items-center ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary hover:bg-orange-600'}`}
                    >
                        {isSubmitting ? (
                            <>
                                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                                กำลังบันทึก...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5 mr-2" />
                                ยืนยันและบันทึก
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
      );
  }

  if (!method) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-lg w-full text-center animate-in zoom-in-95 duration-200">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">เลือกวิธีการลงทะเบียนใบหน้า</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
                onClick={() => setMethod('WEBCAM')}
                className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-orange-50 transition group"
            >
                <Monitor className="w-12 h-12 mb-3 text-gray-400 group-hover:text-primary transition-colors" />
                <span className="font-semibold text-gray-700">ใช้กล้องเว็บแคม</span>
                <span className="text-xs text-gray-500 mt-1">บนอุปกรณ์นี้</span>
            </button>
            <button 
                onClick={() => setMethod('QR')}
                className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-orange-50 transition group"
            >
                <Smartphone className="w-12 h-12 mb-3 text-gray-400 group-hover:text-primary transition-colors" />
                <span className="font-semibold text-gray-700">สแกน QR Code</span>
                <span className="text-xs text-gray-500 mt-1">เปิดกล้องผ่านมือถือ</span>
            </button>
          </div>
          <button onClick={onCancel} className="mt-8 text-gray-500 hover:text-gray-800 underline text-sm transition">ยกเลิกการลงทะเบียน</button>
        </div>
      </div>
    );
  }

  if (method === 'QR') {
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
                    เพื่อดำเนินการลงทะเบียนใบหน้าต่อบนมือถือ
                </p>
                
                <button onClick={() => setMethod(null)} className="mt-4 text-sm text-gray-500 hover:text-gray-900 underline">
                    ย้อนกลับ
                </button>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50">
      <div className={`w-full max-w-5xl bg-white md:rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row ${targetUserId ? 'h-full md:h-[85vh] rounded-none' : 'h-[85vh] rounded-2xl'}`}>
        
        {/* Camera View */}
        <div className="relative bg-black flex-1 flex items-center justify-center overflow-hidden">
          {error ? (
              <div className="flex flex-col items-center text-white p-8 text-center max-w-md animate-in fade-in zoom-in-95">
                  <div className="bg-red-500/20 p-5 rounded-full mb-6 ring-1 ring-red-500/50">
                      {errorType === 'PERMISSION' ? <Lock className="w-12 h-12 text-red-500" /> : 
                       errorType === 'IN_USE' ? <VideoOff className="w-12 h-12 text-red-500" /> :
                       <AlertTriangle className="w-12 h-12 text-red-500" />}
                  </div>
                  <h3 className="text-2xl font-bold mb-2 text-red-400">{error}</h3>
                  
                  <div className="bg-gray-800/80 rounded-lg p-4 mb-8 text-sm text-gray-300 border border-gray-700">
                      {errorType === 'PERMISSION' && (
                          <p>กรุณากดที่ไอคอน 🔒 หรือ 📷 บนแถบที่อยู่ (Address Bar) ของเบราว์เซอร์ แล้วเลือก <strong>"อนุญาต" (Allow)</strong> หรือ <strong>"รีเซ็ตการอนุญาต"</strong> แล้วกดปุ่มลองใหม่อีกครั้ง</p>
                      )}
                      {errorType === 'IN_USE' && (
                          <p>กล้องอาจกำลังถูกใช้งานโดยโปรแกรมอื่น (เช่น Zoom, Google Meet) กรุณาปิดโปรแกรมเหล่านั้นแล้วลองใหม่อีกครั้ง</p>
                      )}
                      {errorType === 'NOT_FOUND' && (
                          <p>ไม่พบอุปกรณ์กล้อง กรุณาตรวจสอบการเชื่อมต่อสาย USB หรือไดรเวอร์ของกล้อง</p>
                      )}
                      {errorType === 'GENERIC' && (
                          <p>เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณารีเฟรชหน้าเว็บหรือเปลี่ยนเบราว์เซอร์</p>
                      )}
                  </div>

                  <div className="flex gap-4">
                    <button 
                        onClick={() => setMethod(null)} 
                        className="px-6 py-2 rounded-full font-medium text-gray-400 hover:text-white hover:bg-white/10 transition"
                    >
                        ย้อนกลับ
                    </button>
                    <button 
                        onClick={handleRetry} 
                        className="bg-primary text-white px-8 py-2 rounded-full font-bold hover:bg-orange-600 transition shadow-lg flex items-center"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" /> ลองใหม่อีกครั้ง
                    </button>
                  </div>
              </div>
          ) : (
              <>
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover transform scale-x-[-1]"
                />
                
                {/* Overlay UI */}
                <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm flex items-center z-20 backdrop-blur-sm border border-white/10">
                    <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                    Live Face Detection
                </div>

                {/* Feedback & Distance Control */}
                <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center z-20 gap-3 pointer-events-none">
                    <div className="bg-black/70 text-white px-6 py-2 rounded-full text-lg font-semibold backdrop-blur-sm border border-white/10 whitespace-nowrap shadow-lg">
                        {feedback}
                    </div>

                    {qualityWarning && (
                        <div className="bg-red-500/80 text-white px-4 py-1.5 rounded-full text-sm font-semibold border border-red-300/50 shadow-lg animate-pulse">
                            {qualityWarning}
                        </div>
                    )}

                    {/* Distance Meter */}
                    {distanceRatio > 0 && (
                        <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10 w-64 transition-all duration-300 animate-in slide-in-from-bottom-2">
                            <div className="flex justify-between text-[10px] font-medium text-gray-300 mb-1">
                                <span>ไกล</span>
                                <span className="text-green-400">เหมาะสม</span>
                                <span>ใกล้</span>
                            </div>
                            <div className="h-2 bg-gray-600/50 rounded-full overflow-hidden relative">
                                {/* Optimal Zone Marker (approx 0.8 - 1.2) */}
                                <div className="absolute top-0 bottom-0 left-[30%] right-[30%] bg-green-500/20"></div>
                                
                                {/* Indicator */}
                                <div 
                                    className={`h-full transition-all duration-300 ${
                                        distanceRatio >= 0.8 && distanceRatio <= 1.25 ? 'bg-green-500' : 'bg-orange-500'
                                    }`}
                                    style={{ 
                                        width: `${Math.min(100, Math.max(0, (distanceRatio - 0.5) * 100))}%` 
                                    }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Face Box Overlay (Static) */}
                <div className="absolute w-72 h-96 border-2 border-white/40 rounded-[50%] top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] z-10 pointer-events-none">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-12 text-white text-center w-64">
                        <h3 className="font-bold text-2xl drop-shadow-md mb-1">{steps[currentStepIndex]?.instruction || "เสร็จสิ้น"}</h3>
                        <p className="text-sm font-light opacity-90 drop-shadow">{steps[currentStepIndex]?.description}</p>
                    </div>
                    {/* Corner Markers */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 w-1 h-2 bg-primary"></div>
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 w-1 h-2 bg-primary"></div>
                    <div className="absolute top-1/2 left-0 transform -translate-x-1 -translate-y-1/2 w-2 h-1 bg-primary"></div>
                    <div className="absolute top-1/2 right-0 transform translate-x-1 -translate-y-1/2 w-2 h-1 bg-primary"></div>
                </div>
              </>
          )}
        </div>

        {/* Sidebar Instructions */}
        <div className={`w-full md:w-80 bg-gray-50 p-6 overflow-y-auto border-l border-gray-200 transition-all duration-300 ${targetUserId ? 'max-h-[30vh] md:max-h-full' : ''}`}>
            <h3 className="font-bold text-lg mb-6 text-gray-800 flex items-center sticky top-0 bg-gray-50 z-20 py-2">
                <CameraIcon className="w-5 h-5 mr-2 text-primary"/>
                ขั้นตอนการลงทะเบียน
            </h3>
            <div className="space-y-4 relative before:absolute before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-gray-200">
                {steps.map((step, index) => (
                    <div 
                        key={step.id} 
                        id={`step-${index}`}
                        className={`relative pl-4 flex items-start p-3 rounded-xl transition-all duration-300 ${index === currentStepIndex ? 'bg-white shadow-md scale-105 z-10 ring-1 ring-orange-100' : 'opacity-60'}`}
                        ref={(el) => {
                            if (index === currentStepIndex && el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }}
                    >
                        {/* Status Indicator */}
                        <div className="absolute -left-[5px] top-1/2 transform -translate-y-1/2 bg-gray-50 p-1">
                             {step.isCompleted ? (
                                <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center">
                                    <CheckCircle className="w-3 h-3 text-white"/>
                                </div>
                            ) : (
                                <div className={`w-4 h-4 rounded-full border-2 bg-white ${index === currentStepIndex ? 'border-primary scale-125' : 'border-gray-300'}`}></div>
                            )}
                        </div>

                        <div className="ml-2">
                            <h4 className={`font-bold text-sm ${index === currentStepIndex ? 'text-primary' : 'text-gray-700'}`}>{step.instruction}</h4>
                            <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                        </div>
                    </div>
                ))}
            </div>
            <button onClick={onCancel} className="mt-8 w-full py-3 text-gray-500 text-sm border border-gray-200 bg-white rounded-xl hover:bg-gray-50 hover:text-red-500 font-medium transition shadow-sm">
                ยกเลิก
            </button>
        </div>
      </div>
    </div>
  );
};

export default FaceRegistration;