import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { CheckCircle2, ChevronLeft, Image as ImageIcon, Phone } from 'lucide-react';
import { fetchPublicHostelForJoin, submitJoinRequestWithPhoto } from '../lib/supabaseAPI';
import { toast } from 'sonner';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

let turnstileScriptPromise: Promise<void> | undefined;
function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileScriptPromise) turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-hostelrr-turnstile]');
    const script = existing || document.createElement('script');
    const onLoad = () => window.turnstile ? resolve() : reject(new Error('Photo verification failed to load.'));
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', () => reject(new Error('Photo verification failed to load.')), { once: true });
    if (!existing) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.hostelrrTurnstile = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => { turnstileScriptPromise = undefined; throw error; });
  return turnstileScriptPromise;
}

export default function JoinForm() {
  const MAX_JOIN_PHOTO_SIZE = 1024 * 1024;
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileError, setTurnstileError] = useState('');
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileSiteKey = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || '';
  const [hostel, setHostel] = useState<{ id: string; hostelName: string; contactPhone?: string } | null>(null);
  const [isLoadingHostel, setIsLoadingHostel] = useState(true);
  const { slug } = useParams<{ slug: string }>();
  const hostelName = hostel?.hostelName || 'Hostel';
  const hostelId = hostel?.id;
  const ownerPhone = hostel?.contactPhone?.replace(/[^\d+]/g, '') || '';

  useEffect(() => {
    if (!photoFile) return;
    let cancelled = false;
    setTurnstileToken('');
    setTurnstileError('');
    if (!turnstileSiteKey) {
      setTurnstileError('Photo verification is not configured. Please try again later.');
      return;
    }
    loadTurnstileScript().then(() => {
      if (cancelled || !turnstileContainer.current || !window.turnstile) return;
      turnstileWidgetId.current = window.turnstile.render(turnstileContainer.current, {
        sitekey: turnstileSiteKey,
        action: 'join_photo_upload',
        callback: (token: string) => { setTurnstileToken(token); setTurnstileError(''); },
        'expired-callback': () => { setTurnstileToken(''); setTurnstileError('Verification expired. Complete it again.'); },
        'error-callback': () => { setTurnstileToken(''); setTurnstileError('Photo verification failed to load.'); },
      });
    }).catch((error: Error) => { if (!cancelled) setTurnstileError(error.message); });
    return () => {
      cancelled = true;
      if (turnstileWidgetId.current && window.turnstile) window.turnstile.remove(turnstileWidgetId.current);
      turnstileWidgetId.current = null;
    };
  }, [photoFile, turnstileSiteKey]);

  useEffect(() => {
    document.title = hostel
      ? `${hostel.hostelName} - Join`
      : 'Join Hostel - Hostelrr';

    return () => {
      document.title = 'Hostelrr - All in one hostel management system';
    };
  }, [hostel]);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setErrorMsg('This hostel QR code is invalid. Please ask the hostel owner for a new QR code.');
      setIsLoadingHostel(false);
      return;
    }
    fetchPublicHostelForJoin(slug)
      .then((result) => {
        if (cancelled) return;
        setHostel(result);
        if (!result) setErrorMsg('Hostel not found. Please ask the hostel owner for a current QR code.');
      })
      .catch((error: any) => {
        if (!cancelled) setErrorMsg(error?.message || 'Unable to load this hostel. Please try again.');
      })
      .finally(() => { if (!cancelled) setIsLoadingHostel(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setErrorMsg('');

    if (!hostelId) {
      const message = 'Hostel not found. Please open the QR code from the correct hostel page.';
      setErrorMsg(message);
      toast.error(message);
      return;
    }

    const formData = new FormData(e.currentTarget);

    setIsSubmitting(true);
    try {
      // Extract file inputs if present
      const nextPhotoFile = (formData.get('photo') as File | null) || photoFile;

      if (nextPhotoFile && nextPhotoFile.size > MAX_JOIN_PHOTO_SIZE) {
        throw new Error('Photo must be 1 MB or smaller.');
      }
      if (nextPhotoFile && !turnstileToken) throw new Error(turnstileError || 'Complete photo verification before submitting.');

      await submitJoinRequestWithPhoto({
        hostelId,
        name: formData.get('name') as string,
        // Keep phone storage consistent with resident records (10 digit Indian mobile).
        phone: String(formData.get('phone') || '').replace(/\D/g, '').slice(-10),
        occupation: formData.get('occupation') as string,
        preferredRoom: formData.get('preferredRoom') as string,
        preferredSharing: formData.get('preferredSharing') as string,
        emergencyContact: formData.get('emergencyContact')
          ? String(formData.get('emergencyContact')).replace(/\D/g, '').slice(-10)
          : undefined,
        aadharNumber: formData.get('aadharNumber') as string,
        state: formData.get('state') as string,
        country: formData.get('country') as string,
      }, nextPhotoFile && nextPhotoFile.size > 0 ? nextPhotoFile : null, turnstileToken || undefined);

      toast.success('Request sent successfully');

      // Trigger dashboard refresh to show new join request immediately
      window.dispatchEvent(new CustomEvent('refresh-join-requests'));

      setSubmitted(true);
    } catch (error: any) {
      const message = error?.message || 'Failed to submit joining request';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      if (photoFile && turnstileWidgetId.current && window.turnstile) {
        setTurnstileToken('');
        window.turnstile.reset(turnstileWidgetId.current);
      }
    }
  };

  if (submitted) {
    return (
      <div className="h-dvh overflow-y-auto overscroll-contain bg-gray-50 flex items-start justify-center p-4 sm:items-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl border border-gray-100">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Sent Successfully!</h2>
          <p className="text-gray-600">
            Your joining request for {hostelName} has been received. We will review your details and contact you shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
      <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 shrink-0">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(ROUTES.home.path)}
            type="button"
            className="p-2 -ml-2 text-gray-400 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
            <img
              src="https://res.cloudinary.com/dfkfysygf/image/upload/v1795005162/hostelrr_selected_logo_sgnck0.png"
              alt="Hostelrr Logo"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">{hostelName}</h1>
            <p className="text-xs text-gray-500">Joining Form</p>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 overflow-y-auto no-scrollbar overscroll-y-contain touch-pan-y">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Apply for Stay</h2>
            <p className="text-sm text-gray-500 mb-6">Fill your details and submit your request. We'll get back to you soon.</p>
            {ownerPhone && (
              <a
                href={`tel:${ownerPhone}`}
                className="mb-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
              >
                <Phone className="h-4 w-4" />
                Call Owner
              </a>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {isLoadingHostel && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">Loading hostel details…</div>
              )}
              {errorMsg && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Rahul Sharma"
                  className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Phone <span className="text-red-500">*</span></label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-white text-gray-500 sm:text-sm font-medium">
                      +91
                    </span>
                    <input
                      type="tel"
                      name="phone"
                      required
                      inputMode="numeric"
                      pattern="\d{10}"
                      minLength={10}
                      maxLength={10}
                      title="Phone number must be exactly 10 digits"
                      onInput={(e) => {
                        const input = e.currentTarget;
                        input.value = input.value.replace(/\D/g, '').slice(0, 10);
                      }}
                      placeholder="98765 43210"
                      className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-r-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Emergency No. <span className="text-red-500">*</span></label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-white text-gray-500 sm:text-sm font-medium">
                      +91
                    </span>
                    <input
                      type="tel"
                      name="emergencyContact"
                      required
                      inputMode="numeric"
                      pattern="\d{10}"
                      minLength={10}
                      maxLength={10}
                      title="Emergency number must be exactly 10 digits"
                      onInput={(e) => {
                        const input = e.currentTarget;
                        input.value = input.value.replace(/\D/g, '').slice(0, 10);
                      }}
                      placeholder="98765 43210"
                      className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-r-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Aadhaar No. <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="aadharNumber"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{12}"
                  minLength={12}
                  maxLength={12}
                  title="Aadhaar number must be exactly 12 digits"
                  onInput={(e) => {
                    const input = e.currentTarget;
                    input.value = input.value.replace(/\D/g, '').slice(0, 12);
                  }}
                  placeholder="Enter 12 digits"
                  className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Occupation <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {['Student', 'Employee', 'Other'].map((type) => (
                    <label key={type} className="cursor-pointer">
                      <input
                        type="radio"
                        name="occupation"
                        value={type}
                        title="Please choose Student, Employee, or Other."
                        className="peer sr-only"
                        required
                      />
                      <div className="text-center px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 peer-checked:bg-indigo-50 peer-checked:border-indigo-600 peer-checked:text-indigo-700 transition-all">
                        {type}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Preferred Room Number <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    name="preferredRoom"
                    required
                    placeholder="e.g. 201"
                    className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Preferred Sharing Type <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    name="preferredSharing"
                    required
                    placeholder="e.g. 2 sharing"
                    className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">State <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    name="state"
                    required
                    placeholder="e.g. Karnataka"
                    className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Country <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    name="country"
                    defaultValue="India"
                    placeholder="e.g. India"
                    className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Photo <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-100 rounded-2xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                      <ImageIcon className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{photoFile ? photoFile.name : 'No photo selected'}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">JPG, PNG or WebP · up to 1 MB</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-bold text-gray-700 shadow-sm cursor-pointer transition-all hover:bg-gray-50 shrink-0">
                    {photoFile ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      name="photo"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        if (file && file.size > MAX_JOIN_PHOTO_SIZE) {
                          e.currentTarget.value = '';
                          setPhotoFile(null);
                          setTurnstileToken('');
                          setPhotoError('Photo must be 1 MB or smaller.');
                          return;
                        }
                        setPhotoError('');
                        setTurnstileToken('');
                        setPhotoFile(file || null);
                      }}
                    />
                  </label>
                </div>
                {photoError && (
                  <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                    {photoError}
                  </p>
                )}
                {photoFile && <div className="mt-3 space-y-1">
                  <div ref={turnstileContainer} />
                  {turnstileError && <p className="text-xs text-red-600">{turnstileError}</p>}
                </div>}
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting || isLoadingHostel || !hostelId}
                  className="w-full bg-[#155dfc] hover:bg-[#0d4de8] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl shadow-lg shadow-[#155dfc]/30 transition-all active:scale-[0.98]"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <p className="text-center text-xs text-gray-400 mt-4">
                  Powered by <span className="font-semibold text-gray-500">Hostelrr</span>
                </p>
                <p className="text-center text-xs text-gray-400 mt-1">
                  For free demo, contact <a href="mailto:hostelrr.support@gmail.com" className="font-semibold text-blue-600 hover:underline">hostelrr.support@gmail.com</a> or 7330744800
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

