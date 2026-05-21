import React, { useState } from 'react';
import { useAuthStore } from '../store/auth.js';
import { api } from '../services/api.js';

export function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const loginStore = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setError('Username is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (isSignUp) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }
    
    setError('');
    setIsLoading(true);
    
    try {
      const sanitizedUser = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
      if (isSignUp) {
        if (!displayName) {
          setError('Display Name is required');
          setIsLoading(false);
          return;
        }
        
        const mockId = `usr_${sanitizedUser}`;
        const mockEmail = email || `${sanitizedUser}@example.com`;
        
        await api.post('/register', {
          username: sanitizedUser,
          displayName,
          password,
        }, {
          headers: {
            'x-mock-user-id': mockId,
            'x-mock-username': sanitizedUser,
            'x-mock-email': mockEmail,
            'Authorization': 'Bearer mock.jwt.token'
          }
        });
        
        loginStore(sanitizedUser, displayName, mockEmail);
      } else {
        let fetchedUser;
        try {
          fetchedUser = await api.post('/login', {
            username: sanitizedUser,
            password,
          });
        } catch (fetchErr: any) {
          const errMsg = fetchErr.message || '';
          if (errMsg.includes('does not exist') || errMsg.includes('status 404')) {
            setError('Account does not exist. Please sign up first.');
          } else if (errMsg.includes('Incorrect password') || errMsg.includes('status 401')) {
            setError('Incorrect password. Please try again.');
          } else {
            setError(`Authentication failed. Error: ${errMsg}`);
          }
          setIsLoading(false);
          return;
        }

        if (!fetchedUser) {
          setError('Account does not exist. Please sign up first.');
          setIsLoading(false);
          return;
        }

        loginStore(
          sanitizedUser,
          fetchedUser.displayName || username,
          fetchedUser.email || `${sanitizedUser}@example.com`
        );
        useAuthStore.getState().updateUser({
          avatarUrl: fetchedUser.avatarUrl || undefined,
          bio: fetchedUser.bio || undefined,
          followerCount: fetchedUser.followerCount,
          followingCount: fetchedUser.followingCount,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMockLogin = async (mockUser: string, mockDisplay: string, mockEmail: string) => {
    setError('');
    setIsLoading(true);
    try {
      loginStore(mockUser, mockDisplay, mockEmail);
      try {
        await api.post('/register', {
          username: mockUser,
          displayName: mockDisplay,
          password: 'mockpassword123',
        });
      } catch (regErr) {
        console.log('Registration bypass:', regErr);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 md:p-8 font-sans selection:bg-violet-500 selection:text-white relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[130px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-fuchsia-600/10 blur-[130px]" />
      </div>

      {/* Main Glass Panel Card */}
      <div className="relative w-full max-w-5xl bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-[32px] overflow-hidden shadow-2xl flex flex-col md:flex-row z-10">
        
        {/* Left pane: Graphics/Slogan (visible on desktop) */}
        <div className="hidden md:flex md:w-1/2 relative flex-col justify-between p-12 overflow-hidden border-r border-white/5 bg-slate-950/40">
          <div className="absolute inset-0 z-0">
            <img 
              src="/auth_illustration.png" 
              alt="Welcome Illustration" 
              className="w-full h-full object-cover opacity-90 transition-transform duration-[10s] hover:scale-105"
            />
            {/* Dark/gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-tr from-violet-600/10 via-transparent to-fuchsia-500/10" />
          </div>

          {/* Logo overlay */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/30">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
              Antigravity
            </span>
          </div>

          {/* Slogan */}
          <div className="relative z-10 space-y-4 max-w-sm">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 border border-white/10 text-indigo-200">
              Introducing V2.0
            </span>
            <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
              Everything You Need, <br />in one App.
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Share and discover moments with your community using next-generation cloud-native services.
            </p>
          </div>
        </div>

        {/* Right pane: Auth Form */}
        <div className="w-full md:w-1/2 flex flex-col justify-center p-8 md:p-12 relative bg-slate-900/40">
          <div className="w-full max-w-sm mx-auto space-y-6">
            
            {/* Header */}
            <div className="space-y-2">
              {/* Logo for mobile view */}
              <div className="flex md:hidden items-center gap-2.5 mb-4">
                <div className="p-2 rounded-lg bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="font-extrabold text-lg tracking-tight text-white">Antigravity</span>
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                {isSignUp ? 'Create new account' : 'Welcome back'}
              </h1>
              <p className="text-slate-400 text-sm">
                {isSignUp ? 'Sign up to explore the premium web experience' : 'Sign in to access your dashboard'}
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider">Username</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 text-sm font-semibold">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alex_mercer"
                    className="w-full pl-8 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 transition duration-200 text-sm"
                    required
                  />
                </div>
              </div>

              {!isSignUp && (
                <div className="space-y-1.5">
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 transition duration-200 text-sm"
                    required
                  />
                </div>
              )}

              {isSignUp && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Alex Mercer"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 transition duration-200 text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@gmail.com"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 transition duration-200 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="•••••••• (min 6 characters)"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 transition duration-200 text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 transition duration-200 text-sm"
                      required
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-xl transition duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/10 text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : isSignUp ? (
                  'Create account'
                ) : (
                  'Continue'
                )}
              </button>
            </form>

            {/* Third-party Sign In Divider */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-white/5"></div>
              <span className="flex-shrink mx-4 text-slate-500 text-[10px] font-bold uppercase tracking-wider">or continue with</span>
              <div className="flex-grow border-t border-white/5"></div>
            </div>

            {/* Google & Apple sign in grid */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleMockLogin('iza_amanda', 'Iza Amanda', 'izaa@gmail.com')}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                <svg className="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.3.6 4.5 1.7l2.4-2.4C17.3 1.5 14.9 1 12.24 1 6.58 1 2 5.58 2 11.24s4.58 10.24 10.24 10.24c5.78 0 10.24-4.11 10.24-10.24 0-.685-.06-1.343-.18-1.956H12.24z"/>
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => handleMockLogin('luiz_irma', 'Luiz Irma', 'luiz@gmail.com')}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.2.67-2.92 1.5-.63.73-1.18 1.87-1.03 2.97 1.1.09 2.22-.55 2.96-1.41z"/>
                </svg>
                Apple
              </button>
            </div>

            {/* Toggle Sign Up / Login */}
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="text-violet-400 hover:text-violet-300 text-xs font-bold transition cursor-pointer"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
