import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { ScanFace, FileCheck, Download } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { determineUserRole } from '../utils';

interface AuthScreenProps {
  onLogin: (user: User) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error logging in:', error);
      alert('เกิดข้อผิดพลาดในการล็อกอิน');
      setIsLoading(false);
    }
  };

  const GoogleIcon = () => (
    <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="bg-white p-8 md:p-10 rounded-[2rem] shadow-xl w-full max-w-lg border border-gray-100 flex flex-col items-center relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-[#E35205] to-orange-400"></div>

        <div className="text-center mb-8 mt-4">
          {/* Combined Logo Container */}
          <div className="relative bg-orange-50 p-6 rounded-full w-32 h-32 flex items-center justify-center mx-auto mb-6 shadow-sm ring-8 ring-orange-50/50 group hover:scale-105 transition-transform duration-500">
            {/* Primary Icon: Scan Face */}
            <ScanFace className="w-16 h-16 text-[#E35205] stroke-[1.5]" />
            
            {/* Secondary Badge: Exam/Check */}
            <div className="absolute bottom-0 right-0 bg-white rounded-full p-2 shadow-lg border-2 border-orange-100 flex items-center justify-center">
               <FileCheck className="w-6 h-6 text-green-600 stroke-[2]" />
            </div>
          </div>
          
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 leading-snug mb-3">
            ระบบสแกนใบหน้าและติดตามการใช้ทรัพยากรคอมพิวเตอร์สำหรับการสอบในห้องปฏิบัติการ
          </h1>
          
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">
            Facial Recognition and Resource Monitoring System for Lab Exams
          </p>
        </div>

        {/* Conditions Box */}
        <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-5 md:p-6 mb-6 relative mt-4">
           <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-white px-5 py-1 text-sm md:text-base text-gray-500 font-medium rounded-full border border-gray-100 shadow-sm">
             เงื่อนไขการเข้าใช้งาน
           </div>
           <div className="text-sm md:text-base text-gray-700 space-y-3 flex flex-col items-center pt-2">
              <div className="flex items-center w-full justify-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-3 shrink-0"></span>
                  <span>นักศึกษา: <span className="font-mono text-gray-900 bg-white border border-gray-200 px-3 py-1 rounded-md text-xs md:text-sm ml-2 font-medium">@email.kmutnb.ac.th</span></span>
              </div>
              <div className="flex items-center w-full justify-center">
                  <span className="w-2 h-2 bg-gray-700 rounded-full mr-3 shrink-0"></span>
                  <span>อาจารย์: <span className="font-mono text-gray-900 bg-white border border-gray-200 px-3 py-1 rounded-md text-xs md:text-sm ml-2 font-medium">@itm.kmutnb.ac.th</span></span>
              </div>
           </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full max-w-sm bg-white text-gray-700 font-bold text-base py-3 px-6 border-2 border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 hover:shadow-lg transition-all flex items-center justify-center group transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="animate-pulse">กำลังเชื่อมต่อ...</span>
          ) : (
            <>
              <GoogleIcon />
              <span>Sign in with Google</span>
            </>
          )}
        </button>
        

      </div>

      {/* Download Agent Button */}
      <a
        href="/Agent.zip"
        download="Agent.zip"
        className="fixed bottom-6 right-6 flex items-center justify-center w-14 h-14 bg-white rounded-full shadow-lg border border-gray-200 text-gray-500 hover:text-[#E35205] hover:border-orange-200 hover:shadow-xl transition-all group z-50"
        title="Download Agent Files"
      >
        <Download className="w-6 h-6" />
      </a>
    </div>
  );
};

export default AuthScreen;