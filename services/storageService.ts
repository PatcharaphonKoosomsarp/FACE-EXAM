import { supabase } from '../supabaseClient';

export const storageService = {
  async uploadPhoto(userId: string, action: string, blob: Blob, isQrMode: boolean): Promise<string> {
      const fileName = `${userId}/${action}.png`;
      let publicUrl = '';
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
                  console.warn("Strategy 2 (Anonymous -> user-photos) failed:", err2.message);

                  // Strategy 3: Try 'liveness-photos' bucket (Fake Session)
                  try {
                      console.log("Strategy 3: Attempting upload to liveness-photos (Fake Session)...");
                      const { error } = await uploadClient.storage
                          .from('liveness-photos')
                          .upload(fileName, blob, { upsert: true });
                      if (error) throw error;
                      const { data } = uploadClient.storage.from('liveness-photos').getPublicUrl(fileName);
                      return data.publicUrl;
                  } catch (err3: any) {
                      console.warn("Strategy 3 (Fake Session -> liveness-photos) failed:", err3.message);

                      // Strategy 4: Try 'liveness-photos' bucket (Anonymous)
                      try {
                          console.log("Strategy 4: Attempting Anonymous upload to liveness-photos...");
                          const { error } = await supabase.storage
                              .from('liveness-photos')
                              .upload(fileName, blob, { upsert: true });
                          if (error) throw error;
                          const { data } = supabase.storage.from('liveness-photos').getPublicUrl(fileName);
                          return data.publicUrl;
                      } catch (err4: any) {
                          console.warn("All upload strategies failed. Falling back to Base64 encoding directly to Database.");
                          throw new Error("All upload strategies failed");
                      }
                  }
              }
          }
      } else {
          // Normal Mode
          const { error } = await supabase.storage
              .from('user-photos')
              .upload(fileName, blob, { upsert: true });
          
          if (error) throw error;
          const { data } = supabase.storage.from('user-photos').getPublicUrl(fileName);
          return data.publicUrl;
      }
  }
};