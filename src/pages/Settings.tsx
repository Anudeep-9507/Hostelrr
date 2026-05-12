import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { toast } from 'sonner';
import { Save, Bell, User, Lock, HelpCircle, LogOut, Check, Loader2, Home, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { FLAGS } from '../core/env';
import { supabase } from '../supabaseClient';
import { cn } from '../lib/utils';

export default function Settings() {
  const navigate = useNavigate();
  const { hostelProfile, updateHostelProfile, showBedLayout, setShowBedLayout } = useApp();
  const [activeTab, setActiveTab] = useState('hostel');
  const [isSaving, setIsSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isCurrentPasswordVerified, setIsCurrentPasswordVerified] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Load from local storage for other non-profile data
  const onboardingRaw = localStorage.getItem('hostelrr_onboarding_data');
  const onboardingData = onboardingRaw ? JSON.parse(onboardingRaw) : null;
  
  const numFloors = onboardingData?.numFloors || 3;
  const numRooms = onboardingData?.numRooms || 12;
  const numBeds = onboardingData?.numBeds || 36;

  const TABS = [
    { id: 'hostel', label: 'Hostel', icon: Home, color: 'blue' },
    { id: 'layout', label: 'Layout', icon: LayoutGrid, color: 'purple' },
    { id: 'reminders', label: 'Reminders', icon: Bell, color: 'emerald' },
    { id: 'profile', label: 'Profile', icon: User, color: 'orange' },
    { id: 'security', label: 'Security', icon: Lock, color: 'rose' },
    { id: 'support', label: 'Support', icon: HelpCircle, color: 'teal' },
  ];

  const handleSaveHostelDetails = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const normalizePhone = (value: FormDataEntryValue | null) => {
      const digits = String(value ?? '').replace(/\D/g, '');
      return digits.length > 10 ? digits.slice(-10) : digits;
    };
    const updatedProfile = {
      ...hostelProfile,
      hostelName: formData.get('hostelName'),
      ownerName: formData.get('ownerName'),
      phone: normalizePhone(formData.get('phone')),
      city: formData.get('city'),
      state: formData.get('state'),
      country: formData.get('country'),
      pincode: formData.get('pincode'),
    };
    
    updateHostelProfile(updatedProfile);
    
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Saved successfully', { duration: 3000 });
    }, 800);
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Saved successfully', { duration: 3000 });
    }, 800);
  };

  const handleVerifyCurrentPassword = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    
    setIsVerifyingPassword(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) throw new Error('Could not get user email');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) throw new Error('Current password is incorrect');
      
      setIsCurrentPasswordVerified(true);
      toast.success('Password verified. You can now enter a new password.');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to verify password');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!isCurrentPasswordVerified) {
      toast.error('Please verify current password first');
      return;
    }
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in new password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsCurrentPasswordVerified(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleExport = (type: string) => {
    toast.success(`${type} export started`);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    toast.success('Logging out...');
    await supabase.auth.signOut();
    navigate(ROUTES.signin.path, { replace: true });
  };

  const getPillColor = (color: string, isActive: boolean) => {
    if (!isActive) return "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 shadow-sm";
    
    const colors: Record<string, string> = {
      blue: "bg-blue-600 border-blue-600 text-white shadow-blue-200 shadow-lg",
      purple: "bg-purple-600 border-purple-600 text-white shadow-purple-200 shadow-lg",
      emerald: "bg-emerald-600 border-emerald-600 text-white shadow-emerald-200 shadow-lg",
      orange: "bg-orange-600 border-orange-600 text-white shadow-orange-200 shadow-lg",
      rose: "bg-rose-600 border-rose-600 text-white shadow-rose-200 shadow-lg",
      teal: "bg-teal-600 border-teal-600 text-white shadow-teal-200 shadow-lg",
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-20">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm md:text-base text-gray-500">Manage your hostel preferences and account details.</p>
      </div>

      {/* Horizontal Pill Navigation Bar */}
      <div className="sticky top-14 md:top-0 z-30 -mx-4 md:mx-0 px-4 md:px-0 py-3 bg-gray-50/80 backdrop-blur-md border-b border-gray-200/50 -mt-2">
        <div className="flex items-center gap-2 md:gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-none inline-flex items-center gap-2 px-4 py-2.5 rounded-full transition-all duration-300 border text-[13px] outline-none",
                  isActive 
                    ? cn(getPillColor(tab.color, true), "font-bold")
                    : cn(getPillColor(tab.color, false), "font-medium")
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 overflow-hidden ring-2",
                  isActive ? "ring-white/30" : "ring-gray-100 bg-gray-100"
                )}>
                  <Icon className={cn("w-3 h-3", isActive ? "text-white" : "text-gray-400")} />
                </div>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative pt-4">
        <AnimatePresence mode="wait">
          {activeTab === 'hostel' && (
            <motion.section
              key="hostel"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 md:p-6 pb-0 flex items-center">
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 ring-2 ring-white">
                    <Home className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="text-[13px] font-semibold text-blue-700">Hostel Details</h2>
                </div>
              </div>
              <div className="px-4 md:px-6 pb-2 flex items-center justify-between">
                <div />
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">Show Bed Layout</span>
                  <button
                    onClick={() => setShowBedLayout(!showBedLayout)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                      showBedLayout ? "bg-blue-600" : "bg-gray-300"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        showBedLayout ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveHostelDetails} className="p-4 md:p-6 space-y-5 md:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Hostel Name</label>
                    <input name="hostelName" type="text" defaultValue={hostelProfile?.hostelName || "My Hostel"} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Owner Name</label>
                    <input name="ownerName" type="text" defaultValue={hostelProfile?.ownerName || "Hostel Owner"} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Mobile Number</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-white text-gray-500 text-sm font-medium">+91</span>
                      <input
                        name="phone"
                        type="tel"
                        defaultValue={(hostelProfile?.phone || "").replace(/\D/g, '').slice(-10)}
                        inputMode="numeric"
                        pattern="\d{10}"
                        minLength={10}
                        maxLength={10}
                        onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-r-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">City</label>
                    <input name="city" type="text" defaultValue={hostelProfile?.city || ""} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">State</label>
                    <input name="state" type="text" defaultValue={hostelProfile?.state || ""} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Country</label>
                    <select name="country" defaultValue={hostelProfile?.country || "India"} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none cursor-pointer">
                      <option value="India">India</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">PIN Code</label>
                    <input name="pincode" type="text" defaultValue={hostelProfile?.pincode || ""} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                  </div>
                </div>
                <div className="pt-2">
                  <button type="submit" className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 md:py-2.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                </div>
              </form>
            </motion.section>
          )}

          {activeTab === 'layout' && (
            <motion.section
              key="layout"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 md:p-6 pb-0 flex items-center">
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-purple-50 border border-purple-100 shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 ring-2 ring-white">
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="text-[13px] font-semibold text-purple-700">Rooms & Floors Setup</h2>
                </div>
              </div>
              <div className="p-4 md:p-6 space-y-6">
                <p className="text-gray-500 text-sm">Use this section to manage your building structure.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center col-span-2 md:col-span-1">
                    <div className="text-2xl font-bold text-gray-900 mb-1">{numFloors}</div>
                    <div className="text-sm font-medium text-gray-500">Total Floors</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center">
                    <div className="text-2xl font-bold text-gray-900 mb-1">{numRooms}</div>
                    <div className="text-sm font-medium text-gray-500">Total Rooms</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center">
                    <div className="text-2xl font-bold text-gray-900 mb-1">{numBeds}</div>
                    <div className="text-sm font-medium text-gray-500">Total Beds</div>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row flex-wrap gap-3 pt-2">
                  <button onClick={() => toast.success('Navigation coming soon')} className="w-full md:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-3 md:py-2.5 rounded-xl font-semibold transition-colors">Manage Rooms & Beds</button>
                  <button onClick={() => toast.success('Navigation coming soon')} className="w-full md:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-3 md:py-2.5 rounded-xl font-semibold transition-colors text-sm">Add New Floor</button>
                  <button onClick={() => toast.success('Navigation coming soon')} className="w-full md:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-3 md:py-2.5 rounded-xl font-semibold transition-colors text-sm">Add New Room</button>
                </div>
              </div>
            </motion.section>
          )}

          {activeTab === 'reminders' && (
            <motion.section
              key="reminders"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 md:p-6 pb-0 flex items-center">
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100 shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 ring-2 ring-white">
                    <Bell className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="text-[13px] font-semibold text-emerald-700">Payment Reminders</h2>
                </div>
              </div>
              <div className="p-4 md:p-6 space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2 max-w-md">
                    <label className="text-sm font-semibold text-gray-700">Monthly Rent Due Date</label>
                    <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none">
                      {[...Array(31)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Default Rent Reminder Message</label>
                  <textarea 
                    rows={4}
                    defaultValue={`Hello {{name}}, your hostel rent of ₹{{amount}} for Room {{room}} is pending. Please pay soon. Thank you\uD83D\uDE01`} 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none"
                  />
                </div>
                <div className="space-y-4 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-700">Enable manual reminders</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-700">Show reminder button in payments page</span>
                  </label>
                </div>
                <div className="pt-2">
                  <button onClick={handleSave} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 md:py-2.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <Save className="w-4 h-4" /> Save Reminder Settings
                  </button>
                </div>
              </div>
            </motion.section>
          )}

          {activeTab === 'profile' && (
            <motion.section
              key="profile"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 md:p-6 pb-0 flex items-center">
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-orange-50 border border-orange-100 shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 ring-2 ring-white">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="text-[13px] font-semibold text-orange-700">Profile</h2>
                </div>
              </div>
              <div className="p-4 md:p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Full Name</label>
                    <input type="text" defaultValue={hostelProfile?.ownerName || "Hostel Owner"} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Mobile Number</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-white text-gray-500 text-sm font-medium">+91</span>
                      <input
                        type="tel"
                        defaultValue={(hostelProfile?.phone || "").replace(/\D/g, '').slice(-10)}
                        inputMode="numeric"
                        pattern="\d{10}"
                        minLength={10}
                        maxLength={10}
                        onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-r-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-gray-700">Email</label>
                    <input type="email" defaultValue={hostelProfile?.email || ""} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                  </div>
                </div>
                <div className="pt-2">
                  <button onClick={handleSave} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 md:py-2.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <Save className="w-4 h-4" /> Update Profile
                  </button>
                </div>
              </div>
            </motion.section>
          )}

          {activeTab === 'security' && (
            <motion.section
              key="security"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 md:p-6 pb-0 flex items-center">
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-rose-50 border border-rose-100 shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 ring-2 ring-white">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="text-[13px] font-semibold text-rose-700">Security</h2>
                </div>
              </div>
              <div className="p-4 md:p-6 space-y-6">
                <div className="grid grid-cols-1 gap-6 max-w-md">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Current Password</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        type="password" 
                        value={currentPassword}
                        onChange={(e) => { setCurrentPassword(e.target.value); setIsCurrentPasswordVerified(false); }}
                        disabled={isCurrentPasswordVerified}
                        placeholder="••••••••" 
                        className="w-full px-4 py-3 md:py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none disabled:opacity-50" 
                      />
                      <button
                        type="button"
                        onClick={handleVerifyCurrentPassword}
                        disabled={isVerifyingPassword || isCurrentPasswordVerified || !currentPassword}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 md:py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center whitespace-nowrap"
                      >
                        {isVerifyingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : (isCurrentPasswordVerified ? <><Check className="w-4 h-4 text-green-600 mr-2" /> Verified</> : 'Verify')}
                      </button>
                    </div>
                  </div>
                  {isCurrentPasswordVerified && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">New Password</label>
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">Confirm New Password</label>
                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                      </div>
                    </motion.div>
                  )}
                </div>
                <div className="pt-2 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 items-center border-t border-gray-100 mt-6 pt-6">
                  <button 
                    type="button"
                    onClick={handlePasswordChange} 
                    disabled={isChangingPassword || !isCurrentPasswordVerified}
                    className="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 md:py-2.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isChangingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isChangingPassword ? 'Updating...' : 'Change Password'}
                  </button>
                  <button onClick={() => setShowLogoutModal(true)} className="w-full sm:w-auto bg-red-50 hover:bg-red-100 text-red-600 px-6 py-3 md:py-2.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                    <LogOut className="w-4 h-4" /> Logout Account
                  </button>
                </div>
              </div>
            </motion.section>
          )}

          {activeTab === 'support' && (
            <motion.section
              key="support"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 md:p-6 pb-0 flex items-center">
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-teal-50 border border-teal-100 shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 ring-2 ring-white">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="text-[13px] font-semibold text-teal-700">Data & Support</h2>
                </div>
              </div>
              <div className="p-4 md:p-6 flex flex-col md:flex-row md:flex-wrap gap-3 md:gap-4">
                <button onClick={() => handleExport('Residents CSV')} className="w-full md:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-3 md:py-2.5 rounded-xl font-semibold transition-colors text-sm">Export Residents CSV</button>
                <button onClick={() => handleExport('Payments CSV')} className="w-full md:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-3 md:py-2.5 rounded-xl font-semibold transition-colors text-sm">Export Payments CSV</button>
                <button onClick={() => handleExport('Join Requests')} className="w-full md:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-3 md:py-2.5 rounded-xl font-semibold transition-colors text-sm">Download Join Requests</button>
                <div className="w-full border-t border-gray-100 my-1 md:my-2"></div>
                <button onClick={() => toast.success('Support center coming soon')} className="w-full md:w-auto bg-blue-50 border border-blue-100 hover:bg-blue-100 text-blue-700 px-5 py-3 md:py-2.5 rounded-xl font-semibold transition-colors text-sm">Contact Support</button>
                <button onClick={() => toast.success('Help guide coming soon')} className="w-full md:w-auto bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 px-5 py-3 md:py-2.5 rounded-xl font-semibold transition-colors text-sm">Help Guide</button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isSaving && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-6 py-3 rounded-full font-bold shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Saving changes...
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogoutModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50" onClick={() => setShowLogoutModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-3xl shadow-xl z-50 overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <LogOut className="w-8 h-8 ml-1" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Log Out?</h3>
                <p className="text-gray-500 mb-6 font-medium">Are you sure you want to log out of your account?</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowLogoutModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition-colors">Cancel</button>
                  <button onClick={confirmLogout} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold transition-colors">Log Out</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
