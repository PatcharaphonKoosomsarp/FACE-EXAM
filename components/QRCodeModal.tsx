import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Smartphone } from 'lucide-react';

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
                <div className="bg-[#E35205] p-5 flex justify-between items-center text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                    
                    <h3 className="font-bold text-lg relative z-10 flex items-center gap-2">
                        <Smartphone className="w-5 h-5" />
                        QR Code สำหรับมือถือ
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition relative z-10">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-8 flex flex-col items-center text-center">
                    <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100 mb-6">
                        <QRCodeCanvas value={url} size={200} level="H" />
                    </div>
                    
                    <p className="text-gray-600 text-sm leading-relaxed">
                        สแกน QR Code นี้เพื่อยืนยันตัวตน<br/>
                        ผ่านโทรศัพท์มือถือ
                    </p>
                </div>
            </div>
        </div>
    );
};

export default QRCodeModal;
