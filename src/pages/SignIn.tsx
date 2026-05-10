import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { supabase } from '../supabaseClient';
import { Mail, Lock, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isResetView, setIsResetView] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent multiple clicks
    setLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        toast.error(error.message);
      } else {
        toast.success('Successfully signed in!');
        navigate(ROUTES.home.path, { replace: true });
      }
    } catch (err: any) {
      console.error(err);
      const isNetworkError = err.message === 'Failed to fetch' || err.message.includes('timed out');
      const msg = isNetworkError 
        ? 'Failed to connect to the database. Please check your network connection or verify that your Supabase project is active.' 
        : err.message || 'An error occurred';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email) {
      setErrorMsg('Please enter your email address');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });

      if (error) {
        setErrorMsg(error.message);
        toast.error(error.message);
      } else {
        toast.success('Password reset email sent! Please check your inbox.');
        setIsResetView(false);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'An error occurred';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const navigateToSignUp = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(ROUTES.signup.path);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-blue-600">
          <img 
            src="https://res.cloudinary.com/dfkfysygf/image/upload/v1778354944/20260510_005330_xrv4xj.jpg" 
            alt="Hostelrr Logo" 
            className="w-16 h-16 rounded-2xl object-cover shadow-sm"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          {isResetView ? 'Reset your password' : 'Sign in to your account'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <a href="/signup" onClick={navigateToSignUp} className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
            create a new account
          </a>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-gray-200/50 sm:rounded-2xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={isResetView ? handleResetPassword : handleSignIn}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 sm:text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  placeholder="admin@hostelrr.com"
                />
              </div>
            </div>

            {!isResetView && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-2 relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 sm:text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetView(true);
                      setErrorMsg('');
                    }}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="text-red-500 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-100">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isResetView ? 'Sending...' : 'Signing in...'}
                </>
              ) : (
                <>
                  {isResetView ? 'Send Reset Link' : 'Sign in'}
                  {!isResetView && <ArrowRight className="w-4 h-4" />}
                </>
              )}
            </button>

            {isResetView && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetView(false);
                    setErrorMsg('');
                  }}
                  className="flex items-center justify-center gap-1 w-full text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Sign In
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
