import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface VerificationMethodSelectorProps {
    onSelectWebcam: () => void;
    onSelectQRCode: () => void;
    onCancel: () => void;
}

const VerificationMethodSelector: React.FC<VerificationMethodSelectorProps> = ({ onSelectWebcam, onSelectQRCode, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 animate-in zoom-in-95 duration-200">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-8">เลือกวิธีการยืนยันตัวตน</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <button 
                        onClick={onSelectWebcam}
                        className="flex flex-col items-center justify-center p-8 border-2 border-gray-200 rounded-xl hover:border-[#E35205] hover:bg-orange-50 transition-all group h-64 bg-white"
                    >
                        <Monitor className="w-16 h-16 text-gray-400 group-hover:text-[#E35205] mb-4 transition-colors" />
                        <span className="text-lg font-bold text-gray-700 group-hover:text-gray-900">ใช้กล้องเว็บแคม</span>
                        <span className="text-sm text-gray-500 mt-2">บนอุปกรณ์นี้</span>
                    </button>

                    <button 
                        onClick={onSelectQRCode}
                        className="flex flex-col items-center justify-center p-8 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group h-64 bg-white"
                    >
                        <Smartphone className="w-16 h-16 text-gray-400 group-hover:text-blue-500 mb-4 transition-colors" />
                        <span className="text-lg font-bold text-gray-700 group-hover:text-gray-900">สแกน QR Code</span>
                        <span className="text-sm text-gray-500 mt-2">เปิดกล้องผ่านมือถือ</span>
                    </button>
                </div>

                <div className="mt-8 text-center">
                    <button 
                        onClick={onCancel}
                        className="text-gray-500 hover:text-gray-700 underline text-sm"
                    >
                        ยกเลิก
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VerificationMethodSelector;
