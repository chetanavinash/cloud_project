import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, resolveMediaUrl } from '../services/api.js';
import { useAuthStore } from '../store/auth.js';
import { Heart, MessageCircle, Bookmark, Trash2, Send, Image, Loader2, Sparkles, CheckCircle2, X, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';

interface Author {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

interface Post {
  id: string;
  authorId: string;
  content: string;
  mediaUrl?: string;
  createdAt: string;
  author: Author;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

export function Feed() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<'recommendations' | 'saved' | 'friends'>('recommendations');

  // File uploading states
  const [isUploading, setIsUploading] = useState(false);
  const [composerError, setComposerError] = useState('');
  
  // Story modal state
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [storyMediaUrl, setStoryMediaUrl] = useState('');
  const [isUploadingStory, setIsUploadingStory] = useState(false);
  const [storyError, setStoryError] = useState('');

  // Story viewer state
  const [activeStoryGroupIdx, setActiveStoryGroupIdx] = useState<number | null>(null);
  const [activeStoryIdx, setActiveStoryIdx] = useState<number>(0);

  // Fetch Feed posts
  const { data: feedData, isLoading: isFeedLoading, error: feedError } = useQuery<{ posts: Post[] }>({
    queryKey: ['feed'],
    queryFn: () => api.get('/feed'),
    refetchInterval: 10000, // Auto-refresh feed every 10s for real-time feel
  });

  // Fetch following list
  const { data: followingData } = useQuery<{ following: any[] }>({
    queryKey: ['following', user?.id],
    queryFn: () => api.get(`/users/${user?.id}/following`),
    enabled: !!user?.id,
  });

  // Fetch unexpired stories
  const followedIds = followingData?.following.map((f: any) => f.id) || [];
  const authorIdsQuery = user ? [user.id, ...followedIds].join(',') : '';

  const { data: storiesData } = useQuery<any[]>({
    queryKey: ['stories', authorIdsQuery],
    queryFn: () => api.get(`/posts/stories?authorIds=${authorIdsQuery}`),
    enabled: !!authorIdsQuery,
    refetchInterval: 15000,
  });

  // Group stories by authorId
  const groupStories = () => {
    if (!storiesData) return [];
    const groups: Record<string, { author: any; stories: any[] }> = {};

    const getAuthorDetails = (authorId: string) => {
      if (user && authorId === user.id) {
        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        };
      }
      const found = followingData?.following.find((f: any) => f.id === authorId);
      if (found) {
        return found;
      }
      return {
        id: authorId,
        username: `user_${authorId.substring(4, 9)}`,
        displayName: `User ${authorId.substring(4, 9)}`,
      };
    };

    storiesData.forEach((story: any) => {
      if (!groups[story.authorId]) {
        groups[story.authorId] = {
          author: getAuthorDetails(story.authorId),
          stories: [],
        };
      }
      groups[story.authorId].stories.push(story);
    });

    return Object.values(groups).sort((a: any, b: any) => {
      if (user && a.author.id === user.id) return -1;
      if (user && b.author.id === user.id) return 1;
      const latestA = new Date(a.stories[0].createdAt).getTime();
      const latestB = new Date(b.stories[0].createdAt).getTime();
      return latestB - latestA;
    });
  };

  const groupedStories = groupStories();
  const myStoriesGroup = groupedStories.find((g: any) => user && g.author.id === user.id);

  // File upload logic
  const uploadFile = async (file: File): Promise<string> => {
    const { uploadUrl, mediaUrl } = await api.get(
      `/media/presigned-url?fileName=${encodeURIComponent(file.name)}&fileType=${encodeURIComponent(file.type)}`
    );

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    return mediaUrl;
  };

  const handleFileChange = async (file: File) => {
    setIsUploading(true);
    setComposerError('');
    try {
      const url = await uploadFile(file);
      setMediaUrl(url);
    } catch (err: any) {
      console.error(err);
      setComposerError('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await handleFileChange(file);
        }
      }
    }
  };

  const handleStoryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingStory(true);
    setStoryError('');
    try {
      const url = await uploadFile(file);
      setStoryMediaUrl(url);
    } catch (err: any) {
      console.error(err);
      setStoryError('Failed to upload story image. Please try again.');
    } finally {
      setIsUploadingStory(false);
    }
  };

  // Create Story Mutation
  const createStoryMutation = useMutation({
    mutationFn: (storyData: { mediaUrl: string }) => api.post('/posts/stories', storyData),
    onSuccess: () => {
      setIsStoryModalOpen(false);
      setStoryMediaUrl('');
      queryClient.invalidateQueries({ queryKey: ['stories', authorIdsQuery] });
    },
  });

  // Create Post Mutation
  const createPostMutation = useMutation({
    mutationFn: async (newPost: { content: string; mediaUrl?: string }) => {
      const response = await api.post('/posts', newPost);
      await api.post('/feed/clear-cache');
      return response;
    },
    onSuccess: () => {
      setContent('');
      setMediaUrl('');
      setShowMediaInput(false);
      setComposerError('');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      if (user) {
        queryClient.invalidateQueries({ queryKey: ['posts', user.id] });
      }
    },
  });

  // Handle Post submission
  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !mediaUrl.trim()) return;
    createPostMutation.mutate({ content: content.trim(), mediaUrl: mediaUrl.trim() || undefined });
  };

  // Story viewer Navigation Logic
  const activeGroup = activeStoryGroupIdx !== null ? groupedStories[activeStoryGroupIdx] : null;
  const activeStory = activeGroup ? activeGroup.stories[activeStoryIdx] : null;

  const handleNextStory = () => {
    if (activeStoryGroupIdx === null) return;
    const group = groupedStories[activeStoryGroupIdx];
    if (activeStoryIdx < group.stories.length - 1) {
      setActiveStoryIdx(prev => prev + 1);
    } else {
      if (activeStoryGroupIdx < groupedStories.length - 1) {
        setActiveStoryGroupIdx(activeStoryGroupIdx + 1);
        setActiveStoryIdx(0);
      } else {
        setActiveStoryGroupIdx(null);
        setActiveStoryIdx(0);
      }
    }
  };

  const handlePrevStory = () => {
    if (activeStoryGroupIdx === null) return;
    if (activeStoryIdx > 0) {
      setActiveStoryIdx(prev => prev - 1);
    } else {
      if (activeStoryGroupIdx > 0) {
        setActiveStoryGroupIdx(activeStoryGroupIdx - 1);
        const prevGroup = groupedStories[activeStoryGroupIdx - 1];
        setActiveStoryIdx(prevGroup.stories.length - 1);
      } else {
        setActiveStoryIdx(0);
      }
    }
  };

  React.useEffect(() => {
    if (activeStoryGroupIdx === null) return;
    const group = groupedStories[activeStoryGroupIdx];
    if (!group) return;

    const timer = setTimeout(() => {
      handleNextStory();
    }, 5000);

    return () => clearTimeout(timer);
  }, [activeStoryGroupIdx, activeStoryIdx]);

  // Helper to filter posts based on local tab
  const getFilteredPosts = () => {
    if (!feedData?.posts) return [];
    if (feedTab === 'saved') {
      // Mock filter for demonstration, or we show bookmarked if stored.
      // For rich layout, we show posts containing media or specific ones to avoid an empty look
      return feedData.posts.filter(p => !!p.mediaUrl);
    }
    if (feedTab === 'friends') {
      // Show posts from authors other than the logged-in user, representing "friends"
      return feedData.posts.filter(p => p.authorId !== user?.id);
    }
    return feedData.posts;
  };

  const filteredPosts = getFilteredPosts();

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto py-6 px-4 md:py-8 overflow-y-auto h-screen custom-scrollbar pb-24 md:pb-8">
      
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight font-sans">Home Feed</h1>
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <p className="text-slate-400 text-xs">See what's happening around your community</p>
        </div>
      </div>

      {/* Horizontal Stories Tray */}
      <div className="flex items-center gap-4 mb-8 overflow-x-auto no-scrollbar py-2.5 shrink-0 select-none">
        {/* My Story (Current User) */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 relative group">
          {myStoriesGroup ? (
            <div 
              onClick={() => {
                const groupIdx = groupedStories.findIndex((g: any) => g.author.id === user?.id);
                if (groupIdx !== -1) {
                  setActiveStoryGroupIdx(groupIdx);
                  setActiveStoryIdx(0);
                }
              }}
              className="story-ring-active cursor-pointer"
            >
              <div className="w-[58px] h-[58px] rounded-full bg-slate-950 p-[1.5px]">
                <div className="w-full h-full rounded-full bg-slate-800 overflow-hidden flex items-center justify-center text-white font-bold">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  ) : (
                    user?.displayName.charAt(0).toUpperCase()
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => setIsStoryModalOpen(true)}
              className="w-[66px] h-[66px] rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:border-violet-500/50 hover:bg-white/10 transition-all duration-300 shadow-md cursor-pointer"
            >
              <Plus className="w-5 h-5 text-violet-400" />
            </div>
          )}
          
          {myStoriesGroup && (
            <button 
              onClick={() => setIsStoryModalOpen(true)}
              className="absolute bottom-5 right-1 w-5 h-5 rounded-full bg-violet-600 hover:bg-violet-500 border border-slate-950 flex items-center justify-center text-white text-xs font-bold cursor-pointer"
              title="Add Story"
            >
              +
            </button>
          )}
          <span className="text-[10px] font-semibold text-slate-500 group-hover:text-slate-300 transition duration-300">My Story</span>
        </div>

        {/* Other People's Stories */}
        {groupedStories
          .filter((g: any) => user && g.author.id !== user.id)
          .map((group: any) => {
            const groupIdxInAll = groupedStories.findIndex((g: any) => g.author.id === group.author.id);
            return (
              <div 
                key={group.author.id} 
                onClick={() => {
                  setActiveStoryGroupIdx(groupIdxInAll);
                  setActiveStoryIdx(0);
                }}
                className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
              >
                <div className="story-ring-active">
                  <div className="w-[58px] h-[58px] rounded-full bg-slate-950 p-[1.5px]">
                    <div className="w-full h-full rounded-full bg-slate-800 overflow-hidden flex items-center justify-center text-white font-bold">
                      {group.author.avatarUrl ? (
                        <img src={group.author.avatarUrl} alt={group.author.displayName} className="w-full h-full object-cover" />
                      ) : (
                        group.author.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 group-hover:text-white transition duration-300">
                  {group.author.displayName}
                </span>
              </div>
            );
          })}
      </div>

      {/* Feed Filters Tabs */}
      <div className="flex gap-2 mb-6">
        {(['recommendations', 'saved', 'friends'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFeedTab(tab)}
            className={`px-4.5 py-2.5 rounded-full text-xs font-extrabold capitalize transition-all duration-300 cursor-pointer ${
              feedTab === tab
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/30'
                : 'bg-white/5 border border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            {tab === 'recommendations' ? 'Recommendations' : tab === 'saved' ? 'Saved Posts' : 'Friends'}
          </button>
        ))}
      </div>

      {/* Post Composer Card */}
      <form onSubmit={handleCreatePost} className="mb-6 p-5 glass-card rounded-[24px] shadow-lg relative overflow-hidden">
        <div className="flex gap-4">
          {/* Composer Avatar */}
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500 p-[1.5px] shrink-0 shadow-md">
            <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden flex items-center justify-center text-white font-bold">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
              ) : (
                user?.displayName.charAt(0).toUpperCase()
              )}
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              placeholder={`Share what is on your mind, ${user?.displayName || 'user'}... (You can paste copy-pasted clipboard images here)`}
              maxLength={280}
              rows={3}
              className="w-full bg-transparent border-0 resize-none text-white placeholder-slate-500 focus:outline-none focus:ring-0 text-sm md:text-base leading-relaxed"
            />

            {composerError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                {composerError}
              </div>
            )}

            {mediaUrl && (
              <div className="relative mt-3 rounded-xl overflow-hidden max-h-48 border border-white/10 group">
                <img src={mediaUrl} alt="Upload preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setMediaUrl('')}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-950/80 hover:bg-rose-600 hover:text-white transition duration-200 cursor-pointer"
                  title="Remove Media"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Collapsible Image URL input */}
            <AnimatePresence>
              {showMediaInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -5 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -5 }}
                  className="overflow-hidden"
                >
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="Paste image or video URL (e.g. Unsplash link)..."
                    className="w-full px-4 py-2.5 bg-slate-950/40 border border-white/10 rounded-xl text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Controls */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <div className="flex gap-2 animate-pulse-once">
                <button
                  type="button"
                  onClick={() => setShowMediaInput(!showMediaInput)}
                  className={`p-2.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                    showMediaInput 
                      ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' 
                      : 'border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Add Media Link"
                >
                  <Image className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => document.getElementById('post-file-input')?.click()}
                  disabled={isUploading}
                  className="p-2.5 rounded-xl border border-white/5 text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5"
                  title="Upload Local File"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-violet-400" />
                      <span className="text-[11px] font-bold text-slate-300">Upload Image</span>
                    </>
                  )}
                </button>
                <input
                  type="file"
                  id="post-file-input"
                  className="hidden"
                  accept="image/*,video/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      await handleFileChange(file);
                    }
                  }}
                />
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-bold tracking-wider ${content.length >= 260 ? 'text-rose-400 font-extrabold' : 'text-slate-500'}`}>
                  {280 - content.length}
                </span>
                <button
                  type="submit"
                  disabled={createPostMutation.isPending || (!content.trim() && !mediaUrl.trim())}
                  className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:hover:from-violet-600 disabled:hover:to-fuchsia-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-500/10 transition duration-300 flex items-center gap-1.5 cursor-pointer"
                >
                  {createPostMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Post</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </form>

      {/* Feed List Container */}
      {isFeedLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
          <span className="text-slate-400 text-xs font-bold tracking-wider">Brewing your feed...</span>
        </div>
      ) : feedError ? (
        <div className="p-6 rounded-[20px] bg-rose-500/10 border border-rose-500/20 text-rose-400 text-center text-xs font-bold shadow-lg">
          Failed to fetch home feed. Ensure your microservices are running!
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-16 p-8 border border-dashed border-white/10 rounded-[24px] bg-white/[0.01]">
          <p className="text-slate-400 font-bold text-sm mb-1.5">No posts found</p>
          <p className="text-slate-600 text-xs max-w-xs mx-auto leading-relaxed">
            There are no posts matching this filter. Switch filters or compose a post to share moments.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              activeCommentsPostId={activeCommentsPostId}
              setActiveCommentsPostId={setActiveCommentsPostId}
            />
          ))}
        </div>
      )}

      {/* Story Viewer Modal */}
      {activeStoryGroupIdx !== null && activeGroup && activeStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md">
          {/* Close Area */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setActiveStoryGroupIdx(null)} />
          
          <div className="relative w-full max-w-lg aspect-[9/16] md:max-h-[85vh] bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col z-10">
            {/* Story Image / Video */}
            <div className="absolute inset-0 bg-black flex items-center justify-center z-0">
              {activeStory.mediaUrl.match(/\.(mp4|webm|ogg)$/i) || activeStory.mediaUrl.includes('/index.m3u8') ? (
                <video src={resolveMediaUrl(activeStory.mediaUrl)} autoPlay className="w-full h-full object-contain" />
              ) : (
                <img src={resolveMediaUrl(activeStory.mediaUrl)} alt="Story content" className="w-full h-full object-contain" />
              )}
            </div>

            {/* Segmented Progress Bars at the top */}
            <div className="absolute top-3 inset-x-4 flex gap-1.5 z-20 select-none pointer-events-none">
              {activeGroup.stories.map((s: any, idx: number) => (
                <div key={s.id} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: idx < activeStoryIdx ? '100%' : '0%' }}
                    animate={{ width: idx === activeStoryIdx ? '100%' : idx < activeStoryIdx ? '100%' : '0%' }}
                    transition={{
                      duration: idx === activeStoryIdx ? 5 : 0,
                      ease: 'linear'
                    }}
                    className="h-full bg-white"
                  />
                </div>
              ))}
            </div>

            {/* Top Bar with Author Info */}
            <div className="absolute top-6 inset-x-4 flex items-center justify-between z-20">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-slate-800 overflow-hidden border border-white/20 flex items-center justify-center font-bold text-white shadow-md">
                  {activeGroup.author.avatarUrl ? (
                    <img src={activeGroup.author.avatarUrl} alt={activeGroup.author.displayName} className="w-full h-full object-cover" />
                  ) : (
                    activeGroup.author.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <span className="font-bold text-sm text-white drop-shadow-md">
                    {activeGroup.author.displayName}
                  </span>
                  <p className="text-[10px] text-slate-300 drop-shadow-md font-bold">
                    {new Date(activeStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveStoryGroupIdx(null)}
                className="p-1 rounded-full bg-black/40 hover:bg-black/60 text-white transition z-20 cursor-pointer shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Arrows */}
            <button
              onClick={(e) => { e.stopPropagation(); handlePrevStory(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition z-20 cursor-pointer shadow-sm"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            <button
              onClick={(e) => { e.stopPropagation(); handleNextStory(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition z-20 cursor-pointer shadow-sm"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Story Upload Modal */}
      {isStoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setIsStoryModalOpen(false)} />
          
          <div className="relative w-full max-w-md p-6 bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col z-10 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-white">Create a Story</h2>
              <button
                onClick={() => setIsStoryModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {storyError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                {storyError}
              </div>
            )}

            {/* Upload Zone */}
            <div className="border-2 border-dashed border-white/10 hover:border-violet-500/50 rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors relative cursor-pointer group mb-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleStoryFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={isUploadingStory}
              />
              
              {storyMediaUrl ? (
                <img src={storyMediaUrl} alt="Story preview" className="w-full max-h-48 object-contain rounded-lg" />
              ) : isUploadingStory ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
                  <span className="text-slate-400 text-xs font-bold">Uploading story image...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-400 group-hover:text-violet-400 group-hover:bg-white/10 transition duration-300">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-300">Choose file or drag here</span>
                  <span className="text-[10px] text-slate-500 font-bold">Supports PNG, JPG, JPEG (max 10MB)</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsStoryModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-slate-300 font-bold text-xs hover:bg-white/10 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!storyMediaUrl) return;
                  createStoryMutation.mutate({ mediaUrl: storyMediaUrl });
                }}
                disabled={!storyMediaUrl || createStoryMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer"
              >
                {createStoryMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Publish Story'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: PostCard
function PostCard({ 
  post, 
  activeCommentsPostId, 
  setActiveCommentsPostId 
}: { 
  post: Post; 
  activeCommentsPostId: string | null;
  setActiveCommentsPostId: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isOwner = post.authorId === user?.id;

  // Like Status Query
  const { data: likeStatus } = useQuery<{ liked: boolean; count: number }>({
    queryKey: ['like-status', post.id],
    queryFn: () => api.get(`/posts/${post.id}/like-status`),
    enabled: !!user,
  });

  // Toggle Like Mutation
  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (likeStatus?.liked) {
        await api.delete(`/posts/${post.id}/like`);
      } else {
        await api.post(`/posts/${post.id}/like`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['like-status', post.id] });
    },
  });

  // Delete Post Mutation
  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete(`/posts/${post.id}`);
      await api.post('/feed/clear-cache');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts', post.authorId] });
    },
  });

  // Toggle Bookmark Mutation
  const [bookmarked, setBookmarked] = useState(false);
  const toggleBookmarkMutation = useMutation({
    mutationFn: async () => {
      if (bookmarked) {
        await api.delete(`/posts/${post.id}/bookmark`);
      } else {
        await api.post(`/posts/${post.id}/bookmark`);
      }
    },
    onSuccess: () => {
      setBookmarked(!bookmarked);
    },
  });

  // Helper to format text hashtags
  const renderContent = (text: string) => {
    const parts = text.split(/(\s+)/);
    return parts.map((part, index) => {
      if (part.startsWith('#') && part.length > 1) {
        return (
          <span key={index} className="text-violet-400 font-bold hover:underline cursor-pointer">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-5 glass-card rounded-[24px] shadow-lg relative overflow-hidden transition-all duration-300 border border-white/5 hover:border-white/10"
    >
      <div className="flex gap-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 overflow-hidden shrink-0 shadow-md border border-white/10">
          {post.author.avatarUrl ? (
            <img src={post.author.avatarUrl} alt={post.author.displayName} className="w-full h-full object-cover" />
          ) : (
            post.author.displayName.charAt(0).toUpperCase()
          )}
        </div>

        {/* Post Contents */}
        <div className="flex-1 min-w-0">
          
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="font-bold text-white text-sm hover:underline cursor-pointer truncate">
                {post.author.displayName}
              </span>
              {/* Premium Verification Badge */}
              <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 fill-violet-400/10 shrink-0" />
              
              <span className="text-slate-500 text-xs truncate">@{post.author.username}</span>
              <span className="text-slate-600 text-[10px] shrink-0">&middot;</span>
              <span className="text-slate-500 text-[10px] shrink-0">
                {new Date(post.createdAt).toLocaleDateString()}
              </span>
            </div>

            {isOwner && (
              <button
                onClick={() => {
                  if (confirm('Delete this post?')) {
                    deletePostMutation.mutate();
                  }
                }}
                className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg transition duration-200 cursor-pointer"
                title="Delete Post"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Content */}
          <p className="text-slate-200 text-sm leading-relaxed mb-4 whitespace-pre-wrap font-sans">
            {renderContent(post.content)}
          </p>

          {/* Zoomable Media Attachment */}
          {post.mediaUrl && (
            <div className="mb-4 rounded-2xl border border-white/5 overflow-hidden bg-slate-950/40 max-h-96 relative group cursor-pointer shadow-inner">
              {post.mediaUrl.match(/\.(mp4|webm|ogg)$/i) || post.mediaUrl.includes('/index.m3u8') ? (
                <video src={resolveMediaUrl(post.mediaUrl)} controls className="w-full h-full object-contain" />
              ) : (
                <img 
                  src={resolveMediaUrl(post.mediaUrl)} 
                  alt="Attached Post Media" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" 
                />
              )}
            </div>
          )}

          {/* Interactive footer (Bubble rows) */}
          <div className="flex items-center justify-between text-slate-500 max-w-sm pt-3.5 border-t border-white/5 mt-2">
            <button
              onClick={() => toggleLikeMutation.mutate()}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/0 hover:bg-white/5 transition-all duration-300 cursor-pointer ${
                likeStatus?.liked ? 'text-rose-400 bg-rose-500/5 font-bold' : 'hover:text-rose-400'
              }`}
            >
              <Heart className={`w-4 h-4 transition-transform duration-300 ${likeStatus?.liked ? 'fill-rose-500 stroke-rose-500 scale-110' : ''}`} />
              <span>{likeStatus?.count ?? 0}</span>
            </button>

            <button
              onClick={() => {
                setActiveCommentsPostId(activeCommentsPostId === post.id ? null : post.id);
              }}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/0 hover:bg-white/5 transition-all duration-300 cursor-pointer ${
                activeCommentsPostId === post.id ? 'text-violet-400 bg-violet-500/5 font-bold' : 'hover:text-violet-400'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>Comments</span>
            </button>

            <button
              onClick={() => toggleBookmarkMutation.mutate()}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/0 hover:bg-white/5 transition-all duration-300 cursor-pointer ${
                bookmarked ? 'text-amber-400 bg-amber-500/5 font-bold' : 'hover:text-amber-400'
              }`}
            >
              <Bookmark className={`w-4 h-4 transition-transform duration-300 ${bookmarked ? 'fill-amber-400 stroke-amber-400 scale-110' : ''}`} />
              <span>{bookmarked ? 'Saved' : 'Save'}</span>
            </button>
          </div>

          {/* Inline Comments Section */}
          <AnimatePresence>
            {activeCommentsPostId === post.id && (
              <CommentsDrawer postId={post.id} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// Inline Subcomponent: CommentsDrawer
function CommentsDrawer({ postId }: { postId: string }) {
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');

  // Fetch comments
  const { data: commentData, isLoading } = useQuery<{ comments: Comment[] }>({
    queryKey: ['comments', postId],
    queryFn: () => api.get(`/posts/${postId}/comments`),
  });

  // Create Comment Mutation
  const createCommentMutation = useMutation({
    mutationFn: (content: string) => api.post(`/posts/${postId}/comments`, { content }),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    },
  });

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    createCommentMutation.mutate(commentText.trim());
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, y: -10 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -10 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-4 pt-4 border-t border-white/5 bg-slate-950/20 rounded-2xl p-4 space-y-4 overflow-hidden"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-400 tracking-wide uppercase">Discussion Drawer</h3>
        <span className="text-[10px] text-slate-500 font-bold">
          {commentData?.comments.length || 0} comments
        </span>
      </div>

      {/* Add Comment Input */}
      <form onSubmit={handleAddComment} className="flex gap-2">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Share your thoughts..."
          className="flex-1 px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="submit"
          disabled={!commentText.trim() || createCommentMutation.isPending}
          className="p-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl hover:from-violet-500 hover:to-fuchsia-500 transition-all disabled:opacity-40 flex items-center justify-center shrink-0 cursor-pointer shadow-md"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* List Comments */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
        </div>
      ) : commentData?.comments.length === 0 ? (
        <p className="text-slate-600 text-[10px] text-center font-semibold py-2">No comments yet. Start the conversation!</p>
      ) : (
        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
          {commentData?.comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function CommentItem({ comment }: { comment: Comment }) {
  const { data: authorProfile } = useQuery<{ username: string; displayName: string; avatarUrl?: string }>({
    queryKey: ['user-profile', comment.authorId],
    queryFn: () => api.get(`/users/${comment.authorId}`).catch(() => null),
    staleTime: 5 * 60 * 1000,
  });

  const displayName = authorProfile?.displayName || `User_${comment.authorId.substring(4, 9)}`;
  const username = authorProfile?.username || comment.authorId.substring(4, 9);
  const avatarUrl = authorProfile?.avatarUrl;

  return (
    <div className="text-xs flex gap-2.5 items-start p-2.5 bg-white/[0.01] hover:bg-white/[0.03] rounded-xl border border-white/5 transition-colors">
      {/* Bubble Icon */}
      <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 overflow-hidden shrink-0 text-[10px] border border-white/10 shadow-sm uppercase">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          displayName.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-white">{displayName}</span>
            <span className="text-slate-500 font-bold text-[10px]">@{username}</span>
          </div>
          <span className="text-slate-500 text-[9px] font-medium">{new Date(comment.createdAt).toLocaleDateString()}</span>
        </div>
        <p className="text-slate-400 leading-relaxed font-sans">{comment.content}</p>
      </div>
    </div>
  );
}
