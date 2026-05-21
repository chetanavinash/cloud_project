import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { Heart, MessageCircle, UserPlus, Bell, Check, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface Notification {
  id: string;
  userId: string;
  type: 'LIKE' | 'COMMENT' | 'FOLLOW';
  senderId: string;
  senderUsername: string;
  content: string;
  isRead: boolean;
  createdAt: number | string;
}

export function Notifications() {
  const queryClient = useQueryClient();

  // Fetch Notifications
  const { data: notificationsData, isLoading, error } = useQuery<{ notifications: Notification[] }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 12000, // Refresh every 12s
  });

  // Mark single notification as read
  const readMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'LIKE':
        return <Heart className="w-4 h-4 text-rose-500 fill-rose-500/10" />;
      case 'COMMENT':
        return <MessageCircle className="w-4 h-4 text-indigo-400" />;
      case 'FOLLOW':
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  const getNotificationDescription = (notif: Notification) => {
    switch (notif.type) {
      case 'LIKE':
        return 'liked your post';
      case 'COMMENT':
        return `commented: "${notif.content}"`;
      case 'FOLLOW':
        return 'started following you';
      default:
        return notif.content;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 flex-1 h-screen">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-slate-400 text-sm">Sorting through notifications...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8 text-center max-w-lg mx-auto py-20">
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          Failed to load notifications. DynamoDB or notification-service might be offline.
        </div>
      </div>
    );
  }

  const unreadNotifications = notificationsData?.notifications.filter(n => !n.isRead) || [];

  return (
    <div className="flex-1 max-w-2xl mx-auto py-8 px-4 overflow-y-auto h-screen scrollbar-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Notifications</h1>
          <p className="text-slate-400 text-sm">Activity details regarding your account</p>
        </div>
        {unreadNotifications.length > 0 && (
          <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
            {unreadNotifications.length} New
          </span>
        )}
      </div>

      {/* List */}
      {notificationsData?.notifications.length === 0 ? (
        <div className="text-center py-16 p-8 border border-dashed border-slate-800 rounded-3xl">
          <Bell className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold mb-1">Silence is golden</p>
          <p className="text-slate-600 text-xs">No notifications recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notificationsData?.notifications.map((notif) => (
            <motion.div
              layout
              key={notif.id}
              className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                notif.isRead 
                  ? 'bg-slate-900/10 border-slate-800/40 opacity-75' 
                  : 'bg-slate-900/40 border-slate-800/80 shadow-md shadow-indigo-500/5'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 shrink-0">
                  {getNotificationIcon(notif.type)}
                </div>
                <div className="min-w-0 text-sm">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-bold text-white">@{notif.senderUsername}</span>
                    <span className="text-slate-400">{getNotificationDescription(notif)}</span>
                  </div>
                  <span className="text-[10px] text-slate-600">
                    {new Date(notif.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {!notif.isRead && (
                <button
                  onClick={() => readMutation.mutate(notif.id)}
                  disabled={readMutation.isPending}
                  className="p-1.5 rounded-lg border border-slate-800 hover:border-indigo-500/40 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition shrink-0"
                  title="Mark as Read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
