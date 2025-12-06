import { supabase } from '../supabaseClient';
import { User, UserRole } from '../types';
import { determineUserRole } from '../utils';

export const authService = {
  async getSession(): Promise<User | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return this.mapSessionToUser(session);
    }
    return null;
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        callback(this.mapSessionToUser(session));
      } else {
        callback(null);
      }
    });
    return subscription;
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async signInWithPassword(email: string, password: string): Promise<{ user: User | null; error: any }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { user: null, error };
    
    if (data.session) {
        return { user: this.mapSessionToUser(data.session), error: null };
    }
    return { user: null, error: null };
  },

  async signInWithOAuth(provider: 'google') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  },

  mapSessionToUser(session: any): User {
    const email = session.user.email || '';
    const role = determineUserRole(email);
    
    return {
      id: session.user.id,
      email,
      name: session.user.user_metadata.full_name || email.split('@')[0],
      role,
      avatarUrl: session.user.user_metadata.avatar_url,
      isFaceRegistered: false // This might need a separate check
    };
  },

  async authenticateMobile(userId: string, ip: string): Promise<void> {
      const safeIp = (ip && ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) ? ip : '0.0.0.0';

      // 1. Delete existing records
      await supabase.from('qr_authentication').delete().eq('user_id', userId);

      // Calculate expiration time (2 minutes from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 2);

      // 2. Insert new record
      const { error } = await supabase
          .from('qr_authentication')
          .insert({
              user_id: userId,
              status: 'authenticated',
              ip: safeIp,
              authenticated_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString()
          });

      if (error) throw error;
  },

  async authenticateForQRAccess(userId: string): Promise<void> {
      try {
          console.log('Authenticating for QR access with user ID:', userId);
          const fakeUser = {
              id: userId,
              email: `temp_${userId}@qr.access`,
              user_metadata: { qr_access: true }
          };
          
          // Set temporary auth state using the structure from HTML (Exact match)
          const sessionData = {
              access_token: 'temp_qr_access_token',
              refresh_token: 'temp_qr_refresh_token',
              user: fakeUser
          };
          
          // Clear any existing session first to ensure clean state
          localStorage.removeItem('supabase.auth.token');
          localStorage.setItem('supabase.auth.token', JSON.stringify(sessionData));
      } catch (error) {
          console.error('Error in QR authentication:', error);
      }
  }
};
