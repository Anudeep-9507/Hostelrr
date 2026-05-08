import React, { useState } from 'react';
import { toast } from 'sonner';
import { Save, Building2, Bell, User, Lock, CreditCard, HelpCircle, LogOut, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { supabase } from '../supabaseClient';

export default function Settings() {
  const { hostelProfile, updateHostelProfile } = useApp();
  const [isSaving, setIsSaving] = useState(false);

  // Load from local storage for other non-profile data
  const onboardingRaw = localStorage.getItem('hostelrr_onboarding_data');
  const onboardingData = onboardingRaw ? JSON.parse(onboardingRaw) : null;
  
  const numFloors = onboardingData?.numFloors || 3;
  const numRooms = onboardingData?.numRooms || 12;
  const numBeds = onboardingData?.numBeds || 36;

  const handleSaveHostelDetails = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const updatedProfile = {
      ...hostelProfile,
      hostelName: formData.get('hostelName'),
      ownerName: formData.get('ownerName'),
      phone: formData.get('phone'),
      email: formData.get('email'),
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

  const handlePasswordChange = () => {
    toast.success('Password updated successfully');
  };

  const handleExport = (type: string) => {
    toast.success(`${type} export started`);
  };

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    toast.success('Logging out...');
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 pb-32">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-gray-500 mt-2">Manage your hostel preferences and account.</p>
      </div>

      <div className="space-y-8 relative">

        {/* SECTION 1: HOSTEL DETAILS */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Hostel Details</h2>
          </div>
          <form onSubmit={handleSaveHostelDetails} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <input name="phone" type="tel" defaultValue={hostelProfile?.phone || ""} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Email</label>
                <input name="email" type="email" defaultValue={hostelProfile?.email || ""} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-sm">
                <Save className="w-4 h-4" /> Save Changes
              </button>
            </div>
          </form>
        </section>

        {/* SECTION 2: FLOORS / ROOMS CONFIGURATION */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Rooms & Floors Setup</h2>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-gray-500 text-sm">Use this section to manage your building structure.</p>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center">
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

            <div className="flex flex-wrap gap-3 pt-2">
              <button onClick={() => toast.success('Navigation coming soon')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold transition-colors">
                Manage Rooms & Beds
              </button>
              <button onClick={() => toast.success('Navigation coming soon')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold transition-colors">
                Add New Floor
              </button>
              <button onClick={() => toast.success('Navigation coming soon')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold transition-colors">
                Add New Room
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: PAYMENT REMINDER SETTINGS */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center text-[#25D366]">
              <Bell className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Payment Reminders</h2>
          </div>
          <div className="p-6 space-y-6">
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
                defaultValue="Hello {{name}}, your hostel rent of ₹{{amount}} for Room {{room}} is pending. Please pay soon." 
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
              <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-sm">
                <Save className="w-4 h-4" /> Save Reminder Settings
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 4: ACCOUNT PROFILE */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <User className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Profile</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Full Name</label>
                <input type="text" defaultValue={hostelProfile?.ownerName || "Hostel Owner"} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Mobile Number</label>
                <input type="tel" defaultValue={hostelProfile?.phone || ""} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-gray-700">Email</label>
                <input type="email" defaultValue={hostelProfile?.email || ""} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
              </div>
            </div>
            
            <div className="pt-2">
              <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-sm">
                <Save className="w-4 h-4" /> Update Profile
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 5: SECURITY */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Security</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 gap-6 max-w-md">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Current Password</label>
                <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">New Password</label>
                <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Confirm New Password</label>
                <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
              </div>
            </div>
            
            <div className="pt-2 flex flex-wrap gap-4 items-center border-t border-gray-100 mt-6 pt-6">
              <button onClick={handlePasswordChange} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-semibold transition-colors">
                Change Password
              </button>
              <button onClick={() => setShowLogoutModal(true)} className="bg-red-50 hover:bg-red-100 text-red-600 px-6 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 6: SUBSCRIPTION PLAN */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Current Plan</h2>
          </div>
          <div className="p-6">
            <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl p-6 max-w-md">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Starter Plan</h3>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-blue-600">₹499</span>
                    <span className="text-sm font-medium text-gray-500">/ month</span>
                  </div>
                </div>
                <div className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase tracking-wide">
                  Active
                </div>
              </div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500" /> Up to 50 beds
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500" /> Payments tracking
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500" /> WhatsApp reminders
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500" /> Resident records
                </li>
              </ul>
              
              <div className="flex gap-3">
                <button onClick={() => toast.success('Upgrade feature coming soon')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold transition-colors shadow-sm">
                  Upgrade Plan
                </button>
                <button onClick={() => toast.success('Billing history coming soon')} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-2.5 rounded-xl font-semibold transition-colors">
                  Billing History
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7: DATA & SUPPORT */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Data & Support</h2>
          </div>
          <div className="p-6 flex flex-wrap gap-4">
            <button onClick={() => handleExport('Residents CSV')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold transition-colors">
              Export Residents CSV
            </button>
            <button onClick={() => handleExport('Payments CSV')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold transition-colors">
              Export Payments CSV
            </button>
            <button onClick={() => handleExport('Join Requests')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold transition-colors">
              Download Join Requests
            </button>
            <div className="w-full border-t border-gray-100 my-2"></div>
            <button onClick={() => toast.success('Support center coming soon')} className="bg-blue-50 border border-blue-100 hover:bg-blue-100 text-blue-700 px-5 py-2.5 rounded-xl font-semibold transition-colors">
              Contact Support
            </button>
            <button onClick={() => toast.success('Help guide coming soon')} className="bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl font-semibold transition-colors">
              Help Guide
            </button>
          </div>
        </section>

      </div>

      {/* Sticky Save Button (Optional feature, implementing as simple bottom bar if needed, but per request it's just a bonus. Making it subtle) */}
      <AnimatePresence>
        {isSaving && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-6 py-3 rounded-full font-bold shadow-xl flex items-center gap-3"
          >
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Saving changes...
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50"
              onClick={() => setShowLogoutModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-3xl shadow-xl z-50 overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <LogOut className="w-8 h-8 ml-1" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Log Out?</h3>
                <p className="text-gray-500 mb-6 font-medium">Are you sure you want to log out of your account?</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowLogoutModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition-colors">
                    Cancel
                  </button>
                  <button onClick={confirmLogout} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold transition-colors">
                    Log Out
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
