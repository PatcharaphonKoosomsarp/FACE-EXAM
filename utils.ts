import { UserRole } from './types';
import { supabase } from './supabaseClient';

export const determineUserRole = (email: string): UserRole => {
  if (email.endsWith('@itm.kmutnb.ac.th') || email === 'okkubyes@gmail.com') {
    return UserRole.TEACHER;
  } else if (email.endsWith('@email.kmutnb.ac.th')) {
    return UserRole.STUDENT;
  }
  return UserRole.GUEST;
};

// Helper to check if IP is valid WiFi/Local IP
const isValidWiFiIP = (ip: string): boolean => {
    if (!ip) return false;
    
    // Priority: KMUTNB network (10.110.x.x)
    if (ip.startsWith('10.110.')) return true;
    
    // Standard private networks
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('10.')) return true;
    
    // 172.16.x.x - 172.31.x.x
    const parts = ip.split('.');
    if (parts[0] === '172') {
        const second = parseInt(parts[1], 10);
        if (second >= 16 && second <= 31) return true;
    }
    
    return false;
};

export const getPrimaryWiFiIP = (): Promise<string | null> => {
    return new Promise((resolve) => {
        try {
            const RTCPeerConnection = window.RTCPeerConnection || 
                                      (window as any).webkitRTCPeerConnection || 
                                      (window as any).mozRTCPeerConnection;

            if (!RTCPeerConnection) {
                console.warn('WebRTC not supported');
                resolve(null);
                return;
            }

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            let resolved = false;
            const candidateIPs: string[] = [];

            pc.createDataChannel('');

            pc.onicecandidate = (event) => {
                if (event.candidate && !resolved) {
                    const candidate = event.candidate.candidate;
                    const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);

                    if (ipMatch) {
                        const ip = ipMatch[0];
                        if (!candidateIPs.includes(ip)) {
                            candidateIPs.push(ip);
                        }

                        // If KMUTNB IP, resolve immediately
                        if (ip.startsWith('10.110.')) {
                            resolved = true;
                            pc.close();
                            resolve(ip);
                        }
                    }
                }
            };

            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .catch((e) => console.error('WebRTC offer error:', e));

            // Timeout after 5 seconds
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    pc.close();
                    
                    // Find best IP
                    const bestIP = candidateIPs.find(ip => ip.startsWith('10.110.')) ||
                                   candidateIPs.find(ip => ip.startsWith('192.168.')) ||
                                   candidateIPs.find(ip => isValidWiFiIP(ip));
                    
                    resolve(bestIP || null);
                }
            }, 5000);

        } catch (error) {
            console.error('Error in getPrimaryWiFiIP:', error);
            resolve(null);
        }
    });
};

export const verifyIPAccess = async (roomId: string, detectedIP: string): Promise<boolean> => {
    try {
        console.log(`Verifying IP ${detectedIP} for room ${roomId}`);

        // 1. Get Exam Room Data
        const { data: roomData, error: roomError } = await supabase
            .from('exam_rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (roomError || !roomData) {
            console.error('Error fetching room data:', roomError);
            return false;
        }

        // 2. Find Layout
        // Try direct layout_id first if available (optimization)
        let layoutId = roomData.layout_id;

        if (!layoutId) {
            // Fallback: Find by room_name
            const { data: layouts } = await supabase
                .from('room_seat_layouts')
                .select('id')
                .eq('room_name', roomData.room_name)
                .limit(1);
            
            if (layouts && layouts.length > 0) {
                layoutId = layouts[0].id;
            }
        }

        if (!layoutId) {
            console.warn('No layout found for room');
            return false;
        }

        // 3. Check IP Mappings
        const { data: allowedIPs, error: ipError } = await supabase
            .from('room_seat_ip_mappings')
            .select('ip_address')
            .eq('layout_id', layoutId);

        if (ipError || !allowedIPs) {
            console.error('Error fetching IP mappings:', ipError);
            return false;
        }

        // 4. Match IP
        const match = allowedIPs.find(row => row.ip_address === detectedIP);
        return !!match;

    } catch (error) {
        console.error('Error in verifyIPAccess:', error);
        return false;
    }
};
