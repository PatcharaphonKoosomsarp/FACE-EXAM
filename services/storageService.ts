import { supabase } from '../supabaseClient';

export const storageService = {
  async uploadPhoto(userId: string, action: string, blob: Blob, isQrMode: boolean): Promise<string> {
      const fileName = `${userId}/${action}.png`;
      let uploadClient = supabase;

      // For QR Mode, prioritize 'user-photos' as it's known to work with the RPC flow
      if (isQrMode) {
          console.log(`QR Mode: Uploading ${action} to user-photos...`);
          
          // Strategy 1: Try with the "Fake Session" (uploadClient)
          try {
              const { error } = await uploadClient.storage
                  .from('user-photos')
                  .upload(fileName, blob, { upsert: true });
              if (error) throw error;
              const { data } = uploadClient.storage.from('user-photos').getPublicUrl(fileName);
              return data.publicUrl;
          } catch (err1: any) {
              console.warn("Strategy 1 (Fake Session -> user-photos) failed:", err1.message);
              
              // Strategy 2: Try Anonymous upload (Global Client, no fake session)
              try {
                  console.log("Strategy 2: Attempting Anonymous upload to user-photos...");
                  const { error } = await supabase.storage
                      .from('user-photos')
                      .upload(fileName, blob, { upsert: true });
                  if (error) throw error;
                  const { data } = supabase.storage.from('user-photos').getPublicUrl(fileName);
                  return data.publicUrl;
              } catch (err2: any) {
                  console.error("All upload strategies failed for user-photos.");
                  throw new Error("ไม่สามารถอัปโหลดรูปภาพไปยัง user-photos ได้ กรุณาตรวจสอบว่ามี Storage Bucket ชื่อ 'user-photos' และตั้งค่า Policy ถูกต้อง");
              }
          }
      } else {
          // Normal Mode - ONLY user-photos
          try {
              const { error } = await supabase.storage
                  .from('user-photos')
                  .upload(fileName, blob, { upsert: true });
              
              if (error) throw error;
              const { data } = supabase.storage.from('user-photos').getPublicUrl(fileName);
              return data.publicUrl;
          } catch (err: any) {
              console.error("Upload to user-photos failed:", err.message);
              throw new Error("ไม่สามารถอัปโหลดรูปภาพไปยัง user-photos ได้ กรุณาตรวจสอบว่ามี Storage Bucket ชื่อ 'user-photos' และตั้งค่า Policy ถูกต้อง");
          }
      }
  }
};