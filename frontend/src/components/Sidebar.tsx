import { useAuthStore } from '../store/auth.js';
import { Home, Search, Bell, User, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unreadCount?: number;
}

export function Sidebar({ activeTab, setActiveTab, unreadCount = 0 }: SidebarProps) {
  const { user, logout } = useAuthStore();

  const menuItems = [
    { id: 'feed', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <>
      {/* Desktop Floating Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-[calc(100vh-2rem)] m-4 rounded-3xl glass-card p-6 text-white shrink-0 relative z-20 shadow-2xl">
        {/* Brand logo */}
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/30">
            <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent font-sans">
            Antigravity
          </span>
        </div>

        {/* Navigation menu */}
        <nav className="space-y-2 flex-1 relative">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-300 relative group cursor-pointer ${
                  isActive ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {/* Active Indicator Bubble with layoutId */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabBubble"
                    className="absolute inset-0 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 rounded-2xl -z-10 shadow-lg shadow-violet-500/5"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                
                <Icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-violet-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span>{item.label === 'Home' ? 'Home Feed' : item.label === 'Profile' ? 'My Profile' : item.label}</span>
                
                {/* Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-[10px] font-bold text-white shadow-md shadow-rose-500/20">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User profile & Logout footer */}
        {user && (
          <div className="mt-auto border-t border-white/5 pt-6 space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500 p-[1.5px] overflow-hidden shrink-0 shadow-md">
                <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden flex items-center justify-center text-white font-bold">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  ) : (
                    user.displayName.charAt(0).toUpperCase()
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate leading-snug">{user.displayName}</p>
                <p className="text-xs text-slate-500 truncate">@{user.username}</p>
              </div>
            </div>
            
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-rose-400 hover:text-rose-300 bg-white/0 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/10 transition-all duration-300 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Floating Bottom Bar */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 h-16 glass-card rounded-2xl flex items-center justify-around px-2 py-1 z-40 shadow-2xl border border-white/10">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-3.5 rounded-xl transition-all duration-300 relative cursor-pointer ${
                isActive ? 'text-white' : 'text-slate-400'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabBubbleMobile"
                  className="absolute inset-0 bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10 border border-violet-500/20 rounded-xl -z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <div className="relative">
                <Icon className={`w-5.5 h-5.5 transition-transform duration-300 ${isActive ? 'text-violet-400 scale-110' : 'text-slate-400'}`} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-[8px] font-bold text-white shadow-sm">
                    {item.badge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {user && (
          <button
            onClick={logout}
            className="flex items-center justify-center p-2 text-rose-400 hover:text-rose-300 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-5.5 h-5.5" />
          </button>
        )}
      </div>
    </>
  );
}
