import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useAuthStore } from './store/auth.js';
import { Sidebar } from './components/Sidebar.js';
import { Auth } from './pages/Auth.js';
import { Feed } from './pages/Feed.js';
import { Profile } from './pages/Profile.js';
import { Notifications } from './pages/Notifications.js';
import { Search } from './pages/Search.js';
import { api } from './services/api.js';

// Setup React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

import { motion, AnimatePresence } from 'framer-motion';

function AppContent() {
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<string>('feed');
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // Fetch notifications count at the root for Sidebar badge updates
  const { data: notificationsData } = useQuery<{ notifications: any[] }>({
    queryKey: ['notifications-badge'],
    queryFn: () => api.get('/notifications'),
    enabled: isAuthenticated,
    refetchInterval: 12000, // Sync every 12s
  });

  const unreadCount = notificationsData?.notifications.filter((n) => !n.isRead).length || 0;

  const handleSetActiveTab = (tab: string) => {
    if (tab === 'profile') {
      // Viewing own profile
      setViewingUserId(null);
    }
    setActiveTab(tab);
  };

  const handleSelectUser = (userId: string) => {
    setViewingUserId(userId);
    setActiveTab('profile');
  };

  if (!isAuthenticated) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-white font-sans overflow-hidden flex-col md:flex-row relative">
      {/* Floating Animated Background Glow Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-[130px] animate-glow-1" />
        <div className="absolute top-[40%] right-[-10%] w-[450px] h-[450px] rounded-full bg-pink-500/8 blur-[120px] animate-glow-2" />
        <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[150px] animate-glow-3" />
      </div>

      {/* Sidebar navigation (renders desktop sidebar or mobile bottom-bar) */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleSetActiveTab} 
        unreadCount={unreadCount} 
      />

      {/* Main Content Area */}
      <main className="flex-1 bg-transparent relative overflow-hidden flex flex-col z-10 w-full h-full">
        {/* Render Tab Component with animated transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + (activeTab === 'profile' ? `_${viewingUserId}` : '')}
            initial={{ opacity: 0, y: 15, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.99 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 flex flex-col overflow-hidden relative w-full h-full"
          >
            {activeTab === 'feed' && <Feed />}
            {activeTab === 'search' && <Search onSelectUser={handleSelectUser} />}
            {activeTab === 'notifications' && <Notifications />}
            {activeTab === 'profile' && (
              <Profile 
                viewingUserId={viewingUserId} 
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
