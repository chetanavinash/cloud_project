import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, resolveMediaUrl } from '../services/api.js';
import { useAuthStore, type User } from '../store/auth.js';
import { Edit2, Check, X, Loader2, Calendar, Image as ImageIcon, Heart, Grid, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProfileProps {
  viewingUserId?: string | null;
}

interface UserProfile extends User {
  _count?: {
    followers: number;
    following: number;
  };
  createdAt?: string;
}

interface Post {
  id: string;
  authorId: string;
  content: string;
  mediaUrl?: string;
  createdAt: string;
}

export function Profile({ viewingUserId }: ProfileProps) {
  const queryClient = useQueryClient();
  const { user: currentUser, updateUser: updateAuthUser } = useAuthStore();
  
  const targetUserId = viewingUserId || currentUser?.id;
  const isOwnProfile = targetUserId === currentUser?.id;

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [profileTab, setProfileTab] = useState<'posts' | 'photos' | 'likes'>('posts');

  // 1. Fetch Profile Info
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useQuery<UserProfile>({
    queryKey: ['profile', targetUserId],
    queryFn: () => api.get(`/users/${targetUserId}`),
    enabled: !!targetUserId,
  });

  // 2. Fetch User's Posts
  const { data: postsData, isLoading: isPostsLoading } = useQuery<{ posts: Post[] }>({
    queryKey: ['posts', targetUserId],
    queryFn: () => api.get(`/users/${targetUserId}/posts`),
    enabled: !!targetUserId,
  });

  // 3. Update Profile Mutation
  const updateProfileMutation = useMutation({
    mutationFn: (updatedData: { displayName: string; bio: string; avatarUrl: string }) => 
      api.put(`/users/${currentUser?.id}`, updatedData),
    onSuccess: (data) => {
      updateAuthUser({
        displayName: data.displayName,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
      });
      queryClient.invalidateQueries({ queryKey: ['profile', currentUser?.id] });
      setIsEditing(false);
    },
  });

  // 4. Follow Mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/users/${targetUserId}/follow`);
      await api.post('/feed/clear-cache');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['followers', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  // 5. Unfollow Mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/users/${targetUserId}/follow`);
      await api.post('/feed/clear-cache');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['followers', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  // Check if current user is following this profile
  const { data: followersList } = useQuery<{ followers: any[] }>({
    queryKey: ['followers', targetUserId],
    queryFn: () => api.get(`/users/${targetUserId}/followers`),
    enabled: !isOwnProfile && !!targetUserId,
  });
  
  const isFollowing = followersList?.followers.some((f: any) => f.id === currentUser?.id);

  const handleSave = () => {
    updateProfileMutation.mutate({
      displayName: displayName.trim(),
      bio: bio.trim(),
      avatarUrl: avatarUrl.trim(),
    });
  };

  if (isProfileLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 flex-1 h-screen">
        <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
        <span className="text-slate-400 text-xs font-bold tracking-wider">Opening profile dossier...</span>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="flex-1 p-8 text-center max-w-lg mx-auto py-20">
        <div className="p-6 rounded-[24px] bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold shadow-lg">
          Failed to load profile. The user may not exist or database service is down.
        </div>
      </div>
    );
  }

  // Filters posts to only those with media urls
  const photoPosts = postsData?.posts.filter(p => !!p.mediaUrl) || [];

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto overflow-y-auto h-screen custom-scrollbar pb-24 md:pb-8">
      
      {/* Banner / Cover image with dunes wave curved bottom */}
      <div className="relative h-44 w-full bg-slate-950 overflow-hidden md:rounded-b-[32px] border-b border-white/10">
        <img 
          src="/profile_banner_dunes.png" 
          alt="Profile Cover dunes" 
          className="w-full h-full object-cover opacity-90 transition-transform duration-700 hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
      </div>

      {/* Main Profile Info Section */}
      <div className="px-4 relative -mt-16 mb-6">
        
        {/* Avatar Position and Glow Ring */}
        <div className="inline-block relative">
          <div className="w-[106px] h-[106px] rounded-full bg-slate-950 p-[3.5px] border border-white/10 shadow-2xl relative z-10 overflow-hidden">
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center font-bold text-3xl text-white overflow-hidden">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
              ) : (
                profile.displayName.charAt(0).toUpperCase()
              )}
            </div>
          </div>
          {/* Sparkles active decoration */}
          <div className="absolute -top-1 -right-1 z-20 p-1.5 rounded-full bg-violet-600 text-white shadow-lg shadow-violet-500/20">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Profile Card details */}
        <div className="mt-4 p-5 glass-card rounded-[24px] shadow-lg relative">
          
          {/* Action Button: Edit or Follow */}
          <div className="absolute top-5 right-5">
            {isOwnProfile ? (
              isEditing ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {updateProfileMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setDisplayName(profile.displayName);
                    setBio(profile.bio || '');
                    setAvatarUrl(profile.avatarUrl || '');
                    setIsEditing(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-violet-400" />
                  <span>Edit Profile</span>
                </button>
              )
            ) : (
              <button
                onClick={() => isFollowing ? unfollowMutation.mutate() : followMutation.mutate()}
                disabled={followMutation.isPending || unfollowMutation.isPending}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isFollowing 
                    ? 'bg-white/5 border border-white/5 text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20' 
                    : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-600/30'
                }`}
              >
                {isFollowing ? 'Following' : 'Follow User'}
              </button>
            )}
          </div>

          {/* User Fields Editable vs Viewable */}
          {isEditing ? (
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1.5">Biography</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-slate-950/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-xs font-semibold resize-none"
                />
              </div>
              <div>
                <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1.5">Avatar URL</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full px-4 py-2.5 bg-slate-950/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-xs font-semibold"
                />
              </div>
            </div>
          ) : (
            <div className="mt-2 pr-28">
              <div className="flex items-center gap-1.5 mb-1.5">
                <h2 className="text-xl font-extrabold text-white leading-none font-sans">{profile.displayName}</h2>
                <CheckCircle2 className="w-4 h-4 text-violet-400 fill-violet-400/10 shrink-0" />
              </div>
              <p className="text-xs text-slate-500 font-bold">@{profile.username}</p>
              
              {profile.bio ? (
                <p className="text-slate-300 text-xs leading-relaxed mt-3.5 whitespace-pre-wrap font-sans">{profile.bio}</p>
              ) : (
                <p className="text-slate-600 text-xs italic mt-3.5">No bio written yet.</p>
              )}

              {/* Stats Card Grid */}
              <div className="grid grid-cols-3 gap-3 mt-6 border-t border-white/5 pt-4 text-center select-none">
                <div className="py-2.5 rounded-2xl bg-white/[0.01] border border-white/5">
                  <div className="text-sm font-extrabold text-white">{postsData?.posts.length ?? 0}</div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Posts</div>
                </div>
                <div className="py-2.5 rounded-2xl bg-white/[0.01] border border-white/5">
                  <div className="text-sm font-extrabold text-white">{profile._count?.followers ?? 0}</div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Followers</div>
                </div>
                <div className="py-2.5 rounded-2xl bg-white/[0.01] border border-white/5">
                  <div className="text-sm font-extrabold text-white">{profile._count?.following ?? 0}</div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Following</div>
                </div>
              </div>

              {/* Joined Platform tag */}
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold mt-4">
                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                <span>MEMBER SINCE {new Date(profile.createdAt || '2026-01-01').toLocaleDateString()}</span>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Grid Tabs switcher */}
      <div className="px-4 mb-6">
        <div className="flex border-b border-white/5 gap-6 select-none">
          <button
            onClick={() => setProfileTab('posts')}
            className={`pb-3.5 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer flex items-center gap-1.5 ${
              profileTab === 'posts' ? 'text-violet-400 font-extrabold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Posts</span>
            {profileTab === 'posts' && (
              <motion.div layoutId="profileActiveTabLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400" />
            )}
          </button>
          <button
            onClick={() => setProfileTab('photos')}
            className={`pb-3.5 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer flex items-center gap-1.5 ${
              profileTab === 'photos' ? 'text-violet-400 font-extrabold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Photos</span>
            {profileTab === 'photos' && (
              <motion.div layoutId="profileActiveTabLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400" />
            )}
          </button>
          <button
            onClick={() => setProfileTab('likes')}
            className={`pb-3.5 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer flex items-center gap-1.5 ${
              profileTab === 'likes' ? 'text-violet-400 font-extrabold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Heart className="w-4 h-4" />
            <span>Likes</span>
            {profileTab === 'likes' && (
              <motion.div layoutId="profileActiveTabLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400" />
            )}
          </button>
        </div>
      </div>

      {/* Grid Content rendering */}
      <div className="px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={profileTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
          >
            {profileTab === 'posts' && (
              isPostsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
                </div>
              ) : postsData?.posts.length === 0 ? (
                <div className="text-center py-12 p-8 border border-dashed border-white/10 rounded-[20px] bg-white/[0.01]">
                  <p className="text-slate-500 text-xs font-semibold">No posts cataloged yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {postsData?.posts.map((post) => (
                    <div key={post.id} className="p-5 glass-card rounded-[20px] border border-white/5 relative overflow-hidden">
                      <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-300">{profile.displayName}</span>
                          <span className="text-[10px]">&middot;</span>
                          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans mb-3">{post.content}</p>
                      {post.mediaUrl && (
                        <div className="rounded-xl border border-white/5 overflow-hidden max-h-80 relative group cursor-pointer">
                          <img src={resolveMediaUrl(post.mediaUrl)} alt="Post Attached Media" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {profileTab === 'photos' && (
              photoPosts.length === 0 ? (
                <div className="text-center py-12 p-8 border border-dashed border-white/10 rounded-[20px] bg-white/[0.01]">
                  <p className="text-slate-500 text-xs font-semibold">No visual media uploaded yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                  {photoPosts.map((post) => (
                    <div 
                      key={post.id} 
                      className="aspect-square rounded-2xl overflow-hidden border border-white/5 relative group cursor-pointer shadow-md bg-slate-950/40"
                    >
                      <img 
                        src={resolveMediaUrl(post.mediaUrl)} 
                        alt="Gallery media" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3.5 z-10">
                        <p className="text-white text-xs font-semibold line-clamp-2 leading-relaxed mb-1 font-sans">{post.content}</p>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">{new Date(post.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {profileTab === 'likes' && (
              <div className="text-center py-12 p-8 border border-dashed border-white/10 rounded-[20px] bg-white/[0.01]">
                <p className="text-slate-500 text-xs font-semibold">This user has kept their liked posts private.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  );
}
