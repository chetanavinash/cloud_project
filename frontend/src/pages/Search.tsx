import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/auth.js';
import { Search as SearchIcon, Hash, Loader2, ArrowRight, Flame, Sparkles, Tv, CheckCircle2, UserPlus, UserCheck } from 'lucide-react';
import { motion } from 'framer-motion';

interface SearchProps {
  onSelectUser: (userId: string) => void;
}

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
}

interface SearchPost {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
}

interface SearchHashtag {
  tag: string;
  postCount: number;
}

type SearchTab = 'users' | 'posts' | 'hashtags';

export function Search({ onSelectUser }: SearchProps) {
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('users');
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(query.trim());
  };

  // Logged-in user's following list query
  const { data: followingData } = useQuery<{ following: SearchUser[] }>({
    queryKey: ['following', user?.id],
    queryFn: () => api.get(`/users/${user?.id}/following`),
    enabled: !!user?.id,
  });

  // Follow/Unfollow mutations
  const followMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post(`/users/${userId}/follow`);
      await api.post('/feed/clear-cache');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['following', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.delete(`/users/${userId}/follow`);
      await api.post('/feed/clear-cache');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['following', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  // Queries
  const { data: usersResults, isLoading: isUsersLoading } = useQuery<SearchUser[]>({
    queryKey: ['search-users', searchTerm],
    queryFn: () => api.get(`/search/users?q=${encodeURIComponent(searchTerm)}`),
    enabled: activeTab === 'users' && !!searchTerm,
  });

  const { data: postsResults, isLoading: isPostsLoading } = useQuery<SearchPost[]>({
    queryKey: ['search-posts', searchTerm],
    queryFn: () => api.get(`/search/posts?q=${encodeURIComponent(searchTerm)}`),
    enabled: activeTab === 'posts' && !!searchTerm,
  });

  const { data: hashtagsResults, isLoading: isHashtagsLoading } = useQuery<SearchHashtag[]>({
    queryKey: ['search-hashtags', searchTerm],
    queryFn: () => api.get(`/search/hashtags?q=${encodeURIComponent(searchTerm)}`),
    enabled: activeTab === 'hashtags' && !!searchTerm,
  });

  const isLoading = isUsersLoading || isPostsLoading || isHashtagsLoading;

  // Mock trending categories to fill empty screen states
  const trendingCategories = [
    { title: 'Cloud Architecture V2', posts: '1.2k posts', icon: Flame, gradient: 'from-orange-500 to-rose-500' },
    { title: 'Serverless social apps', posts: '942 posts', icon: Sparkles, gradient: 'from-violet-500 to-indigo-500' },
    { title: 'TypeScript best practices', posts: '503 posts', icon: Tv, gradient: 'from-blue-500 to-cyan-500' },
  ];

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto py-6 px-4 md:py-8 overflow-y-auto h-screen custom-scrollbar pb-24 md:pb-8">
      
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white tracking-tight font-sans">Search Discovery</h1>
        <p className="text-slate-400 text-xs">Lookup active users, posts, or trending topics</p>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="mb-6">
        <div className="relative flex items-center">
          <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 pointer-events-none">
            <SearchIcon className="w-5 h-5 text-slate-500" />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keywords, handles, topics..."
            className="w-full pl-11 pr-24 py-3 bg-white/[0.02] border border-white/10 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 transition duration-200 text-sm font-medium"
          />
          <button
            type="submit"
            className="absolute right-2 px-4.5 py-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-bold rounded-xl transition duration-300 cursor-pointer shadow-md shadow-violet-500/10"
          >
            Search
          </button>
        </div>
      </form>

      {/* Tabs */}
      <div className="flex border-b border-white/5 mb-6 relative select-none">
        {(['users', 'posts', 'hashtags'] as SearchTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-xs font-bold uppercase tracking-wider relative transition-all duration-300 capitalize cursor-pointer ${
              activeTab === tab
                ? 'text-violet-400 font-extrabold'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div 
                layoutId="searchActiveTabLine" 
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400" 
              />
            )}
          </button>
        ))}
      </div>

      {/* Results panel */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
        </div>
      ) : !searchTerm ? (
        /* Empty State: Trending Category grids */
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-bold text-slate-400 tracking-wide uppercase mb-3 px-1 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-400" />
              <span>Trending Spaces</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trendingCategories.map((cat, i) => {
                const Icon = cat.icon;
                return (
                  <div 
                    key={i} 
                    className="p-5 glass-card rounded-[22px] border border-white/5 relative overflow-hidden group cursor-pointer transition-all duration-300 hover:border-violet-500/30 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-white leading-snug block font-sans">
                          {cat.title}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                          {cat.posts}
                        </span>
                      </div>
                      <div className={`p-2.5 rounded-xl bg-gradient-to-tr ${cat.gradient} text-white shadow-md`}>
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-400 tracking-wide uppercase mb-3 px-1">Trending Topics</h3>
            <div className="space-y-2.5">
              {['aws_cloud', 'antigravity_dev', 'typescript_v5', 'microservices'].map((tag, i) => (
                <div 
                  key={i} 
                  onClick={() => {
                    setQuery(`#${tag}`);
                    setSearchTerm(`#${tag}`);
                    setActiveTab('hashtags');
                  }}
                  className="p-4 rounded-[20px] bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 flex items-center justify-between cursor-pointer transition duration-300 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5 text-slate-500 group-hover:text-violet-400 group-hover:bg-slate-950 transition duration-300">
                      <Hash className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-300 group-hover:text-white transition font-sans">#{tag}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-700 group-hover:text-violet-400 group-hover:translate-x-1 transition-all" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* USERS RESULTS */}
          {activeTab === 'users' && (
            usersResults?.length === 0 ? (
              <div className="text-center py-12 p-8 border border-dashed border-white/10 rounded-[24px] bg-white/[0.01] text-slate-500 text-xs font-semibold">
                No users matched "{searchTerm}"
              </div>
            ) : (
              usersResults?.map((usr) => {
                const isFollowing = followingData?.following.some(f => f.id === usr.id);
                return (
                  <div
                    key={usr.id}
                    onClick={() => onSelectUser(usr.id)}
                    className="p-4.5 glass-card rounded-[22px] border border-white/5 hover:border-white/15 transition-all duration-300 flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 mr-3">
                      {/* Ring avatar wrapper */}
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 overflow-hidden border border-white/10 shadow-sm shrink-0">
                        {usr.avatarUrl ? (
                          <img src={usr.avatarUrl} alt={usr.displayName} className="w-full h-full object-cover" />
                        ) : (
                          usr.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-extrabold text-white group-hover:text-violet-400 transition truncate font-sans">
                            {usr.displayName}
                          </p>
                          <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 fill-violet-400/10 shrink-0" />
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold">@{usr.username}</p>
                        {usr.bio && <p className="text-[11px] text-slate-400 truncate mt-1 leading-normal font-sans">{usr.bio}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {usr.id !== user?.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isFollowing) {
                              unfollowMutation.mutate(usr.id);
                            } else {
                              followMutation.mutate(usr.id);
                            }
                          }}
                          disabled={followMutation.isPending || unfollowMutation.isPending}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer select-none z-10 ${
                            isFollowing
                              ? 'bg-white/5 border border-white/5 text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20'
                              : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md'
                          }`}
                        >
                          {isFollowing ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Follow</span>
                            </>
                          )}
                        </button>
                      )}
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-violet-400 group-hover:translate-x-1 transition-all shrink-0" />
                    </div>
                  </div>
                );
              })
            )
          )}

          {/* POSTS RESULTS */}
          {activeTab === 'posts' && (
            postsResults?.length === 0 ? (
              <div className="text-center py-12 p-8 border border-dashed border-white/10 rounded-[24px] bg-white/[0.01] text-slate-500 text-xs font-semibold">
                No posts matched "{searchTerm}"
              </div>
            ) : (
              postsResults?.map((pst) => (
                <div key={pst.id} className="p-5 glass-card rounded-[22px] border border-white/5">
                  <div className="flex items-center justify-between gap-2 mb-2.5 text-xs text-slate-500">
                    <span className="font-bold text-slate-400">User_{pst.authorId.substring(4, 9)}</span>
                    <span className="text-[10px] text-slate-500 font-medium">{new Date(pst.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">{pst.content}</p>
                </div>
              ))
            )
          )}

          {/* HASHTAGS RESULTS */}
          {activeTab === 'hashtags' && (
            hashtagsResults?.length === 0 ? (
              <div className="text-center py-12 p-8 border border-dashed border-white/10 rounded-[24px] bg-white/[0.01] text-slate-500 text-xs font-semibold">
                No hashtags matched "{searchTerm}"
              </div>
            ) : (
              hashtagsResults?.map((hash) => (
                <div
                  key={hash.tag}
                  className="p-4.5 glass-card rounded-[22px] border border-white/5 flex items-center justify-between transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-400">
                      <Hash className="w-4 h-4 text-violet-400" />
                    </div>
                    <span className="font-bold text-white font-sans">#{hash.tag}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-500 bg-white/5 border border-white/5 px-3 py-1 rounded-lg">
                    {hash.postCount} posts
                  </span>
                </div>
              ))
            )
          )}

        </div>
      )}
    </div>
  );
}
