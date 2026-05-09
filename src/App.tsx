import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { 
  IndianRupee, 
  FileText, 
  Settings as SettingsIcon,
  LayoutDashboard,
  Search,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BedDouble,
  QrCode,
  Users,
  Activity,
  Menu,
  X,
  LogOut,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { cn, getNamesFromIds } from './lib/utils';
import Dashboard from './pages/Dashboard';
import BuildingView from './pages/BuildingView';
import Residents from './pages/Residents';
import Payments from './pages/Payments';
import AddResidentModal from './components/AddResidentModal';

import JoinForm from './pages/JoinForm';

import QRCodeModal from './components/QRCodeModal';

import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import DefaultAvatar from './components/DefaultAvatar';

import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import { supabase } from './supabaseClient';
import { Loader2 } from 'lucide-react';

// Simple types for tabs
type Tab = 'dashboard' | 'building' | 'residents' | 'payments' | 'settings';

function MainApp() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { residents, floors, setGlobalSelectedResidentId, setGlobalSelectedRoomId, addJoinRequest, joinRequests, isDemoMode, toggleDemoMode, hostelProfile } = useApp();
  const [isAddResidentModalOpen, setIsAddResidentModalOpen] = useState(false);
  const [addResidentData, setAddResidentData] = useState<any>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const hostelDisplayName = hostelProfile?.hostelName || 'My Hostel';
  const ownerDisplayName = hostelProfile?.ownerName || 'Hostel Owner';

  const handleSimulateQRRequest = () => {
    const names = ["Rohan Patel", "Vikram Singh", "Aditya Sharma", "Karan Malhotra", "Aarav Gupta"];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomPhone = `+91 ${Math.floor(6000000000 + Math.random() * 3999999999)}`;
    
    addJoinRequest({
      name: randomName,
      phone: randomPhone,
    });
    
    toast.success('New Join Request Received!', {
      description: `${randomName} just submitted a request via QR code.`,
      icon: '🔔',
      duration: 5000,
      action: {
        label: 'View',
        onClick: () => setActiveTab('dashboard')
      }
    });
  };

  React.useEffect(() => {
    const handleOpenAddModal = (e: any) => {
      if (e.detail) {
        setAddResidentData(e.detail);
      } else {
        setAddResidentData({ id: 'new', name: '', phone: '' });
      }
      setIsAddResidentModalOpen(true);
    };
    
    window.addEventListener('open-add-resident-modal', handleOpenAddModal);
    return () => window.removeEventListener('open-add-resident-modal', handleOpenAddModal);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'building', label: 'Rooms & Beds', icon: BedDouble },
    { id: 'residents', label: 'Residents', icon: Users },
    { id: 'payments', label: 'Payments', icon: IndianRupee },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ] as const;

  const handleGlobalSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGlobalSearch(e.target.value);
    setIsSearchOpen(true);
  };

  const calculateSearchResults = () => {
    if (!globalSearch.trim()) return { residents: [], rooms: [] };
    
    const query = globalSearch.toLowerCase();
    
    const matchedResidents = residents.filter(r => 
      r.name.toLowerCase().includes(query) || 
      r.phone.includes(query) ||
      r.roomId.toLowerCase().includes(query)
    );

    const matchedRooms: { floorName: string; number: string; id: string }[] = [];
    floors.forEach(floor => {
      floor.rooms.forEach(room => {
        if (room.number.toLowerCase().includes(query)) {
          matchedRooms.push({ floorName: floor.name, number: room.number, id: room.id });
        }
      });
    });

    return { residents: matchedResidents, rooms: matchedRooms };
  };

  const searchResults = calculateSearchResults();

  const handleSelectResident = (residentId: string) => {
    setGlobalSearch('');
    setIsSearchOpen(false);
    setGlobalSelectedResidentId(residentId);
    setActiveTab('residents');
  };

  const handleSelectRoom = (roomId: string) => {
    setGlobalSearch('');
    setIsSearchOpen(false);
    setGlobalSelectedRoomId(roomId);
    setActiveTab('building');
  };

  const renderContent = () => {
    const setTab = (t: string) => setActiveTab(t as Tab);
    switch (activeTab) {
      case 'dashboard': return <Dashboard setActiveTab={setTab} />;
      case 'building': return <BuildingView setActiveTab={setTab} />;
      case 'residents': return <Residents />;
      case 'payments': return <Payments setActiveTab={setTab} />;
      case 'settings': return <Settings />;
      default: return <Dashboard setActiveTab={setTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "bg-white border-r border-gray-200 flex flex-col fixed h-full z-40 transition-all duration-300",
        isSidebarCollapsed ? "md:w-20" : "md:w-64",
        "w-64 md:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Collapse toggle button (desktop only) */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden md:flex absolute -right-3 top-8 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 shadow-sm transition-colors z-20 cursor-pointer"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>
        {/* Close button (mobile only) */}
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          className="md:hidden absolute right-4 top-6 text-gray-400 hover:text-gray-600 focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        <div className={cn("p-6 flex items-center transition-all", isSidebarCollapsed ? "md:justify-center" : "gap-2")}>
          <div className="flex items-center gap-2 text-blue-600">
            <img 
              src="https://res.cloudinary.com/dfkfysygf/image/upload/v1778354944/20260510_005330_xrv4xj.jpg" 
              alt="Hostelrr Logo" 
              className="w-10 h-10 shrink-0 rounded-lg object-cover"
            />
            <span className={cn("text-2xl font-bold tracking-tight transition-opacity", isSidebarCollapsed ? "md:hidden" : "block")}>Hostelrr</span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const badgeCount = item.id === 'dashboard' ? joinRequests.length : 0;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                title={isSidebarCollapsed ? item.label : undefined}
                className={cn(
                  "w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative",
                  isSidebarCollapsed ? "md:justify-center justify-between" : "justify-between",
                  isActive 
                    ? "bg-blue-50 text-blue-700" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <div className={cn("flex items-center gap-3", isSidebarCollapsed && "md:justify-center")}>
                  <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-blue-600" : "text-gray-400")} />
                  <span className={cn(isSidebarCollapsed ? "md:hidden" : "block")}>{item.label}</span>
                </div>
                {badgeCount > 0 && (
                  <span className={cn(
                    "flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold h-5 w-5 rounded-full shrink-0",
                    isSidebarCollapsed && "md:absolute md:top-2 md:right-2 md:h-4 md:w-4 md:text-[9px]"
                  )}>
                    {badgeCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="mx-4 mb-4 mt-2">
          {isSidebarCollapsed ? (
            <button 
              onClick={() => toggleDemoMode(!isDemoMode)}
              title="Toggle Demo Mode"
              className="w-full hidden md:flex justify-center items-center p-3 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
            >
              <Activity className="w-5 h-5" />
            </button>
          ) : null}
          
          <label className={cn(
            "flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-xl cursor-pointer hover:bg-indigo-100/70 transition-colors",
            isSidebarCollapsed ? "md:hidden" : "flex"
          )}>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-indigo-900">Demo Mode</span>
            </div>
            <div className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none", isDemoMode ? "bg-indigo-600" : "bg-gray-300")}>
              <span className="sr-only">Toggle Demo Mode</span>
              <span aria-hidden="true" className={cn("pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white ring-0 transition duration-200 ease-in-out", isDemoMode ? "translate-x-2" : "-translate-x-2")} />
            </div>
            <input type="checkbox" className="sr-only" checked={isDemoMode} onChange={(e) => toggleDemoMode(e.target.checked)} />
          </label>
        </div>
        
        <div className={cn(
          "mx-4 mb-4 p-4 bg-gray-50/50 border border-gray-100 rounded-2xl transition-all",
          isSidebarCollapsed ? "md:hidden" : "block"
        )}>
          <p className="text-[11px] font-semibold text-gray-500 mb-0.5 tracking-wider uppercase">NEED HELP?</p>
          <p className="text-[13px] text-gray-800">Call us at</p>
          <p className="text-[14px] font-bold text-blue-600">+91 7330744800</p>
        </div>

        <div className="p-4 border-t border-gray-100 relative">
          <AnimatePresence>
            {isProfileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-20 left-4 right-4 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden"
              >
                <button
                  onClick={async () => {
                    toast.success('Logging out...');
                    await supabase.auth.signOut();
                    window.location.href = '/';
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors font-semibold text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div 
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className={cn(
              "flex items-center gap-3 px-2 py-2 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer transition-all hover:bg-gray-100", 
              isSidebarCollapsed && "md:justify-center md:px-0 md:bg-transparent md:border-transparent",
              isProfileMenuOpen && "bg-gray-100 ring-2 ring-gray-200/50"
            )}
          >
            <div className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 overflow-hidden shrink-0">
              <DefaultAvatar className="w-full h-full" />
            </div>
            <div className={cn("flex-1 min-w-0 transition-opacity", isSidebarCollapsed ? "md:hidden" : "block")}>
              <p className="text-sm font-medium text-gray-900 truncate">{ownerDisplayName}</p>
              <p className="text-xs text-gray-500 truncate">Owner</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn("flex-1 flex flex-col min-h-screen relative transition-all duration-300 w-full", isSidebarCollapsed ? "md:ml-20" : "md:ml-64")}>
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2 py-1.5 px-4 border border-gray-200 rounded-xl bg-gray-50/50 shadow-sm">
              <span className="font-semibold text-gray-800">{hostelDisplayName}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <div className="relative z-50">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search residents, rooms..." 
                value={globalSearch}
                onChange={handleGlobalSearchChange}
                onFocus={() => { if(globalSearch) setIsSearchOpen(true) }}
                className="pl-10 pr-4 py-2.5 bg-gray-50/50 hover:bg-gray-100 border border-gray-200/60 rounded-full text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white w-64 md:w-80 transition-all shadow-sm"
              />

              {/* Global Search Dropdown */}
              {isSearchOpen && globalSearch.trim().length > 0 && (
                <>
                  <div className="fixed inset-0 z-[-1]" onClick={() => setIsSearchOpen(false)}></div>
                  <div className="absolute top-12 right-0 w-80 bg-white shadow-xl border border-gray-100 rounded-2xl overflow-hidden py-2" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    
                    {searchResults.residents.length === 0 && searchResults.rooms.length === 0 ? (
                      <div className="p-6 text-center text-gray-500 text-sm">
                        No results found for "{globalSearch}"
                      </div>
                    ) : (
                      <>
                        {searchResults.residents.length > 0 && (
                          <div className="px-3 pb-2 pt-1 mb-1 border-b border-gray-100">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 block mb-2">Residents</span>
                            {searchResults.residents.map(r => (
                              <button 
                                key={r.id} 
                                onClick={() => handleSelectResident(r.id)}
                                className="w-full text-left flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                              >
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{r.name}</div>
                                  <div className="text-xs text-gray-500">Room {getNamesFromIds(floors, r.roomId, undefined).roomName}</div>
                                </div>
                                <Users className="w-4 h-4 text-gray-400" />
                              </button>
                            ))}
                          </div>
                        )}

                        {searchResults.rooms.length > 0 && (
                          <div className="px-3 py-1">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 block mb-2">Rooms</span>
                            {searchResults.rooms.map(room => (
                              <button 
                                key={room.id}
                                onClick={() => handleSelectRoom(room.id)}
                                className="w-full text-left flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                              >
                                <div>
                                  <div className="text-sm font-medium text-gray-900">Room {room.number}</div>
                                  <div className="text-xs text-gray-500">{room.floorName}</div>
                                </div>
                                <BedDouble className="w-4 h-4 text-gray-400" />
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <button 
              onClick={() => setIsQRModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Hostel QR</span>
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Help</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1">
          {renderContent()}
        </div>
      </main>
      <AddResidentModal 
        isOpen={isAddResidentModalOpen} 
        onClose={() => setIsAddResidentModalOpen(false)} 
        reAddData={addResidentData} 
      />
      <QRCodeModal 
        isOpen={isQRModalOpen} 
        onClose={() => setIsQRModalOpen(false)} 
      />
      <Toaster position="top-right" richColors expand={true} visibleToasts={9} closeButton />
    </div>
  );
}

function AppContent() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const { isOnboardingComplete, isDataLoading, session, authLoading } = useApp();

  React.useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const isJoinRoute = currentPath.startsWith('/join');
  const isSignInRoute = currentPath.startsWith('/signin');
  const isSignUpRoute = currentPath.startsWith('/signup');

  if (isJoinRoute) {
    return <JoinForm />;
  }

  if (authLoading || isDataLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  // Auth routing
  if (!session) {
    if (isSignUpRoute) return <SignUp />;
    return <SignIn />; // Default to signin if not authenticated
  }

  if (!isOnboardingComplete) {
    return <Onboarding />;
  }

  return <MainApp />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
