import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X } from 'lucide-react';

interface QRCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    url: string;
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, url }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-4 flex justify-between items-center text-white">
                    <h3 className="font-bold text-lg">QR Code สำหรับมือถือ</h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-8 flex flex-col items-center text-center">
                    <div className="bg-white p-4 rounded-xl shadow-inner border-2 border-dashed border-gray-200 mb-6">
                        <QRCodeCanvas value={url} size={200} level="H" />
                    </div>
                    
                    <p className="text-gray-600 text-sm leading-relaxed">
                        สแกน QR Code นี้เพื่อยืนยันตัวตน<br/>ผ่านโทรศัพท์มือถือ
                    </p>
                </div>
            </div>
        </div>
    );
};

export default QRCodeModal;
