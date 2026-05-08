import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, ChevronLeft, Image as ImageIcon, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createJoinRequestDb, uploadJoinRequestDocuments } from '../lib/supabaseAPI';
import { toast } from 'sonner';

export default function JoinForm() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [aadharFile, setAadharFile] = useState<File | null>(null);
  const { hostelProfile } = useApp();
  
  const hostelName = hostelProfile?.hostelName || 'My Hostel';
  const hostelId = hostelProfile?.id;

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
      const nextAadharFile = (formData.get('aadhar') as File | null) || aadharFile;

      // Upload files if provided
      let photoPath: string | undefined;
      let aadharDocumentPath: string | undefined;

      if (nextPhotoFile && nextPhotoFile.size > 0) {
        const uploadedDocs = await uploadJoinRequestDocuments(
          { photo: nextPhotoFile },
          hostelId
        );
        photoPath = uploadedDocs.photoPath;
        toast.success('Resident photo uploaded');
      }

      if (nextAadharFile && nextAadharFile.size > 0) {
        const uploadedDocs = await uploadJoinRequestDocuments(
          { aadhar: nextAadharFile },
          hostelId
        );
        aadharDocumentPath = uploadedDocs.aadharPath;
        toast.success('Aadhar document uploaded');
      }

      // Submit join request with file paths
      await createJoinRequestDb({
        hostelId,
        name: formData.get('name') as string,
        phone: `+91 ${formData.get('phone')}`,
        occupation: formData.get('occupation') as string,
        preferredRoom: formData.get('preferredRoom') as string,
        emergencyContact: formData.get('emergencyContact') ? `+91 ${formData.get('emergencyContact')}` : undefined,
        aadharNumber: formData.get('aadharNumber') as string,
        areaAndCity: formData.get('areaAndCity') as string,
        state: formData.get('state') as string,
        country: formData.get('country') as string,
        photoPath: photoPath ?? null,
        aadharDocumentPath: aadharDocumentPath ?? null,
      });

      toast.success('Request sent successfully');
      setSubmitted(true);
    } catch (error: any) {
      const message = error?.message || 'Failed to submit joining request';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl border border-gray-100">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Sent Successfully!</h2>
          <p className="text-gray-600 mb-8">
            Your joining request for {hostelName} has been received. We will review your details and contact you shortly.
          </p>
          <button 
            onClick={() => {
              window.history.pushState(null, '', '/');
              window.dispatchEvent(new Event('popstate'));
            }}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-4 rounded-xl transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 shrink-0">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button 
            onClick={() => {
              window.history.pushState(null, '', '/');
              window.dispatchEvent(new Event('popstate'));
            }}
            type="button"
            className="p-2 -ml-2 text-gray-400 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">{hostelName}</h1>
            <p className="text-xs text-gray-500">Joining Form</p>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Apply for Stay</h2>
            <p className="text-sm text-gray-500 mb-6">Fill your details and submit your request. We'll get back to you soon.</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {errorMsg && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Resident Documents</label>
                <div className="grid grid-cols-1 gap-4 pt-1">
                  <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-100 rounded-2xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                        <ImageIcon className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Photo</p>
                        {photoFile ? (
                          <>
                            <p className="text-[11px] text-green-600 font-bold flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3 h-3" /> New file selected
                            </p>
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">{photoFile.name}</p>
                          </>
                        ) : (
                          <p className="text-[11px] text-gray-500 mt-0.5">PNG, JPG up to 3MB</p>
                        )}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-bold text-gray-700 shadow-sm cursor-pointer transition-all hover:bg-gray-50 shrink-0">
                      {photoFile ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        name="photo"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          setPhotoFile(e.target.files?.[0] || null);
                        }}
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-100 rounded-2xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                        <FileText className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Aadhar</p>
                        {aadharFile ? (
                          <>
                            <p className="text-[11px] text-green-600 font-bold flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3 h-3" /> New file selected
                            </p>
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">{aadharFile.name}</p>
                          </>
                        ) : (
                          <p className="text-[11px] text-gray-500 mt-0.5">PDF, PNG, JPG up to 3MB</p>
                        )}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-bold text-gray-700 shadow-sm cursor-pointer transition-all hover:bg-gray-50 shrink-0">
                      {aadharFile ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        name="aadhar"
                        accept="image/*,application/pdf"
                        className="sr-only"
                        onChange={(e) => {
                          setAadharFile(e.target.files?.[0] || null);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

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
                <label className="text-sm font-medium text-gray-900 block">Aadhar No. <span className="text-red-500">*</span></label>
                <input 
                  type="text"
                  name="aadharNumber"
                  required
                  placeholder="e.g. 1234 5678 9012" 
                  className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Occupation <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {['Student', 'Employee', 'Other'].map((type) => (
                    <label key={type} className="cursor-pointer">
                      <input type="radio" name="occupation" value={type} className="peer sr-only" defaultChecked={type === 'Student'} required />
                      <div className="text-center px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 peer-checked:bg-indigo-50 peer-checked:border-indigo-600 peer-checked:text-indigo-700 transition-all">
                        {type}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Area & City <span className="text-red-500">*</span></label>
                <input 
                  type="text"
                  name="areaAndCity"
                  required
                  placeholder="e.g. Sector 5, Bengaluru" 
                  className="w-full border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white"
                />
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

              <div className="pt-4">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <p className="text-center text-xs text-gray-400 mt-4">
                  Powered by <span className="font-semibold text-gray-500">Hostelrr</span>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

