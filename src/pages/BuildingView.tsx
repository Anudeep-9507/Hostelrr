import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { useApp } from '../context/AppContext';
import { Room, Bed, Resident } from '../data/mock';
import DefaultAvatar from '../components/DefaultAvatar';
import { cn, formatDate, getNamesFromIds } from '../lib/utils';
import { X, UserPlus, LogOut, Phone, IndianRupee, FileText, Plus, User, LayoutTemplate, Trash2, BedDouble, Search, ChevronDown, Copy, Eye } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import EmptyState from '../components/EmptyState';
import { toast } from 'sonner';
import BedLayoutBuilder, { LAYOUT_COLORS, Template } from '../components/BedLayoutBuilder';
import { getBedLayoutTemplates } from '../lib/supabaseAPI';
import useAsyncAction from '../hooks/useAsyncAction';

function getStatusColor(status: Bed['status']) {
  switch (status) {
    case 'vacant': return 'bg-red-500';
    case 'occupied': return 'bg-green-500';
    case 'payment_due': return 'bg-amber-500';
    case 'reserved': return 'bg-blue-500';
    default: return 'bg-gray-500';
  }
}

function getBedPillStyles(status: Bed['status']) {
  switch (status) {
    case 'vacant': 
      return { container: 'bg-[#FFEBEE] border-[#FFCDD2] text-[#C62828]', dot: 'bg-[#F44336]' };
    case 'occupied': 
      return { container: 'bg-[#E8F5E9] border-[#A5D6A7] text-[#2E7D32]', dot: 'bg-[#4CAF50]' };
    case 'payment_due': 
      return { container: 'bg-[#FFF8E1] border-[#FFE082] text-[#FF8F00]', dot: 'bg-[#FFC107]' };
    case 'reserved': 
      return { container: 'bg-[#E3F2FD] border-[#90CAF9] text-[#1565C0]', dot: 'bg-[#2196F3]' };
    default: 
      return { container: 'bg-gray-50 border-gray-300 text-gray-700', dot: 'bg-gray-500' };
  }
}

function isBedMatch(status: Bed['status'], filter: Bed['status'] | 'all') {
  if (filter === 'occupied' && status === 'payment_due') return true;
  return filter === 'all' || status === filter;
}

export default function BuildingView() {
  const navigate = useNavigate();
  const { floors, residents, activeBuildingFilter: filterStatus, setActiveBuildingFilter: setFilterStatus, globalSelectedRoomId, setGlobalSelectedRoomId, vacateResident, setGlobalSelectedResidentId, addRoom, editRoomBeds, updateRoomSetup, deleteRoom, moveBeds, sharingRentMap, copyFloorLayout, hostelProfile } = useApp();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [residentToVacate, setResidentToVacate] = useState<Resident | null>(null);
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [isEditRoomModalOpen, setIsEditRoomModalOpen] = useState(false);
  const [editModalTab, setEditModalTab] = useState<'add' | 'move'>('add');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [editRoomBedsNum, setEditRoomBedsNum] = useState('');
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [editRoomRent, setEditRoomRent] = useState('');
  const [isEditCustomSharing, setIsEditCustomSharing] = useState(false);
  const [editCustomSharingValue, setEditCustomSharingValue] = useState('');
  const [moveTargetRoomId, setMoveTargetRoomId] = useState('');
  const [selectedBedsToMove, setSelectedBedsToMove] = useState<string[]>([]);
  const [addRoomFloorId, setAddRoomFloorId] = useState<string | null>(null);
  const [isBedLayoutModalOpen, setIsBedLayoutModalOpen] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomBeds, setNewRoomBeds] = useState('');
  const [newRoomRent, setNewRoomRent] = useState('');
  const [isSetupMode, setIsSetupMode] = useState(false); // true = setting up existing empty room
  const [setupRoomId, setSetupRoomId] = useState<string | null>(null);
  const [isCustomSharing, setIsCustomSharing] = useState(false);
  const [customSharingValue, setCustomSharingValue] = useState('');
  const [showDeleteRoomConfirmation, setShowDeleteRoomConfirmation] = useState(false);
  const [selectedFloorFilter, setSelectedFloorFilter] = useState<string>('all');
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
  const [showBedLayout, setShowBedLayout] = useState(() => {
    const saved = localStorage.getItem('hostelrr_show_bed_layout');
    return saved ? JSON.parse(saved) : true;
  });
  const [isCopyLayoutModalOpen, setIsCopyLayoutModalOpen] = useState(false);
  const [targetFloorForCopy, setTargetFloorForCopy] = useState<string | null>(null);
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>('');
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  const getDefaultLayoutId = (sharing: number) => `default_${sharing}`;
  const isDefaultLayoutId = (layoutId: string | null) => layoutId?.startsWith('default_');

  React.useEffect(() => {
    if (!hostelProfile?.id) {
      setAllTemplates([]);
      return;
    }

    const loadTemplates = async () => {
      try {
        const templates = await getBedLayoutTemplates(hostelProfile.id);
        setAllTemplates(templates);
      } catch (error) {
        console.error('Failed to load templates:', error);
        setAllTemplates([]);
      }
    };

    loadTemplates();
  }, [isAddRoomModalOpen, isBedLayoutModalOpen, hostelProfile?.id]);

  React.useEffect(() => {
    const currentSharing = isCustomSharing ? parseInt(customSharingValue) : parseInt(newRoomBeds);
    if (isNaN(currentSharing) || currentSharing <= 0) {
      setSelectedLayoutId('');
      return;
    }

    const templates = allTemplates.filter(t => t.sharing === currentSharing);
    if (templates.length > 0) {
      setSelectedLayoutId(templates[0].id);
    } else {
      setSelectedLayoutId(getDefaultLayoutId(currentSharing));
    }
  }, [newRoomBeds, customSharingValue, isCustomSharing, allTemplates]);

  // Auto-select first layout version for Edit Room modal
  React.useEffect(() => {
    if (isEditRoomModalOpen && editModalTab === 'add') {
      const currentSharing = parseInt(editRoomBedsNum);
      if (!isNaN(currentSharing)) {
        const templates = allTemplates.filter(t => t.sharing === currentSharing);
        if (templates.length > 0) {
          // If the room already has this sharing type and we just opened it, keep current layoutId
          // Otherwise if sharing changed, pick first template
          const alreadyMatched = currentRoom && currentRoom.beds.length === currentSharing;
          if (alreadyMatched && currentRoom.layoutId && selectedLayoutId === currentRoom.layoutId) {
             // Keep it
          } else if (!templates.some(t => t.id === selectedLayoutId)) {
             setSelectedLayoutId(templates[0].id);
          }
        } else {
          setSelectedLayoutId('');
        }
      }
    }
  }, [editRoomBedsNum, isEditRoomModalOpen, editModalTab, allTemplates]);

  React.useEffect(() => {
    localStorage.setItem('hostelrr_show_bed_layout', JSON.stringify(showBedLayout));
  }, [showBedLayout]);

  const { execute: executeSaveRoom, isLoading: isSavingRoom } = useAsyncAction(async () => {
    const bedsCount = isCustomSharing ? parseInt(customSharingValue) : parseInt(newRoomBeds);
    const layoutIdToSave = isDefaultLayoutId(selectedLayoutId) ? undefined : selectedLayoutId || undefined;

    if (isSetupMode && setupRoomId && addRoomFloorId) {
      await updateRoomSetup(addRoomFloorId, setupRoomId, bedsCount, parseInt(newRoomRent || '0'), newRoomNumber, layoutIdToSave);
      toast.success(`Room ${newRoomNumber} set up successfully`);
    } else if (addRoomFloorId) {
      await addRoom(addRoomFloorId, {
        number: newRoomNumber,
        numBeds: bedsCount,
        baseRent: newRoomRent,
        layoutId: layoutIdToSave
      });
      toast.success(`Room ${newRoomNumber} added successfully`);
    }
    
    setIsAddRoomModalOpen(false);
    setNewRoomNumber('');
    setNewRoomBeds('');
    setNewRoomRent('');
    setIsSetupMode(false);
    setSetupRoomId(null);
    setIsCustomSharing(false);
    setCustomSharingValue('');
  });

  const openSetupRoomModal = (floorId: string, room: Room) => {
    setAddRoomFloorId(floorId);
    setSetupRoomId(room.id);
    setNewRoomNumber(room.number);
    setNewRoomBeds('');
    setNewRoomRent('');
    setSelectedLayoutId('');
    setIsCustomSharing(false);
    setCustomSharingValue('');
    setIsSetupMode(true);
    setIsAddRoomModalOpen(true);
  };

  const currentRoomFloorId = useMemo(() => {
    if (!selectedRoom) return null;
    return floors.find(f => f.rooms.some(r => r.id === selectedRoom.id))?.id || null;
  }, [floors, selectedRoom]);

  const currentRoom = useMemo(() => {
    if (!selectedRoom) return null;
    for (const floor of floors) {
      const room = floor.rooms.find(r => r.id === selectedRoom.id);
      if (room) return room;
    }
    return null;
  }, [floors, selectedRoom]);

  const { execute: executeSaveEditRoomBeds, isLoading: isSavingEditRoomBeds } = useAsyncAction(async () => {
    if (!currentRoom || !currentRoomFloorId) return;
    
    const numBeds = isEditCustomSharing ? parseInt(editCustomSharingValue) : parseInt(editRoomBedsNum);
    if (isNaN(numBeds) || numBeds < 0) {
      toast.error("Invalid number of beds");
      return;
    }
    
    if (!editRoomNumber.trim()) {
      toast.error("Room number cannot be empty");
      return;
    }

    if (numBeds < currentRoom.beds.length) {
      // Check if beds being removed are occupied
      const bedsToRemove = currentRoom.beds.slice(numBeds);
      if (bedsToRemove.some(b => b.status !== 'vacant')) {
        toast.error("Cannot remove occupied beds. Vacate them first.");
        return;
      }
    }

    await updateRoomSetup(currentRoomFloorId, currentRoom.id, numBeds, parseInt(editRoomRent || '0'), editRoomNumber, selectedLayoutId);
    toast.success(`Room updated successfully`);
    setIsEditRoomModalOpen(false);
  });

  const { execute: executeMoveBeds, isLoading: isMovingBeds } = useAsyncAction(async () => {
    if (!currentRoom || !moveTargetRoomId || selectedBedsToMove.length === 0) return;
    
    await moveBeds(currentRoom.id, moveTargetRoomId, selectedBedsToMove);
    toast.success(`Moved ${selectedBedsToMove.length} bed(s) to selected room successfully`);
    setIsEditRoomModalOpen(false);
    setRoomSearchQuery('');
  });

  const { execute: executeCopyLayout, isLoading: isCopyingLayout } = useAsyncAction(async (sourceFloorId: string) => {
    if (!targetFloorForCopy) return;
    
    // Check if target floor has residents
    const targetFloor = floors.find(f => f.id === targetFloorForCopy);
    const hasResidents = targetFloor?.rooms.some(r => r.beds.some(b => b.status !== 'vacant'));
    
    if (hasResidents) {
      toast.error("Cannot copy layout to a floor with residents. Vacate them first.");
      return;
    }
    
    await copyFloorLayout(sourceFloorId, targetFloorForCopy);
    toast.success(`Layout copied from ${floors.find(f => f.id === sourceFloorId)?.name} successfully`);
    setIsCopyLayoutModalOpen(false);
    setTargetFloorForCopy(null);
  });

  const { execute: executeDeleteRoom, isLoading: isDeletingRoom } = useAsyncAction(async () => {
    if (currentRoomFloorId && currentRoom) {
      await deleteRoom(currentRoomFloorId, currentRoom.id);
      toast.success(`Room ${currentRoom.number} deleted successfully`);
      setIsEditRoomModalOpen(false);
      setSelectedRoom(null);
      setShowDeleteConfirmation(false);
    }
  });

  const { execute: executeDeleteSetupRoom, isLoading: isDeletingSetupRoom } = useAsyncAction(async () => {
    if (addRoomFloorId && setupRoomId) {
      await deleteRoom(addRoomFloorId, setupRoomId);
      toast.success(`Room ${newRoomNumber} deleted successfully`);
      setShowDeleteRoomConfirmation(false);
      setIsAddRoomModalOpen(false);
      setSetupRoomId(null);
    }
  });

  const { execute: executeVacateResident, isLoading: isVacatingResident } = useAsyncAction(async () => {
    if (residentToVacate) {
      await vacateResident(residentToVacate.id);
      setResidentToVacate(null);
    }
  });

  React.useEffect(() => {
    if (globalSelectedRoomId) {
      for (const floor of floors) {
        const found = floor.rooms.find(r => r.id === globalSelectedRoomId);
        if (found) {
          setSelectedRoom(found);
          break;
        }
      }
      setGlobalSelectedRoomId(null);
    }
  }, [globalSelectedRoomId, floors, setGlobalSelectedRoomId]);

  const handleRoomClick = (room: Room) => {
    setSelectedRoom(room);
  };

  const closeDrawer = () => {
    setSelectedRoom(null);
  };

  const openAddRoomModal = (floorId: string) => {
    setAddRoomFloorId(floorId);
    setIsAddRoomModalOpen(true);
  };

  // Helper to toggle filters
  const toggleFilter = (status: Bed['status']) => {
    setFilterStatus(filterStatus === status ? 'all' : status);
  };

  const allBeds = floors.flatMap(f => f.rooms).flatMap(r => r.beds);
  
  const configuredBedsCount = allBeds.length;
  const occupiedCount = allBeds.filter(b => b.status === "occupied" || b.status === "payment_due").length;
  const reservedCount = allBeds.filter(b => b.status === "reserved").length;
  const totalBeds = Math.max(hostelProfile?.total_beds || 0, configuredBedsCount);
  const vacantBeds = allBeds.filter(b => b.status === 'vacant').length;

  const counts = {
    all: totalBeds,
    occupied: occupiedCount,
    vacant: vacantBeds,
    payment_due: allBeds.filter(b => b.status === "payment_due").length,
    reserved: reservedCount,
  };

  const isBedMatch = (bedStatus: Bed['status'], currentFilter: Bed['status'] | 'all') => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'occupied') return bedStatus === 'occupied' || bedStatus === 'payment_due';
    return bedStatus === currentFilter;
  };

  return (
    <div className="h-[calc(100vh-64px)] flex relative overflow-hidden">
      
      {/* Scrollable Layout Area */}
      <div className={cn(
        "flex-1 overflow-y-auto p-4 md:p-8 transition-all duration-300"
      )}>
        <div className="max-w-7xl mx-auto space-y-6 pb-12">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5 md:mb-8 shrink-0 min-w-0">
            <div className="min-w-0 shrink-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight whitespace-nowrap">Rooms & Beds</h1>
                <button
                  onClick={() => setIsBedLayoutModalOpen(true)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-2 sm:p-1.5 rounded-lg text-sm font-medium transition-colors min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 flex items-center justify-center shrink-0"
                  title="Configure Bed Layout Templates"
                >
                  <LayoutTemplate className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm sm:text-base text-gray-500 whitespace-nowrap">Live status of all floors and rooms.</p>
            </div>
          </div>
            
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4 mb-5 md:mb-6 shrink-0 min-w-0">
              <select 
                value={selectedFloorFilter} 
                onChange={(e) => setSelectedFloorFilter(e.target.value)}
                className="bg-white border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block px-4 py-2 outline-none font-medium shadow-sm transition-all h-full"
              >
                <option value="all">All Floors</option>
                {floors.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>

              {/* Legend / Filters */}
              <div className="bg-gray-100/80 p-1.5 rounded-[14px] flex gap-1.5 items-center justify-start overflow-x-auto w-full sm:w-auto border border-gray-200/60 shadow-sm no-scrollbar">
              <button 
                onClick={() => setFilterStatus('all')}
                className={cn("px-4 py-2 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap", filterStatus === 'all' ? "bg-white text-gray-900 shadow-md ring-1 ring-black/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50")}
              >
                All
                <span className={cn("px-2 py-0.5 rounded-md text-xs", filterStatus === 'all' ? "bg-gray-100 text-gray-900" : "bg-gray-200/50 text-gray-500")}>{counts.all}</span>
              </button>
              <button 
                onClick={() => setFilterStatus('occupied')}
                className={cn("px-4 py-2 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap", filterStatus === 'occupied' ? "bg-white text-green-700 shadow-md ring-1 ring-black/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50")}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>Occupied
                <span className={cn("px-2 py-0.5 rounded-md text-xs", filterStatus === 'occupied' ? "bg-green-100 text-green-700" : "bg-gray-200/50 text-gray-500")}>{counts.occupied}</span>
              </button>
              <button 
                onClick={() => setFilterStatus('vacant')}
                className={cn("px-4 py-2 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap", filterStatus === 'vacant' ? "bg-white text-red-700 shadow-md ring-1 ring-black/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50")}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>Vacant
                <span className={cn("px-2 py-0.5 rounded-md text-xs", filterStatus === 'vacant' ? "bg-red-100 text-red-700" : "bg-gray-200/50 text-gray-500")}>{counts.vacant}</span>
              </button>
              <button 
                onClick={() => setFilterStatus('payment_due')}
                className={cn("px-4 py-2 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap", filterStatus === 'payment_due' ? "bg-white text-amber-700 shadow-md ring-1 ring-black/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50")}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>Payment Due
                <span className={cn("px-2 py-0.5 rounded-md text-xs", filterStatus === 'payment_due' ? "bg-amber-100 text-amber-700" : "bg-gray-200/50 text-gray-500")}>{counts.payment_due}</span>
              </button>
              <button 
                onClick={() => setFilterStatus('reserved')}
                className={cn("px-4 py-2 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap", filterStatus === 'reserved' ? "bg-white text-blue-700 shadow-md ring-1 ring-black/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50")}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>Reserved
                <span className={cn("px-2 py-0.5 rounded-md text-xs", filterStatus === 'reserved' ? "bg-blue-100 text-blue-700" : "bg-gray-200/50 text-gray-500")}>{counts.reserved}</span>
              </button>
              
              <div className="w-px h-8 bg-gray-200 mx-1 hidden sm:block"></div>

              <div className="flex items-center gap-2 pl-2">
                <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">Bed Layout</span>
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
            </div>

          <div className="space-y-6">
            {(() => {
              const floorsToRender = floors.filter(floor => selectedFloorFilter === 'all' || floor.id === selectedFloorFilter);
              
              if (floorsToRender.length === 0) {
                return (
                  <div className="py-12 flex justify-center">
                    <EmptyState 
                      icon={LayoutTemplate}
                      title="No floors found"
                      subtitle="There are no floors matching your current view."
                    />
                  </div>
                );
              }

              const renderedFloors = floorsToRender.map((floor) => {
                const filteredRooms = filterStatus === 'all'
                  ? floor.rooms
                  : floor.rooms.filter(room => {
                      if (filterStatus === 'vacant' && room.beds.length === 0) return true;
                      return room.beds.some(b => isBedMatch(b.status, filterStatus));
                    });

                if (filteredRooms.length === 0 && filterStatus !== 'all') return null;

                return (
                  <div key={floor.id} className="bg-white rounded-3xl p-5 md:p-6 border border-gray-200 shadow-sm">

                  <div className="mb-4 flex justify-between items-center border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-4">
                      <h2 className="text-xl font-bold text-gray-900">{floor.name}</h2>
                      <button
                        onClick={() => {
                          setTargetFloorForCopy(floor.id);
                          setIsCopyLayoutModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition-all border border-blue-100"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Layout
                      </button>
                    </div>
                    <span className="text-sm font-medium text-gray-500">
                      {filteredRooms.length} rooms
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredRooms.map((room, idx) => {
                      const labelSorter = (a: any, b: any) => String(a.name).replace(/^Bed\s+/i, '').localeCompare(String(b.name).replace(/^Bed\s+/i, ''), undefined, { numeric: true, sensitivity: 'base' });
                      const sortedBeds = (room.beds || []).slice().sort(labelSorter);
                      const isSelected = selectedRoom?.id === room.id;
                      const isEmpty = sortedBeds.length === 0;
                      const allVacant = !isEmpty && sortedBeds.every(b => b.status === 'vacant');

                      // Empty room (not yet set up) — match regular card style but with Set Up Room CTA
                      if (isEmpty) {
                        const floorObj = floors.find(f => f.rooms.some(r => r.id === room.id));
                        return (
                          <div 
                            key={`${room.id}-${idx}`}
                            onClick={() => floorObj && openSetupRoomModal(floorObj.id, room)}
                            className="rounded-2xl border-2 border-dashed border-gray-200 p-5 bg-white transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:border-blue-200 hover:bg-blue-50/10 group cursor-pointer"
                          >
                            <div className="flex justify-between items-start mb-4">
                              <h3 className="text-xl font-bold text-blue-600 group-hover:text-blue-700 transition-colors">Room {room.number}</h3>
                              <span className="text-sm font-medium text-gray-400 group-hover:text-blue-400 transition-colors">0/0 beds</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <div
                                className="flex items-center gap-1.5 bg-[#1D4ED8] group-hover:bg-[#1e40af] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm group-hover:shadow-md"
                              >
                                <BedDouble className="w-4 h-4" /> Set Up Room
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                      <div 
                        key={`${room.id}-${idx}`}
                        onClick={() => handleRoomClick(room)}
                        className={cn(
                          "rounded-2xl border-2 p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg group bg-white overflow-visible",
                          isSelected ? "border-blue-500 shadow-lg ring-4 ring-blue-50" : "border-gray-200 hover:border-blue-200",
                          allVacant ? "bg-red-50/10 hover:bg-red-50/30" : ""
                        )}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Room {room.number}</h3>
                          <span className="text-sm font-medium text-gray-500">
                            {room.beds.filter(b => b.status === 'occupied' || b.status === 'payment_due').length}/{room.beds.length} beds
                          </span>
                        </div>
                        
                        {showBedLayout ? (
                          (() => {
                            let template: Template | null = null;
                            if (room.layoutId) {
                              template = allTemplates.find(t => t.id === room.layoutId) || null;
                              if (template && template.sharing !== room.beds.length) {
                                template = null;
                              }
                            }
                            
                            // Fallback to searching by sharing type if no layoutId or template not found
                            if (!template) {
                              template = allTemplates.find(t => t.sharing === room.beds.length) || null;
                            }
                            
                            const resolvedTemplate = template;
                            if (!resolvedTemplate) {
                              return (
                                <div className="flex flex-wrap gap-3 max-w-full">
                                  {sortedBeds
                                    .filter(bed => isBedMatch(bed.status, filterStatus))
                                    .map((bed, bedIdx) => {
                                    const styles = getBedPillStyles(bed.status);
                                    return (
                                      <div key={`${bed.id}-${bedIdx}`} className={cn("flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-semibold", styles.container)}>
                                        <span>{bed.name}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              );
                            }

                            const hasValidTemplate = sortedBeds.every(bed => {
                              const label = bed.name.replace(/^Bed\s+/i, '').trim();
                              return Boolean(resolvedTemplate.positions?.[label]);
                            });

                            if (!hasValidTemplate) {
                              return (
                                <div className="flex flex-wrap gap-3 max-w-full">
                                  {sortedBeds
                                    .filter(bed => isBedMatch(bed.status, filterStatus))
                                    .map((bed, bedIdx) => {
                                    const styles = getBedPillStyles(bed.status);
                                    return (
                                      <div key={`${bed.id}-${bedIdx}`} className={cn("flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-semibold", styles.container)}>
                                        <span>{bed.name}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              );
                            }

                            return (
                              <div className="relative w-full mx-auto aspect-[4/5] bg-white rounded-xl overflow-visible">
                                {/* Miniature door */}
                                {resolvedTemplate.door && (
                                  <div className={cn(
                                    "absolute bg-amber-700/20 rounded-sm z-0",
                                    resolvedTemplate.door === 'N' && "top-0 left-1/2 -translate-x-1/2 w-10 h-1",
                                    resolvedTemplate.door === 'S' && "bottom-0 left-1/2 -translate-x-1/2 w-10 h-1",
                                    resolvedTemplate.door === 'E' && "right-0 top-1/2 -translate-y-1/2 w-1 h-10",
                                    resolvedTemplate.door === 'W' && "left-0 top-1/2 -translate-y-1/2 w-1 h-10"
                                  )} />
                                )}

                                {sortedBeds.map((bed) => {
                                  // Extract label from bed.name ('Bed A' → 'A') so
                                  // template position lookup is correct regardless of
                                  // DB fetch order — never use iteration index here.
                                  const label = bed.name.replace(/^Bed\s+/i, '').trim();
                                  const pos = resolvedTemplate.positions[label];
                                  if (!pos) return null;
                                  const styles = getBedPillStyles(bed.status);
                                  
                                  // Auto-align beds to a 24px grid to fix minor drag-and-drop misalignments
                                  const GRID_SIZE = 24;
                                  const snappedX = Math.round(pos.x / GRID_SIZE) * GRID_SIZE;
                                  const snappedY = Math.round(pos.y / GRID_SIZE) * GRID_SIZE;
                                  
                                  const scaleX = (snappedX / 320) * 100;
                                  const scaleY = (snappedY / 400) * 100;
                                  const xOffsetPct = 16;
                                  const yOffsetPct = 2;
    

                                  const isFiltered = !isBedMatch(bed.status, filterStatus);

                                  // Compute responsive width/height as percentages of the
                                  // base canvas (320x400). Use transform to center the
                                  // bed box at the (left,top) coordinate so scaling works
                                  // consistently across card sizes.
                                  const bedWidthPx = pos.rotated ? 44 : 96;
                                  const bedHeightPx = pos.rotated ? 96 : 44;
                                  const widthPct = (bedWidthPx / 320) * 100;
                                  const heightPct = (bedHeightPx / 400) * 100;

                                  const centerX = Math.min(
                                    Math.max(scaleX + xOffsetPct, widthPct / 2),
                                    100 - widthPct / 2
                                  );
                                  const centerY = Math.min(
                                    Math.max(scaleY + yOffsetPct, heightPct / 2),
                                    100 - heightPct / 2
                                  );

                                  return (
                                    <div
                                      key={bed.id}
                                      style={{
                                        left: `${centerX}%`,
                                        top: `${centerY}%`,
                                        width: `${widthPct}%`,
                                        height: `${heightPct}%`,
                                        transform: 'translate(-50%, -50%)',
                                        opacity: isFiltered ? 0.2 : 1,
                                        zIndex: 1,
                                        pointerEvents: 'auto'
                                      }}
                                      className={cn(
                                        "absolute flex items-center justify-center rounded-lg border text-sm font-medium transition-all shadow-sm bg-white overflow-hidden",
                                        styles.container
                                      )}
                                    >
                                      <span className={pos.rotated ? "-rotate-90 whitespace-nowrap" : ""}>{bed.name}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()
                        ) : (
                          <div className="flex flex-wrap gap-3 max-w-full">
                                {sortedBeds
                              .filter(bed => isBedMatch(bed.status, filterStatus))
                              .map((bed, bedIdx) => {
                              const styles = getBedPillStyles(bed.status);
                              return (
                                <div key={`${bed.id}-${bedIdx}`} className={cn("flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-semibold", styles.container)}>
                                  <span>{bed.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      );
                    })}
                    
                    {/* Add Room Card - show for each floor regardless of current filter */}
                    <div 
                      onClick={() => {
                        setIsSetupMode(false);
                        setNewRoomNumber('');
                        openAddRoomModal(floor.id);
                      }}
                      className="rounded-2xl border-2 border-dashed border-gray-200 p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:border-blue-300 hover:bg-white flex flex-col items-center justify-center min-h-[140px] group"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-2 group-hover:bg-blue-100 transition-colors">
                        <Plus className="w-5 h-5 text-blue-600" />
                      </div>
                      <span className="text-base font-bold text-gray-700 group-hover:text-blue-600 transition-colors">Add Room</span>
                    </div>
                  </div>
                </div>
              );
              }).filter(Boolean);

              if (renderedFloors.length === 0) {
                return (
                  <div className="bg-white rounded-3xl p-12 border border-gray-200 border-dashed shadow-sm flex flex-col items-center justify-center text-center col-span-full">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <BedDouble className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No Rooms Found</h3>
                    <p className="text-gray-500 max-w-sm">
                      There are no rooms matching the "{filterStatus}" filter criteria.
                    </p>
                  </div>
                );
              }

              return renderedFloors;
            })()}
          </div>

        </div>
      </div>

      {/* Add Room Modal */}
      <AnimatePresence>
        {isAddRoomModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
              onClick={() => setIsAddRoomModalOpen(false)}
            ></div>
            
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-[480px] relative z-10 overflow-hidden flex flex-col">
              <div className="flex justify-between items-center p-6 pb-2">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{isSetupMode ? `Set Up Room ${newRoomNumber}` : 'Add New Room'}</h2>
                  <p className="text-sm text-gray-500 mt-1">Floor {floors.find(f => f.id === addRoomFloorId)?.name}</p>
                </div>
                <button 
                  onClick={() => setIsAddRoomModalOpen(false)}
                  className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Room Number <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={newRoomNumber}
                    onChange={(e) => setNewRoomNumber(e.target.value)}
                    placeholder="e.g. 101" 
                    className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Sharing Type <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select 
                      value={isCustomSharing ? 'custom' : newRoomBeds}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomSharing(true);
                          setNewRoomBeds('');
                        } else {
                          setIsCustomSharing(false);
                          setNewRoomBeds(val);
                          // Auto-fill rent from sharingRentMap if available
                          const rentFromMap = sharingRentMap[parseInt(val)];
                          if (rentFromMap) setNewRoomRent(String(rentFromMap));
                        }
                      }}
                      className="w-full appearance-none border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 pr-10 text-sm outline-none transition-all placeholder:text-gray-400 bg-white cursor-pointer"
                    >
                      <option value="">Select sharing type</option>
                      {/* Only show sharing types configured during onboarding; fall back to 1-10 if none set */}
                      {(Object.keys(sharingRentMap).length > 0
                        ? Object.keys(sharingRentMap).map(Number).sort((a, b) => a - b)
                        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                      ).map(num => (
                        <option key={num} value={num}>{num} Sharing{sharingRentMap[num] ? ` — ₹${sharingRentMap[num].toLocaleString('en-IN')}` : ''}</option>
                      ))}
                      <option value="custom">Add custom sharing type...</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {isCustomSharing && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-1.5"
                  >
                    <label className="text-sm font-medium text-gray-900 block">Enter Sharing Count <span className="text-red-500">*</span></label>
                    <input 
                      type="number" 
                      min="1"
                      value={customSharingValue}
                      onChange={(e) => setCustomSharingValue(e.target.value)}
                      placeholder="e.g. 5" 
                      className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400"
                    />
                  </motion.div>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Base Monthly Rent <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</div>
                    <input 
                      type="number" 
                      value={newRoomRent}
                      onChange={(e) => setNewRoomRent(e.target.value)}
                      placeholder="7,500" 
                      className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-8 pr-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400"
                    />
                  </div>
                </div>

                {/* Layout Version Selection */}
                {(() => {
                  const currentSharing = isCustomSharing ? parseInt(customSharingValue) : parseInt(newRoomBeds);
                  const templates = allTemplates.filter(t => t.sharing === currentSharing);
                  if (isNaN(currentSharing) || currentSharing <= 0) return null;

                  const hasTemplates = templates.length > 0;
                  return (
                    <div className="space-y-3 pt-2">
                      <label className="text-sm font-medium text-gray-900 block">Select Layout Version</label>
                      <div className="grid grid-cols-2 gap-3">
                        {hasTemplates ? templates.map((t, idx) => {
                          const colorConfig = LAYOUT_COLORS.find(c => c.name === t.color) || LAYOUT_COLORS[0];
                          const isSelected = selectedLayoutId === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => setSelectedLayoutId(t.id)}
                              className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left group/version ${
                                isSelected 
                                  ? `${colorConfig.class} border-opacity-100 ring-4 ring-blue-500/5` 
                                  : 'border-gray-100 hover:border-gray-200 text-gray-600'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorConfig.dot} bg-opacity-20`}>
                                <div className={`w-3 h-3 rounded-full ${colorConfig.dot}`} />
                              </div>
                              <div className="flex flex-col flex-1">
                                <span className="text-xs font-bold uppercase tracking-wider">Version {idx + 1}</span>
                                <span className="text-[10px] opacity-70 font-medium">{colorConfig.name} Theme</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewTemplateId(t.id);
                                }}
                                className="p-1.5 hover:bg-black/5 rounded-lg transition-colors text-gray-400 hover:text-gray-900"
                                title="Preview Layout"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </button>
                          )
                        }) : (
                          <button
                            type="button"
                            onClick={() => setSelectedLayoutId(getDefaultLayoutId(currentSharing))}
                            className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left ${
                              selectedLayoutId === getDefaultLayoutId(currentSharing)
                                ? 'bg-blue-50 border-blue-200 text-blue-800 ring-4 ring-blue-500/10'
                                : 'border-gray-100 hover:border-gray-200 text-gray-600'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-100 text-blue-600">
                              <span className="text-sm font-bold">D</span>
                            </div>
                            <div className="flex flex-col flex-1">
                              <span className="text-xs font-bold uppercase tracking-wider">Default Layout</span>
                              <span className="text-[10px] opacity-70 font-medium">Auto-generated for {currentSharing}-sharing</span>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                  <div className="pt-4 flex flex-col gap-3">
                    <button 
                      onClick={() => executeSaveRoom()}
                      disabled={(!isCustomSharing && !newRoomBeds) || (isCustomSharing && !customSharingValue) || !newRoomNumber || isSavingRoom}
                      className="w-full bg-[#1D4ED8] hover:bg-[#1e40af] disabled:bg-blue-300 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-base font-semibold shadow-sm transition-colors"
                    >
                      {isSavingRoom ? 'Saving...' : (isSetupMode ? 'Confirm Room Setup' : 'Add Room')}
                    </button>
                    
                    {isSetupMode && (
                      <button 
                        onClick={() => setShowDeleteRoomConfirmation(true)}
                        className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" /> Delete Room
                      </button>
                    )}
                  </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Side Drawer */}
      <AnimatePresence>
        {currentRoom && selectedRoom && (
          <motion.div 
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="w-full sm:w-[400px] bg-white border-l border-gray-200 shadow-2xl h-[calc(100vh-64px)] fixed right-0 top-16 z-30 flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Room {currentRoom.number}</h2>
                <p className="text-sm text-gray-500">{currentRoom.beds.length} Beds Total</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    const bedCount = currentRoom.beds.length;
                    setEditRoomBedsNum(bedCount.toString());
                    setEditRoomNumber(currentRoom.number);
                    setEditRoomRent(currentRoom.baseRent ? currentRoom.baseRent.toString() : '');
                    setIsEditCustomSharing(false);
                    setEditCustomSharingValue('');
                    setMoveTargetRoomId('');
                    setSelectedBedsToMove([]);
                    setEditModalTab('move');
                    setShowDeleteConfirmation(false);
                    setSelectedLayoutId(currentRoom.layoutId || '');
                    setIsEditRoomModalOpen(true);
                  }} 
                  className="px-3 py-1.5 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-all shadow-sm"
                >
                  Edit
                </button>
                <div className="w-px h-6 bg-gray-200"></div>
                <button 
                  onClick={closeDrawer}
                  className="p-1.5 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {[...currentRoom.beds]
                .filter(bed => isBedMatch(bed.status, filterStatus))
                .sort((a, b) => {
                  const getOrder = (status: string) => {
                    switch (status) {
                      case 'occupied': return 1;
                      case 'payment_due': return 2;
                      case 'reserved': return 3;
                      case 'vacant': return 4;
                      default: return 5;
                    }
                  };
                  const orderA = getOrder(a.status);
                  const orderB = getOrder(b.status);
                  if (orderA === orderB) {
                    return a.name.localeCompare(b.name);
                  }
                  return orderA - orderB;
                })
                .map((bed, bedIdx) => {
                const resident = bed.residentId ? residents.find(r => r.id === bed.residentId) : null;
                const isVacant = !resident;

                const getBedCardStyles = (status: string) => {
                  switch (status) {
                    case 'occupied': return { border: "border-green-200", title: "text-green-700", headerBg: "bg-green-50/50" };
                    case 'vacant': return { border: "border-red-200", title: "text-red-700", headerBg: "bg-red-50/50" };
                    case 'payment_due': return { border: "border-yellow-200", title: "text-yellow-700", headerBg: "bg-yellow-50/50" };
                    case 'reserved': return { border: "border-blue-200", title: "text-blue-700", headerBg: "bg-blue-50/50" };
                    default: return { border: "border-gray-200", title: "text-gray-900", headerBg: "bg-gray-50/50" };
                  }
                };
                const cardStyles = getBedCardStyles(bed.status);

                return (
                  <div key={`${bed.id}-${bedIdx}`} className={`bg-white border text-left rounded-2xl overflow-hidden ${cardStyles.border}`}>
                    <div className={`p-4 border-b flex justify-between items-center ${cardStyles.border} ${cardStyles.headerBg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${cardStyles.title}`}>{bed.name}</span>
                      </div>
                      <span className={`text-xs font-medium uppercase tracking-wider ${cardStyles.title}`}>
                        {(bed.status || '').replace('_', ' ')}
                      </span>
                    </div>

                    {isVacant ? (
                      <div className="p-6 flex flex-col items-center justify-center text-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                          <UserPlus className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-medium text-gray-600">This bed is currently empty.</p>
                        <button 
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('open-add-resident-modal', { detail: { roomId: currentRoom.id, bedId: bed.id } }));
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          Add Resident
                        </button>
                      </div>
                    ) : (
                      <div className="p-5 space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-gray-50 border-2 border-white ring-1 ring-gray-200 shadow-sm flex items-center justify-center text-gray-400 overflow-hidden shrink-0">
                            {resident.photoUrl ? (
                              <img src={resident.photoUrl} alt={resident.name} className="w-full h-full object-cover" />
                            ) : (
                              <DefaultAvatar className="w-full h-full" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">{resident.name}</h4>
                            <p className="text-xs text-gray-500">Joined {resident.joinDate}</p>
                            {resident.vacatingDate && (
                              <p className="text-xs text-orange-600 font-medium mt-1">Vacating on {resident.vacatingDate}</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className={cn("bg-gray-50 p-3 rounded-xl", bed.status === 'reserved' && "col-span-2")}>
                            <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1"><Phone className="w-3.5 h-3.5" /> Phone</span>
                            <span className="text-sm font-semibold text-gray-900 truncate">{resident.phone}</span>
                          </div>
                          {bed.status !== 'reserved' && (
                            <div className="bg-gray-50 p-3 rounded-xl flex flex-col justify-center">
                              <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1"><IndianRupee className="w-3.5 h-3.5" /> Dues</span>
                              {resident.paymentStatus === 'due' ? (
                                <span className="text-sm font-bold text-red-600">₹{resident.dueAmount}</span>
                              ) : (
                                <span className="text-sm font-bold text-green-600">Paid</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 pt-2">
                           <button 
                             onClick={() => {
                               setGlobalSelectedResidentId(resident.id);
                               navigate(ROUTES.residents.path);
                             }}
                             className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                           >
                            <User className="w-4 h-4" /> Profile
                           </button>
                           <button 
                             onClick={() => setResidentToVacate(resident)}
                             className="flex-1 bg-white border border-red-200 hover:bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                           >
                             <LogOut className="w-4 h-4" /> {bed.status === 'reserved' ? 'Cancel' : 'Vacate'}
                           </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bed Layout Templates Modal */}
      <AnimatePresence>
        {isBedLayoutModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col relative"
            >
              <button 
                onClick={() => setIsBedLayoutModalOpen(false)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="max-h-[90vh] overflow-y-auto">
                <BedLayoutBuilder
                  hostelId={hostelProfile?.id}
                  onSaveComplete={() => setIsBedLayoutModalOpen(false)}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {residentToVacate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col relative"
            >
              <button 
                onClick={() => setResidentToVacate(null)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-6 pb-0">
                <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                  <LogOut className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Vacate Resident?</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed">
                  Are you sure you want to vacate <strong>{residentToVacate.name}</strong> from Room {getNamesFromIds(floors, residentToVacate.roomId, undefined).roomName}? This action will permanently remove them from the active residents list.
                </p>
              </div>

              <div className="p-6 flex items-center justify-end gap-3 mt-2">
                <button 
                  onClick={() => setResidentToVacate(null)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={executeVacateResident}
                  disabled={isVacatingResident}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {isVacatingResident ? 'Vacating...' : 'Confirm Vacate'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Room Modal */}
      <AnimatePresence>
        {isEditRoomModalOpen && currentRoom && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-900">Manage Room {currentRoom.number}</h3>
                <button 
                  onClick={() => setIsEditRoomModalOpen(false)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[70vh]">
                <div className="px-6 py-4 border-b border-gray-100 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Room Number <span className="text-red-500">*</span></label>
                  <input 
                    type="text"
                    value={editRoomNumber}
                    onChange={(e) => setEditRoomNumber(e.target.value)}
                    className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 block">Sharing Type <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select 
                        value={isEditCustomSharing ? 'custom' : editRoomBedsNum}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setIsEditCustomSharing(true);
                            setEditRoomBedsNum('');
                          } else {
                            setIsEditCustomSharing(false);
                            setEditRoomBedsNum(val);
                            const rentFromMap = sharingRentMap[parseInt(val)];
                            if (rentFromMap) setEditRoomRent(String(rentFromMap));
                          }
                        }}
                        className="w-full appearance-none border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 pr-10 text-sm outline-none transition-all bg-white cursor-pointer"
                      >
                        <option value="">Select sharing</option>
                        {(Object.keys(sharingRentMap).length > 0
                          ? Object.keys(sharingRentMap).map(Number).sort((a, b) => a - b)
                          : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                        ).map(num => (
                          <option key={num} value={num}>{num} Sharing</option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 block">Rent <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</div>
                      <input 
                        type="number" 
                        value={editRoomRent}
                        onChange={(e) => setEditRoomRent(e.target.value)}
                        placeholder="7,500" 
                        className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-8 pr-4 py-3 text-sm outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {isEditCustomSharing && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-1.5"
                  >
                    <label className="text-sm font-medium text-gray-900 block">Enter Sharing Count <span className="text-red-500">*</span></label>
                    <input 
                      type="number" 
                      min="1"
                      value={editCustomSharingValue}
                      onChange={(e) => setEditCustomSharingValue(e.target.value)}
                      placeholder="e.g. 5" 
                      className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                    />
                  </motion.div>
                )}
              </div>
              
              <div className="flex border-b border-gray-200 px-6 pt-4 gap-6">
                <button 
                  onClick={() => setEditModalTab('move')}
                  className={cn("pb-3 text-sm font-medium transition-colors relative", editModalTab === 'move' ? "text-blue-600" : "text-gray-500 hover:text-gray-700")}
                >
                  Move Beds
                  {editModalTab === 'move' && (
                    <motion.div layoutId="editRoomTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
                  )}
                </button>
                <button 
                  onClick={() => setEditModalTab('add')}
                  className={cn("pb-3 text-sm font-medium transition-colors relative", editModalTab === 'add' ? "text-blue-600" : "text-gray-500 hover:text-gray-700")}
                >
                  Add/Remove Beds
                  {editModalTab === 'add' && (
                    <motion.div layoutId="editRoomTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
                  )}
                </button>
              </div>

              {editModalTab === 'add' ? (
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500">Change the total number of beds in this room.</p>
                    <div className="space-y-1.5">
                      <p className="text-xs text-gray-500">Beds will automatically follow the letter ordering (A, B, C...)</p>
                    </div>

                    {/* Layout Version Selection for Manage Room */}
                    {(() => {
                      const currentSharing = parseInt(editRoomBedsNum);
                      if (isNaN(currentSharing) || currentSharing <= 0) return null;
                      
                      const templates = allTemplates.filter(t => t.sharing === currentSharing);
                      if (templates.length <= 1) return null;

                      return (
                        <div className="space-y-3 pt-2">
                          <label className="text-sm font-medium text-gray-900 block">Select Layout Version</label>
                          <div className="grid grid-cols-2 gap-3">
                            {templates.map((t, idx) => {
                              const colorConfig = LAYOUT_COLORS.find(c => c.name === t.color) || LAYOUT_COLORS[0];
                              const isSelected = selectedLayoutId === t.id || (selectedLayoutId === '' && idx === 0);
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => setSelectedLayoutId(t.id)}
                                  className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left ${
                                    isSelected 
                                      ? `${colorConfig.class} border-opacity-100 ring-4 ring-blue-50` 
                                      : 'border-gray-100 hover:border-gray-200 text-gray-600'
                                  }`}
                                >
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorConfig.dot} bg-opacity-20`}>
                                    <div className={`w-3 h-3 rounded-full ${colorConfig.dot}`} />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[13px] font-bold text-gray-900 leading-tight">Version {idx + 1}</span>
                                    <span className="text-[11px] text-gray-500 font-medium">{colorConfig.name} Theme</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  
                  {editRoomBedsNum && parseInt(editRoomBedsNum) > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-900 block">Preview Beds</label>
                      <div className="flex flex-wrap gap-2 border border-gray-100 p-3 rounded-lg bg-gray-50/50">
                        {Array.from({ length: Math.max(currentRoom.beds.length, parseInt(editRoomBedsNum)) }).map((_, idx) => {
                          const existingBed = currentRoom.beds[idx];
                          const isRemoving = existingBed && idx >= parseInt(editRoomBedsNum);
                          
                          if (existingBed) {
                            const statusColors = getBedPillStyles(existingBed.status);
                            return (
                              <div 
                                key={existingBed.id} 
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                                  isRemoving ? "opacity-30 line-through bg-gray-100 border-gray-200 text-gray-500 shadow-none" : statusColors.container
                                )}
                              >
                                {existingBed.name}
                              </div>
                            );
                          } else {
                            return (
                              <div 
                                key={`new-bed-${idx}`} 
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border bg-white border-dashed border-gray-300 text-gray-500 shadow-sm"
                              >
                                Bed {String.fromCharCode(65 + idx)}
                              </div>
                            );
                          }
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500">Transfer existing beds and their occupants to another room.</p>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-900 block">Destination Room <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <div 
                          onClick={() => setIsRoomDropdownOpen(!isRoomDropdownOpen)}
                          className="w-full border border-gray-200 hover:border-gray-300 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all bg-white cursor-pointer flex items-center justify-between"
                        >
                          <span className={cn(!moveTargetRoomId && "text-gray-400")}>
                            {moveTargetRoomId 
                              ? `Room ${floors.flatMap(f => f.rooms).find(r => r.id === moveTargetRoomId)?.number}` 
                              : "Select Room"}
                          </span>
                          <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isRoomDropdownOpen && "rotate-180")} />
                        </div>

                        <AnimatePresence>
                          {isRoomDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="absolute z-50 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden flex flex-col"
                            >
                              <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                  <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search room number..."
                                    value={roomSearchQuery}
                                    onChange={(e) => setRoomSearchQuery(e.target.value)}
                                    className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-blue-500 transition-all"
                                  />
                                </div>
                              </div>
                              <div className="max-h-[240px] overflow-y-auto p-1">
                                {floors.flatMap(f => f.rooms)
                                  .filter(r => r.id !== currentRoom.id && (roomSearchQuery === '' || r.number.includes(roomSearchQuery)))
                                  .map((r, idx) => (
                                    <button
                                      key={`${r.id}-${idx}`}
                                      onClick={() => {
                                        setMoveTargetRoomId(r.id);
                                        setIsRoomDropdownOpen(false);
                                        setRoomSearchQuery('');
                                      }}
                                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-all flex items-center justify-between group"
                                    >
                                      <span className="font-medium">Room {r.number}</span>
                                      <span className="text-[10px] text-gray-400 group-hover:text-blue-400 uppercase font-bold tracking-wider">
                                        Floor {floors.find(f => f.rooms.some(rm => rm.id === r.id))?.name?.replace('Floor ', '')}
                                      </span>
                                    </button>
                                  ))}
                                {floors.flatMap(f => f.rooms)
                                  .filter(r => r.id !== currentRoom.id && (roomSearchQuery === '' || r.number.includes(roomSearchQuery)))
                                  .length === 0 && (
                                  <div className="p-8 text-center">
                                    <p className="text-sm text-gray-500">No rooms found</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 block">Select Beds to Move <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2 border border-gray-100 p-3 rounded-lg bg-gray-50/50">
                      {currentRoom.beds.map((bed, idx) => {
                        const isSelected = selectedBedsToMove.includes(bed.id);
                        const statusColors = getBedPillStyles(bed.status);
                        
                        return (
                          <button
                            key={`${bed.id}-${idx}`}
                            onClick={() => {
                              setSelectedBedsToMove(prev => 
                                isSelected ? prev.filter(id => id !== bed.id) : [...prev, bed.id]
                              );
                            }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                              isSelected 
                                ? "bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600" 
                                : cn(statusColors.container, "hover:opacity-80 hover:shadow-sm")
                            )}
                          >
                            {bed.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Beds will follow the sequential letter ordering (A, B, C...) in the destination room.</p>
                  </div>
                </div>
              )}
              </div>
              
              <div className="p-6 pt-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center gap-3">
                {showDeleteConfirmation ? (
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-sm font-medium text-red-600 flex-1">Are you sure?</span>
                    <button 
                      onClick={() => setShowDeleteConfirmation(false)}
                      className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={executeDeleteRoom}
                      disabled={isDeletingRoom}
                      className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isDeletingRoom ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => setShowDeleteConfirmation(true)}
                      className="px-4 py-2.5 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Room
                    </button>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => setIsEditRoomModalOpen(false)}
                        className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      {editModalTab === 'add' ? (
                        <button 
                          onClick={executeSaveEditRoomBeds}
                          disabled={isSavingEditRoomBeds}
                          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                        >
                          {isSavingEditRoomBeds ? 'Saving...' : 'Save Changes'}
                        </button>
                      ) : (
                        <button 
                          onClick={executeMoveBeds}
                          disabled={!moveTargetRoomId || selectedBedsToMove.length === 0 || isMovingBeds}
                          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
                        >
                          {isMovingBeds ? 'Moving...' : 'Move Beds'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteRoomConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col relative"
            >
              <button 
                onClick={() => setShowDeleteRoomConfirmation(false)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-6 pb-0">
                <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Room {newRoomNumber}?</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed">
                  Are you sure you want to delete this room? This action cannot be undone.
                </p>
              </div>

              <div className="p-6 flex items-center justify-end gap-3 mt-2">
                <button 
                  onClick={() => setShowDeleteRoomConfirmation(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={executeDeleteSetupRoom}
                  disabled={isDeletingSetupRoom}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {isDeletingSetupRoom ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCopyLayoutModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-xl w-full max-w-md overflow-hidden flex flex-col relative"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Copy Layout</h3>
                    <p className="text-sm text-gray-500 mt-1">Select a floor to copy layout from to {floors.find(f => f.id === targetFloorForCopy)?.name}</p>
                  </div>
                  <button 
                    onClick={() => setIsCopyLayoutModalOpen(false)}
                    className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {floors
                    .filter(f => f.id !== targetFloorForCopy)
                    .map(floor => {
                      const setupRoomsCount = floor.rooms.filter(r => r.beds.length > 0).length;
                      return (
                        <button
                          key={floor.id}
                          onClick={() => executeCopyLayout(floor.id)}
                          disabled={setupRoomsCount === 0}
                          className={cn(
                            "w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left group",
                            setupRoomsCount > 0 
                              ? "border-gray-100 hover:border-blue-200 hover:bg-blue-50/50" 
                              : "border-gray-50 opacity-50 cursor-not-allowed"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                              setupRoomsCount > 0 ? "bg-blue-50 text-blue-600 group-hover:bg-blue-100" : "bg-gray-50 text-gray-400"
                            )}>
                              <LayoutTemplate className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="font-bold text-gray-900">{floor.name}</div>
                              <div className="text-xs text-gray-500">{setupRoomsCount} rooms set up</div>
                            </div>
                          </div>
                          {setupRoomsCount > 0 && (
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                              <Plus className="w-5 h-5" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  
                  {floors.filter(f => f.id !== targetFloorForCopy).length === 0 && (
                    <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <p className="text-gray-500 text-sm font-medium">No other floors available to copy from.</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <button 
                  onClick={() => setIsCopyLayoutModalOpen(false)}
                  className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3.5 rounded-2xl text-sm font-bold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bed Layout Preview Modal */}
      <AnimatePresence>
        {previewTemplateId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" 
              onClick={() => setPreviewTemplateId(null)}
            ></div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-[360px] relative z-10 overflow-hidden flex flex-col"
            >
              <div className="p-6 pb-2 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Layout Preview</h3>
                  <p className="text-sm text-gray-500">
                    {(() => {
                      const t = allTemplates.find(tpl => tpl.id === previewTemplateId);
                      return t ? `${t.sharing} Sharing — ${t.color} Theme` : '';
                    })()}
                  </p>
                </div>
                <button 
                  onClick={() => setPreviewTemplateId(null)}
                  className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 flex items-center justify-center bg-gray-50/50">
                {(() => {
                  const template = allTemplates.find(t => t.id === previewTemplateId);
                  if (!template) return null;

                  return (
                    <div className="relative w-[280px] h-[350px] bg-white border-2 border-gray-200 rounded-[24px] shadow-sm overflow-hidden">
                      {/* Miniature door */}
                      {template.door && (
                        <div className={cn(
                          "absolute bg-amber-700/40 rounded-sm z-0",
                          template.door === 'N' && "top-0 left-1/2 -translate-x-1/2 w-12 h-1.5",
                          template.door === 'S' && "bottom-0 left-1/2 -translate-x-1/2 w-12 h-1.5",
                          template.door === 'E' && "right-0 top-1/2 -translate-y-1/2 w-1.5 h-12",
                          template.door === 'W' && "left-0 top-1/2 -translate-y-1/2 w-1.5 h-12"
                        )} />
                      )}

                      {Object.entries(template.positions).map(([label, pos]) => {
                        const bedWidthPx = pos.rotated ? 44 : 96;
                        const bedHeightPx = pos.rotated ? 96 : 44;
                        
                        // Template is based on 320x400
                        // Preview is 280x350
                        const scaleX = (pos.x / 320) * 100;
                        const scaleY = (pos.y / 400) * 100;
                        const widthPct = (bedWidthPx / 320) * 100;
                        const heightPct = (bedHeightPx / 400) * 100;
                        
                        return (
                          <div
                            key={label}
                            style={{
                              left: `${scaleX}%`,
                              top: `${scaleY}%`,
                              width: `${widthPct}%`,
                              height: `${heightPct}%`,
                              zIndex: 1,
                            }}
                            className={cn(
                              "absolute flex items-center justify-center rounded-lg border text-[10px] font-bold shadow-sm bg-white overflow-hidden",
                              LAYOUT_COLORS.find(c => c.name === template.color)?.class || LAYOUT_COLORS[0].class
                            )}
                          >
                            <span className={pos.rotated ? "-rotate-90 whitespace-nowrap" : ""}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div className="p-6 bg-white flex justify-center">
                <button 
                  onClick={() => setPreviewTemplateId(null)}
                  className="w-full bg-[#1D4ED8] text-white py-3.5 rounded-2xl font-bold hover:bg-[#1e40af] transition-colors shadow-lg shadow-blue-200"
                >
                  Close Preview
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
