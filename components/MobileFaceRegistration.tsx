import React, { useState } from 'react';
import FaceRegistration from './FaceRegistration';
import { CheckCircle } from 'lucide-react';

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
            <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6 text-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full animate-in zoom-in-95">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">ลงทะเบียนสำเร็จ!</h2>
                    <p className="text-gray-600 mb-8">
                        ข้อมูลใบหน้าของคุณถูกบันทึกเรียบร้อยแล้ว<br/>
                        คุณสามารถกลับไปที่หน้าจอหลักบนคอมพิวเตอร์ได้ทันที
                    </p>
                    <button 
                        onClick={() => window.close()}
                        className="w-full py-3 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-900 transition"
                    >
                        ปิดหน้าต่าง
                    </button>
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
