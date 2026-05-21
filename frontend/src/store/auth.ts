import { create } from 'zustand';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, displayName: string, email: string) => void;
  logout: () => void;
  updateUser: (updatedUser: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Load initial state from localStorage if exists
  const storedUser = localStorage.getItem('social_user');
  const initialUser = storedUser ? JSON.parse(storedUser) : null;

  return {
    user: initialUser,
    isAuthenticated: !!initialUser,
    login: (username, displayName, email) => {
      const cleanUsername = username.trim().toLowerCase();
      const mockId = `usr_${cleanUsername}`;
      const newUser: User = {
        id: mockId,
        username: cleanUsername,
        displayName,
        email: email || `${cleanUsername}@example.com`,
      };
      localStorage.setItem('social_user', JSON.stringify(newUser));
      set({ user: newUser, isAuthenticated: true });
    },
    logout: () => {
      localStorage.removeItem('social_user');
      set({ user: null, isAuthenticated: false });
    },
    updateUser: (updatedUser) => {
      set((state) => {
        if (!state.user) return state;
        const newUser = { ...state.user, ...updatedUser };
        localStorage.setItem('social_user', JSON.stringify(newUser));
        return { user: newUser };
      });
    }
  };
});
