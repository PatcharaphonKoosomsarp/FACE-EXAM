import { supabase } from '../supabaseClient';

// --- IP Detection Logic ---

// Helper to check if IP is a valid WiFi/Local IP
const isValidWiFiIP = (ip: string): boolean => {
    if (!ip) return false;
    
    // Priority: KMUTNB network (10.110.x.x)
    if (ip.startsWith('10.110.')) return true;
    
    // Standard WiFi/Local networks
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('10.')) return true;
    
    // Private networks (172.16-31.x.x)
    const parts = ip.split('.');
    if (parts[0] === '172') {
        const secondOctet = parseInt(parts[1]);
        if (secondOctet >= 16 && secondOctet <= 31) return true;
    }
    
    return false;
};

// Helper to find the best IP from a list of candidates
const findBestWiFiIP = (candidateIPs: string[]): string | null => {
    // Priority 1: KMUTNB network
    for (const ip of candidateIPs) {
        if (ip.startsWith('10.110.')) return ip;
    }
    
    // Priority 2: Standard WiFi
    for (const ip of candidateIPs) {
        if (ip.startsWith('192.168.')) return ip;
    }
    
    // Priority 3: Other 10.x.x.x
    for (const ip of candidateIPs) {
        if (ip.startsWith('10.') && !ip.startsWith('10.110.')) return ip;
    }
    
    // Priority 4: 172.16-31.x.x
    for (const ip of candidateIPs) {
        const parts = ip.split('.');
        if (parts[0] === '172') {
            const secondOctet = parseInt(parts[1]);
            if (secondOctet >= 16 && secondOctet <= 31) return ip;
        }
    }
    
    return candidateIPs.length > 0 ? candidateIPs[0] : null;
};

// Main function to get Primary WiFi IP using WebRTC
const getPrimaryWiFiIP = (): Promise<string | null> => {
    return new Promise((resolve) => {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            let resolved = false;
            const candidateIPs: string[] = [];
            
            pc.createDataChannel('test');
            
            pc.onicecandidate = (event) => {
                if (event.candidate && !resolved) {
                    const candidate = event.candidate.candidate;
                    const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                    
                    if (ipMatch) {
                        const ip = ipMatch[0];
                        if (!candidateIPs.includes(ip)) {
                            candidateIPs.push(ip);
                        }
                        
                        // If KMUTNB IP found, resolve immediately
                        if (ip.startsWith('10.110.')) {
                            resolved = true;
                            pc.close();
                            resolve(ip);
                            return;
                        }
                    }
                }
            };
            
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .catch(e => console.error("WebRTC offer error:", e));
            
            // Timeout after 3 seconds (reduced from 8s for better UX in React)
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    pc.close();
                    const bestIP = findBestWiFiIP(candidateIPs);
                    resolve(bestIP);
                }
            }, 3000);
            
        } catch (error) {
            console.error('WebRTC IP detection failed:', error);
            resolve(null);
        }
    });
};

export const getUserIP = async (): Promise<string | null> => {
    try {
        const primaryIP = await getPrimaryWiFiIP();
        if (primaryIP && isValidWiFiIP(primaryIP)) {
            return primaryIP;
        }
        return null;
    } catch (error) {
        console.error('Error in getUserIP:', error);
        return null;
    }
};

// --- Seat Mapping Logic ---

export interface SeatDetectionResult {
    seatNumber: number | null;
    method: 'rpc_function' | 'direct_mapping' | 'manual_selection' | 'not_found' | 'error';
    confidence: 'high' | 'medium' | 'low' | 'none';
    details: string;
    requiresManualMapping?: boolean;
}

export const getActualSeatFromIP = async (
    layoutId: string, 
    detectedIP: string
): Promise<SeatDetectionResult> => {
    try {
        // Method 1: Check using RPC function find_seat_by_ip
        const { data: seatInfo, error: seatError } = await supabase
            .rpc('find_seat_by_ip', { 
                input_ip: detectedIP,
                layout_uuid: layoutId 
            });

        if (seatInfo && !seatError) {
            return {
                seatNumber: seatInfo.seat_number,
                method: 'rpc_function',
                confidence: 'high',
                details: `IP ${detectedIP} found in seat ${seatInfo.seat_number}`
            };
        }

        // Method 2: Direct query to room_seat_ip_mappings table
        const { data: mappingData, error: mappingError } = await supabase
            .from('room_seat_ip_mappings')
            .select('seat_number')
            .eq('layout_id', layoutId)
            .eq('ip_address', detectedIP)
            .maybeSingle();

        if (mappingData && !mappingError) {
            return {
                seatNumber: mappingData.seat_number,
                method: 'direct_mapping',
                confidence: 'high',
                details: `IP ${detectedIP} mapped to seat ${mappingData.seat_number}`
            };
        }

        return {
            seatNumber: null,
            method: 'not_found',
            confidence: 'none',
            details: `No seat mapping found for IP ${detectedIP}`,
            requiresManualMapping: true
        };
        
    } catch (error: any) {
        console.error('Error in IP-to-Seat mapping:', error);
        return {
            seatNumber: null,
            method: 'error',
            confidence: 'none',
            details: `Error: ${error.message}`
        };
    }
};
