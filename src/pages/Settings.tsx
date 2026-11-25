import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { toast } from 'sonner';
import {
  Save,
  Bell,
  User,
  Lock,
  HelpCircle,
  LogOut,
  Check,
  Loader2,
  Home,
  LayoutGrid,
  CreditCard,
  ShieldCheck,
  ChevronRight,
  Download,
  Building2,
  Smartphone,
  Mail,
  CircleHelp,
  Edit,
  X,
  Phone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { supabase } from '../supabaseClient';
import { cn, getNamesFromIds } from '../lib/utils';
import { DEFAULT_RENT_REMINDER_TEMPLATE, getEditableReminderTemplate, getReminderSignature } from '../lib/reminderTemplate';
import TemplateEditor from '../components/TemplateEditor';

type SettingsTab = 'hostel' | 'layout' | 'reminders' | 'security' | 'support';

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof Home }> = [
  { id: 'hostel', label: 'Hostel profile', icon: Home },
  { id: 'layout', label: 'Property layout', icon: LayoutGrid },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'support', label: 'Data & support', icon: HelpCircle },
];

const fieldClassName =
  'w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#155dfc] focus:bg-white focus:ring-4 focus:ring-[#155dfc]/15';

function SectionHeader({ icon: Icon, eyebrow, title, description }: {
  icon: typeof Home;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#155dfc]/10 text-[#155dfc]">
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#155dfc]">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between gap-3 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
        <span>{label}</span>
        {hint && <span className="normal-case tracking-normal text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { hostelProfile, updateHostelProfile, showBedLayout, setShowBedLayout, session, residents, pastResidents, joinRequests, floors, openSupportModal } = useApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>('hostel');
  const [isSaving, setIsSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isCurrentPasswordVerified, setIsCurrentPasswordVerified] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [reminderTemplate, setReminderTemplate] = useState(DEFAULT_RENT_REMINDER_TEMPLATE);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [templateBeforeEdit, setTemplateBeforeEdit] = useState('');

  const onboardingRaw = localStorage.getItem('hostelrr_onboarding_data');
  const onboardingData = onboardingRaw ? JSON.parse(onboardingRaw) : null;
  const numFloors = onboardingData?.numFloors || 3;
  const numRooms = onboardingData?.numRooms || 12;
  const numBeds = onboardingData?.numBeds || 36;

  useEffect(() => {
    setReminderTemplate(getEditableReminderTemplate(hostelProfile?.reminderTemplate || DEFAULT_RENT_REMINDER_TEMPLATE));
  }, [hostelProfile?.id, hostelProfile?.reminderTemplate]);

  const handleSaveHostelDetails = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const normalizePhone = (value: FormDataEntryValue | null) => {
      const digits = String(value ?? '').replace(/\D/g, '');
      return digits.length > 10 ? digits.slice(-10) : digits;
    };
    updateHostelProfile({
      ...hostelProfile,
      hostelName: formData.get('hostelName'),
      ownerName: formData.get('ownerName'),
      phone: normalizePhone(formData.get('phone')),
      city: formData.get('city'),
      state: formData.get('state'),
      country: formData.get('country'),
      pincode: formData.get('pincode'),
    });
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Hostel details saved', { duration: 3000 });
    }, 800);
  };

  const handleSaveReminderSettings = async () => {
    setIsSaving(true);
    try {
      const signature = getReminderSignature(hostelProfile?.reminderTemplate);
      await updateHostelProfile({ ...hostelProfile, reminderTemplate: `${reminderTemplate.trimEnd()}\n\n${signature}` });
      toast.success('Reminder template saved for this hostel');
      setIsEditingTemplate(false);
      return true;
    } catch (error) {
      console.error('Failed to save reminder template:', error);
      toast.error('Failed to save reminder template');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerifyCurrentPassword = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    setIsVerifyingPassword(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) throw new Error('Could not get user email');
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (signInError) throw new Error('Current password is incorrect');
      setIsCurrentPasswordVerified(true);
      toast.success('Password verified');
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

  const escapeCsvValue = (value: unknown) => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };

  const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(',')),
    ].join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = (type: string) => {
    try {
      const dateStamp = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      if (type === 'Residents CSV') {
        const rows = [
          ...residents.map(resident => {
            const { roomName, bedName } = getNamesFromIds(floors, resident.roomId, resident.bedId);
            const floorName = floors.find(floor => floor.rooms.some(room => room.id === resident.roomId))?.name || '';
            return {
              name: resident.name,
              phone: resident.phone,
              floor: floorName,
              room: roomName,
              bed: bedName,
              joinDate: resident.joinDate,
              status: resident.status || 'active',
              paymentStatus: resident.paymentStatus,
              dueAmount: resident.dueAmount || 0,
              emergencyPhone: resident.emergencyPhone,
              aadhar: resident.aadhar,
              monthlyRent: resident.monthlyRent,
              state: resident.state,
              country: resident.country,
              areaAndCity: resident.areaAndCity,
            };
          }),
          ...pastResidents.map(resident => {
            const { roomName, bedName } = getNamesFromIds(floors, resident.roomId, resident.bedId);
            const floorName = floors.find(floor => floor.rooms.some(room => room.id === resident.roomId))?.name || '';
            return {
              name: resident.name,
              phone: resident.phone,
              floor: floorName,
              room: roomName,
              bed: bedName,
              joinDate: resident.joinDate,
              status: 'left',
              paymentStatus: '',
              dueAmount: '',
              emergencyPhone: resident.emergencyPhone,
              aadhar: resident.aadhar,
              monthlyRent: '',
              state: resident.state,
              country: resident.country,
              areaAndCity: resident.areaAndCity,
              vacateDate: resident.vacateDate,
              vacateReason: resident.reason,
            };
          }),
        ];

        downloadCsv(
          `residents-${dateStamp}.csv`,
          ['Name', 'Phone', 'Floor', 'Room', 'Bed', 'Join Date', 'Status', 'Payment Status', 'Due Amount', 'Emergency Phone', 'Aadhar', 'Monthly Rent', 'State', 'Country', 'Vacate Date', 'Vacate Reason'],
          rows.map(row => [
            row.name, row.phone, row.floor, row.room, row.bed, row.joinDate, row.status,
            row.paymentStatus, row.dueAmount, row.emergencyPhone, row.aadhar, row.monthlyRent,
            row.state, row.country, 'vacateDate' in row ? row.vacateDate : '',
            'vacateReason' in row ? row.vacateReason : '',
          ]),
        );
      } else if (type === 'Payments CSV') {
        const paymentRows: unknown[][] = [];

        [...residents, ...pastResidents].forEach(resident => {
          const { roomName, bedName } = getNamesFromIds(floors, resident.roomId, resident.bedId);
          (resident.paymentHistory || []).forEach(payment => {
            paymentRows.push([
              resident.name,
              resident.phone,
              roomName,
              bedName,
              payment.date,
              payment.amount,
              payment.status,
              payment.method || '',
              payment.title || 'Rent Payment',
              resident.id,
            ]);
          });

          if (resident.securityDeposit && resident.isDepositPaid) {
            paymentRows.push([
              resident.name,
              resident.phone,
              roomName,
              bedName,
              resident.depositPaidDate || resident.joinDate,
              resident.securityDeposit,
              'paid',
              '',
              'Security Deposit',
              resident.id,
            ]);
          }
        });

        paymentRows.sort((a, b) => String(b[4]).localeCompare(String(a[4])));
        downloadCsv(
          `payments-${dateStamp}.csv`,
          ['Resident Name', 'Phone', 'Room', 'Bed', 'Payment Date', 'Amount', 'Status', 'Method', 'Title', 'Resident ID'],
          paymentRows,
        );
      } else if (type === 'Join requests') {
        downloadCsv(
          `join-requests-${dateStamp}.csv`,
          ['Name', 'Phone', 'Occupation', 'Preferred Room', 'Preferred Sharing', 'Emergency Contact', 'Aadhar', 'State', 'Country', 'Request Date', 'Status', 'Stay Duration (Days)'],
          joinRequests.map(request => [
            request.name,
            request.phone,
            request.occupation,
            request.preferredRoom,
            request.preferredSharing,
            request.emergencyContact,
            request.aadharNumber,
            request.state,
            request.country,
            request.requestDate,
            request.status,
            request.stayDuration,
          ]),
        );
      }

      toast.success(`${type} downloaded`);
    } catch (error) {
      console.error(`Failed to export ${type}:`, error);
      toast.error(`Failed to download ${type}`);
    }
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    toast.success('Logging out...');
    await supabase.auth.signOut();
    navigate(ROUTES.signin.path, { replace: true });
  };

  const inputPhone = (value: string | undefined) => (value || '').replace(/\D/g, '').slice(-10);

  // Edit Template Modal
  const handleCloseEditTemplate = () => {
    setReminderTemplate(templateBeforeEdit);
    setIsEditingTemplate(false);
  };

  const handleOpenEditTemplate = () => {
    setTemplateBeforeEdit(reminderTemplate);
    setIsEditingTemplate(true);
  };

  const renderEditTemplateModal = () => {
    if (!isEditingTemplate) return null;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={handleCloseEditTemplate}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-6">
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">Edit Reminder Template</h3>
              <p className="mt-1 text-sm text-slate-500">Customize the WhatsApp message sent for rent reminders.</p>
            </div>
            <button
              onClick={handleCloseEditTemplate}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500 mb-3">Available Placeholders</label>
              <p className="text-sm text-slate-600">Drag or click placeholder badges to place them in your message.</p>
            </div>
            <Field label="Template message" hint="Tap a placeholder to insert it, or drag it into the message">
              <TemplateEditor value={reminderTemplate} onChange={setReminderTemplate} />
            </Field>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-sm font-bold text-slate-900">Fixed signature (added automatically)</p>
              <p className="mt-1 text-sm text-slate-600 font-mono">{getReminderSignature(hostelProfile?.reminderTemplate)}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:gap-3 sm:p-6">
            <button onClick={handleCloseEditTemplate} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50 sm:w-auto">Cancel</button>
            <button onClick={() => void handleSaveReminderSettings()} disabled={isSaving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#155dfc] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50 sm:w-auto"><Save size={16} /> {isSaving ? 'Saving…' : 'Save template'}</button>
          </div>
        </motion.div>
      </motion.div>
    );
  };

  const renderContent = () => {
    if (activeTab === 'hostel') {
      return (
        <motion.section key="hostel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_20px_60px_-32px_rgba(15,23,42,0.28)]">
          <SectionHeader icon={Building2} eyebrow="Workspace identity" title="Hostel profile" description="Keep the details your residents see accurate and up to date." />
          <form onSubmit={handleSaveHostelDetails} className="space-y-7 p-5 sm:p-7">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Hostel name"><input name="hostelName" defaultValue={hostelProfile?.hostelName || 'My Hostel'} className={fieldClassName} /></Field>
              <Field label="Owner name"><input name="ownerName" defaultValue={hostelProfile?.ownerName || 'Hostel Owner'} className={fieldClassName} /></Field>
              <Field label="Mobile number" hint="10 digits">
                <div className="flex"><span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 px-4 text-sm font-bold text-slate-500">+91</span><input name="phone" type="tel" defaultValue={inputPhone(hostelProfile?.phone)} inputMode="numeric" pattern="\d{10}" minLength={10} maxLength={10} onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }} className={cn(fieldClassName, 'rounded-l-none')} /></div>
              </Field>
              <Field label="Email address" hint="Locked">
                <div className="relative">
                  <Mail size={17} className="absolute left-4 top-3.5 text-slate-400" />
                  <input
                    type="email"
                    value={hostelProfile?.email || session?.user?.email || ''}
                    disabled
                    readOnly
                    className={cn(fieldClassName, 'pl-11 pr-10 cursor-not-allowed bg-slate-100 text-slate-500 border-slate-200 select-none')}
                  />
                  <Lock size={15} className="absolute right-4 top-3.5 text-slate-400" />
                </div>
              </Field>
              <Field label="City"><input name="city" defaultValue={hostelProfile?.city || ''} className={fieldClassName} /></Field>
              <Field label="State"><input name="state" defaultValue={hostelProfile?.state || ''} className={fieldClassName} /></Field>
              <Field label="Country"><select name="country" defaultValue={hostelProfile?.country || 'India'} className={cn(fieldClassName, 'appearance-none')}><option value="India">India</option></select></Field>
              <Field label="PIN code"><input name="pincode" defaultValue={hostelProfile?.pincode || ''} className={fieldClassName} /></Field>
            </div>
            <div className="flex flex-col justify-between gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#155dfc] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#155dfc]/20 transition hover:bg-[#104bc9]"><Save size={16} /> Save changes</button>
            </div>
          </form>
        </motion.section>
      );
    }

    if (activeTab === 'layout') {
      return (
        <motion.section key="layout" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_20px_60px_-32px_rgba(15,23,42,0.28)]">
          <SectionHeader icon={LayoutGrid} eyebrow="Property structure" title="Rooms & beds" description="A quick view of the building structure connected to this workspace." />
          <div className="space-y-7 p-5 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-3">
              {[[numFloors, 'Floors', 'bg-[#155dfc]/10 text-[#155dfc]'], [numRooms, 'Rooms', 'bg-violet-50 text-violet-600'], [numBeds, 'Beds', 'bg-cyan-50 text-cyan-600']].map(([value, label, colors]) => <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5"><div className={cn('mb-6 flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black', colors as string)}><LayoutGrid size={18} /></div><p className="text-3xl font-black tracking-tight text-slate-900">{value}</p><p className="mt-1 text-sm font-semibold text-slate-500">{label}</p></div>)}
            </div>
            <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-2xl p-4 bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><LayoutGrid size={18} /></div>
                <div><p className="text-sm font-extrabold text-slate-800">Show bed layout</p><p className="text-xs text-slate-500">Display the visual layout on your dashboard</p></div>
              </div>
              <button type="button" aria-label="Toggle bed layout" onClick={() => setShowBedLayout(!showBedLayout)} className={cn('relative ml-2 h-6 w-11 rounded-full transition-colors', showBedLayout ? 'bg-[#155dfc]' : 'bg-slate-300')}><span className={cn('absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform', showBedLayout ? 'left-6' : 'left-1')} /></button>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row"><button onClick={() => navigate(ROUTES.rooms.path)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#155dfc] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#104bc9]">Manage rooms & beds <ChevronRight size={16} /></button></div>
          </div>
        </motion.section>
      );
    }

    if (activeTab === 'reminders') {
      return (
        <motion.section key="reminders" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_20px_60px_-32px_rgba(15,23,42,0.28)]">
          <SectionHeader icon={Bell} eyebrow="Payment workflow" title="Payment reminders" description="Set a consistent tone for rent reminders sent from Hostelrr." />
          <div className="space-y-7 p-5 sm:p-7">
            {hostelProfile?.rent_cycle_type === 'monthly_fixed' && (
              <div className="max-w-sm"><Field label="Monthly rent due date"><select defaultValue="5" className={cn(fieldClassName, 'appearance-none')}>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></Field></div>
            )}
            <Field label="WhatsApp rent reminder" hint="Saved for this hostel">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex-1 min-w-0">
                  <TemplateEditor value={reminderTemplate} onChange={setReminderTemplate} disabled />
                  <span className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"><Lock size={13} /> {getReminderSignature(hostelProfile?.reminderTemplate)} <span className="font-medium text-slate-400">(fixed by Hostelrr)</span></span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenEditTemplate}
                  className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
                >
                  <Edit size={15} /> Edit
                </button>
              </div>
            </Field>
          </div>
        </motion.section>
      );
    }

    if (activeTab === 'security') {
      return (
        <motion.section key="security" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_20px_60px_-32px_rgba(15,23,42,0.28)]">
          <SectionHeader icon={Lock} eyebrow="Account protection" title="Security" description="Keep your account protected with a verified password change flow." />
          <div className="space-y-7 p-5 sm:p-7">
            <div className="max-w-xl space-y-5">
              <Field label="Current password"><div className="flex flex-col gap-2 sm:flex-row"><input type="password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setIsCurrentPasswordVerified(false); }} disabled={isCurrentPasswordVerified} placeholder="Enter your current password" className={cn(fieldClassName, 'sm:flex-1')} /><button type="button" onClick={handleVerifyCurrentPassword} disabled={isVerifyingPassword || isCurrentPasswordVerified || !currentPassword} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-200 disabled:opacity-50">{isVerifyingPassword ? <Loader2 size={16} className="animate-spin" /> : isCurrentPasswordVerified ? <><Check size={16} className="text-emerald-600" /> Verified</> : 'Verify'}</button></div></Field>
              <AnimatePresence>{isCurrentPasswordVerified && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-5"><Field label="New password"><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" className={fieldClassName} /></Field><Field label="Confirm new password"><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your new password" className={fieldClassName} /></Field></motion.div>}</AnimatePresence>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row"><button type="button" onClick={handlePasswordChange} disabled={isChangingPassword || !isCurrentPasswordVerified} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#155dfc] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#155dfc]/20 hover:bg-[#104bc9] disabled:cursor-not-allowed disabled:opacity-50">{isChangingPassword && <Loader2 size={16} className="animate-spin" />}{isChangingPassword ? 'Updating...' : 'Change password'}</button><button onClick={() => setShowLogoutModal(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-extrabold text-rose-600 hover:bg-rose-100"><LogOut size={16} /> Log out account</button></div>
          </div>
        </motion.section>
      );
    }

    return (
      <motion.section key="support" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_20px_60px_-32px_rgba(15,23,42,0.28)]">
        <SectionHeader icon={HelpCircle} eyebrow="Workspace utilities" title="Data & support" description="Take your data with you or get help when you need it." />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">{[['Residents CSV', 'Export your resident directory'], ['Payments CSV', 'Download payment history'], ['Join requests', 'Save recent join requests']].map(([label, description]) => <button key={label} onClick={() => handleExport(label)} className="group flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-[#155dfc]/25 hover:bg-[#155dfc]/5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-[#155dfc]/10 group-hover:text-[#155dfc]"><Download size={17} /></div><div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-slate-800">{label}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div><ChevronRight size={16} className="text-slate-300 group-hover:text-[#155dfc]" /></button>)}<button onClick={openSupportModal} className="group flex items-center gap-4 rounded-2xl border border-[#155dfc]/20 bg-[#155dfc]/5 p-4 text-left transition hover:bg-[#155dfc]/10"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#155dfc]/10 text-[#155dfc]"><CircleHelp size={17} /></div><div className="flex-1"><p className="text-sm font-extrabold text-[#0d3a9e]">Contact support</p><p className="mt-1 text-xs text-[#155dfc]/70">We are here to help</p></div><ChevronRight size={16} className="text-[#155dfc]/60" /></button></div>
      </motion.section>
    );
  };

  return (
    <div className="min-h-full min-w-0 bg-slate-100/60 p-3 pb-4 sm:p-4 md:p-8 lg:pb-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
          <div><h1 className="text-xl font-black tracking-[-0.04em] text-slate-950 sm:text-2xl">Settings</h1></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => navigate(ROUTES.subscription.path)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#155dfc]/20 bg-white px-4 py-2.5 text-sm font-extrabold text-[#155dfc] shadow-sm hover:bg-[#155dfc]/10"><CreditCard size={16} /> Subscription</button>{session?.user?.app_metadata?.platform_role === 'admin' && <button onClick={() => navigate(ROUTES.adminSubscriptions.path)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-600 shadow-sm hover:bg-slate-50"><ShieldCheck size={16} /> Admin</button>}</div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
          <aside className="sticky top-0 z-10 min-w-0 rounded-3xl border border-slate-200/80 bg-white p-2 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.24)] lg:top-6">
            <div className="hidden px-4 pb-3 pt-3 lg:block"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Manage workspace</p></div>
            <nav aria-label="Settings sections" className="flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain no-scrollbar lg:block">
              {TABS.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} title={label} onClick={() => setActiveTab(id)} className={cn('group flex min-w-max items-center gap-3 border-l-2 px-3 py-3 text-left text-sm font-extrabold transition lg:mb-1 lg:w-full', activeTab === id ? 'border-[#155dfc] bg-[#155dfc]/10 text-[#155dfc]' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900')}><Icon size={18} className={cn('shrink-0', activeTab === id ? 'text-[#155dfc]' : 'text-slate-400 group-hover:text-slate-600')} /><span>{label}</span></button>)}
            </nav>
          </aside>
          <main className="min-w-0"><AnimatePresence mode="wait">{renderContent()}</AnimatePresence><div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400"><Smartphone size={13} /> Changes are saved securely to your workspace</div></main>
        </div>
      </div>

      <AnimatePresence>{isSaving && <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-2xl lg:bottom-6"><Loader2 size={16} className="animate-spin text-[#7da8ff]" /> Saving changes...</motion.div>}</AnimatePresence>
      <AnimatePresence>{showLogoutModal && <><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" onClick={() => setShowLogoutModal(false)} /><motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="p-7 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><LogOut size={24} /></div><h3 className="text-xl font-black text-slate-900">Log out of Hostelrr?</h3><p className="mt-2 text-sm leading-6 text-slate-500">You can sign back in anytime to continue managing your property.</p><div className="mt-6 flex gap-3"><button onClick={() => setShowLogoutModal(false)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-200">Cancel</button><button onClick={confirmLogout} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-extrabold text-white hover:bg-rose-700">Log out</button></div></div></motion.div></>}</AnimatePresence>
                 {renderEditTemplateModal()}
    </div>
  );
}
