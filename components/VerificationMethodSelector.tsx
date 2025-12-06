import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface VerificationMethodSelectorProps {
    onSelectWebcam: () => void;
    onSelectQRCode: () => void;
    onCancel: () => void;
}

const VerificationMethodSelector: React.FC<VerificationMethodSelectorProps> = ({ onSelectWebcam, onSelectQRCode, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl p-8 max-w-lg w-full text-center animate-in zoom-in-95 duration-200">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">เลือกวิธีการยืนยันตัวตน</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                        onClick={onSelectWebcam}
                        className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-orange-50 transition group bg-white"
                    >
                        <Monitor className="w-12 h-12 mb-3 text-gray-400 group-hover:text-primary transition-colors" />
                        <span className="font-semibold text-gray-700">ใช้กล้องเว็บแคม</span>
                        <span className="text-xs text-gray-500 mt-1">บนอุปกรณ์นี้</span>
                    </button>
                    <button 
                        onClick={onSelectQRCode}
                        className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-orange-50 transition group bg-white"
                    >
                        <Smartphone className="w-12 h-12 mb-3 text-gray-400 group-hover:text-primary transition-colors" />
                        <span className="font-semibold text-gray-700">สแกน QR Code</span>
                        <span className="text-xs text-gray-500 mt-1">เปิดกล้องผ่านมือถือ</span>
                    </button>
                </div>
                <button 
                    onClick={onCancel} 
                    className="mt-8 text-gray-500 hover:text-gray-800 underline text-sm transition"
                >
                    ยกเลิกการยืนยันตัวตน
                </button>
            </div>
        </div>
    );
};

export default VerificationMethodSelector;
