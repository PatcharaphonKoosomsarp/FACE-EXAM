import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface VerificationMethodSelectorProps {
    onSelectWebcam: () => void;
    onSelectQRCode: () => void;
    onCancel: () => void;
}

const VerificationMethodSelector: React.FC<VerificationMethodSelectorProps> = ({ onSelectWebcam, onSelectQRCode, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-10 animate-in zoom-in-95 duration-200">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-10">เลือกวิธีการยืนยันตัวตน</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <button 
                        onClick={onSelectWebcam}
                        className="flex flex-col items-center justify-center p-8 border border-gray-200 rounded-xl hover:border-gray-400 hover:shadow-md transition-all group h-60 bg-white"
                    >
                        <Monitor className="w-16 h-16 text-gray-400 group-hover:text-gray-600 mb-6 transition-colors" strokeWidth={1.5} />
                        <span className="text-lg font-bold text-gray-700 group-hover:text-gray-900">ใช้กล้องเว็บแคม</span>
                        <span className="text-sm text-gray-500 mt-2">บนอุปกรณ์นี้</span>
                    </button>

                    <button 
                        onClick={onSelectQRCode}
                        className="flex flex-col items-center justify-center p-8 border border-gray-200 rounded-xl hover:border-gray-400 hover:shadow-md transition-all group h-60 bg-white"
                    >
                        <Smartphone className="w-16 h-16 text-gray-400 group-hover:text-gray-600 mb-6 transition-colors" strokeWidth={1.5} />
                        <span className="text-lg font-bold text-gray-700 group-hover:text-gray-900">สแกน QR Code</span>
                        <span className="text-sm text-gray-500 mt-2">เปิดกล้องผ่านมือถือ</span>
                    </button>
                </div>

                <div className="mt-10 text-center">
                    <button 
                        onClick={onCancel}
                        className="text-gray-500 hover:text-gray-800 underline underline-offset-4 text-sm font-medium transition-colors"
                    >
                        ยกเลิกการยืนยันตัวตน
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VerificationMethodSelector;
