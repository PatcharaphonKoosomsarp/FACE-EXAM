import React, { useState } from 'react';
import FaceRegistration from './FaceRegistration';
import { CheckCircle, ShieldCheck } from 'lucide-react';

interface MobileFaceRegistrationProps {
    targetUserId: string;
}

const MobileFaceRegistration: React.FC<MobileFaceRegistrationProps> = ({ targetUserId }) => {
    const [isComplete, setIsComplete] = useState(false);

    const handleComplete = () => {
        setIsComplete(true);
    };

    const handleCancel = () => {
        // On mobile, cancel might just mean closing the tab or showing a message
        window.close();
        alert("คุณสามารถปิดหน้าต่างนี้ได้");
    };

    if (isComplete) {
        return (
            <div className="min-h-screen bg-black flex flex-col">
                {/* Header */}
                <div className="bg-gray-900 p-4 flex items-center justify-between z-10">
                    <div className="flex items-center text-white">
                        <ShieldCheck className="w-6 h-6 text-green-500 mr-2" />
                        <span className="font-bold">Mobile Registration</span>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                    <div className="text-center p-8 animate-in zoom-in duration-300">
                        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30">
                            <CheckCircle className="w-12 h-12 text-white" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">ลงทะเบียนสำเร็จ!</h2>
                        <p className="text-gray-400 mb-8">
                            ข้อมูลใบหน้าของคุณถูกบันทึกเรียบร้อยแล้ว<br/>
                            คุณสามารถกลับไปที่หน้าจอหลักบนคอมพิวเตอร์ได้ทันที
                        </p>
                        <button 
                            onClick={() => window.close()}
                            className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition shadow-lg shadow-white/10"
                        >
                            ปิดหน้าต่าง
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black">
            <FaceRegistration 
                onComplete={handleComplete} 
                onCancel={handleCancel} 
                targetUserId={targetUserId}
            />
        </div>
    );
};

export default MobileFaceRegistration;
