import React from 'react';
import { X, Info, FileText, Image as ImageIcon, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { getJoinRequestPhotoUrl } from '../lib/supabaseAPI';
import { addDaysToDateOnly, formatDate, getTodayIST } from '../lib/utils';

export default function AddResidentModal({
  isOpen,
  onClose,
  reAddData
}: {
  isOpen: boolean;
  onClose: () => void;
  reAddData?: any
}) {
  const { addResident, approveJoinRequest, floors, sharingRentMap, securityDeposit, hostelProfile } = useApp();
  const collectsSecurityDeposit = Boolean(hostelProfile?.collectSecurityDeposit ?? Number(hostelProfile?.security_deposit ?? securityDeposit) > 0);
  const [showJoiningInfo, setShowJoiningInfo] = React.useState(true);

  const [joiningDate, setJoiningDate] = React.useState<string>(getTodayIST());
  const [stayDurationDays, setStayDurationDays] = React.useState<string>('');
  const [isApprovingJoinRequest, setIsApprovingJoinRequest] = React.useState(false);

  // States for smart filtering
  const [selectedSharingType, setSelectedSharingType] = React.useState<string>('');
  const [selectedFloorId, setSelectedFloorId] = React.useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = React.useState<string>('');
  const [selectedBedId, setSelectedBedId] = React.useState<string>('');
  const isJoinRequest = reAddData?.source === 'joinRequest';
  const isSpecificBed = reAddData?.roomId && reAddData?.bedId && !reAddData?.name;
  const isReAdd = reAddData && reAddData.id !== 'new' && !isJoinRequest && !isSpecificBed;
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = React.useState<string | undefined>(reAddData?.photoUrl);

  // 0. Available Sharing Types (from vacant rooms)
  const availableSharingTypes = React.useMemo(() => {
    const types = new Set<number>();
    floors.forEach(floor => {
      floor.rooms.forEach(room => {
        if (room.beds.some(bed => bed.status === 'vacant')) {
          types.add(room.beds.length);
        }
      });
    });
    return Array.from(types).sort((a, b) => a - b);
  }, [floors]);

  // 1. Available Floors (must have at least one vacant bed of selected sharing)
  const availableFloors = React.useMemo(() => {
    return floors.filter(floor =>
      floor.rooms.some(room =>
        (!selectedSharingType || room.beds.length === Number(selectedSharingType)) &&
        room.beds.some(bed => bed.status === 'vacant')
      )
    );
  }, [floors, selectedSharingType]);

  // 2. Available Rooms for selected floor
  const availableRooms = React.useMemo(() => {
    const floor = floors.find(f => f.id === selectedFloorId);
    if (!floor) return [];
    return floor.rooms.filter(room =>
      (!selectedSharingType || room.beds.length === Number(selectedSharingType)) &&
      room.beds.some(bed => bed.status === 'vacant')
    );
  }, [floors, selectedFloorId, selectedSharingType]);

  // 3. Available Beds for selected room
  const availableBeds = React.useMemo(() => {
    for (const floor of floors) {
      const room = floor.rooms.find(r => r.id === selectedRoomId);
      if (room) {
        return room.beds.filter(bed => bed.status === 'vacant');
      }
    }
    return [];
  }, [floors, selectedRoomId]);

  // Sync states with pre-filled data or defaults
  React.useEffect(() => {
    if (isOpen) {
      // If we have re-add data or specific bed info
      if (reAddData?.roomId) {
        const floor = floors.find(f => f.rooms.some(r => r.id === reAddData.roomId));
        if (floor) {
          const room = floor.rooms.find(r => r.id === reAddData.roomId);
          if (room) {
            setSelectedSharingType(String(room.beds.length));
          }
          setSelectedFloorId(floor.id);
          setSelectedRoomId(reAddData.roomId);
          if (reAddData.bedId) {
            setSelectedBedId(reAddData.bedId);
          } else {
            const firstVacant = room?.beds.find(b => b.status === 'vacant');
            setSelectedBedId(firstVacant?.id || '');
          }
        }
      } else {
        // Defaults: first available sharing -> floor -> room -> bed
        if (availableSharingTypes.length > 0) {
          const firstSharing = String(availableSharingTypes[0]);
          setSelectedSharingType(firstSharing);

          const firstFloor = floors.find(floor =>
            floor.rooms.some(room =>
              room.beds.length === Number(firstSharing) &&
              room.beds.some(bed => bed.status === 'vacant')
            )
          );

          if (firstFloor) {
            setSelectedFloorId(firstFloor.id);
            const firstRoom = firstFloor.rooms.find(r =>
              r.beds.length === Number(firstSharing) &&
              r.beds.some(b => b.status === 'vacant')
            );
            if (firstRoom) {
              setSelectedRoomId(firstRoom.id);
              const firstBed = firstRoom.beds.find(b => b.status === 'vacant');
              if (firstBed) setSelectedBedId(firstBed.id);
            }
          }
        }
      }
    }
    // Reset joining date when modal opens (use IST)
    if (isOpen) {
      setJoiningDate(getTodayIST());
      setStayDurationDays(reAddData?.stayTime ? String(reAddData.stayTime) : '');
    }
  }, [isOpen, reAddData?.id]);

  // Keep the chosen sharing/floor/room/bed stable during background refreshes.
  // Repair selection only when its current value became unavailable.
  React.useEffect(() => {
    if (!isOpen || reAddData?.roomId) return;
    const roomStillAvailable = floors.some(floor => floor.rooms.some(room =>
      room.id === selectedRoomId && room.beds.length === Number(selectedSharingType)
      && room.beds.some(bed => bed.id === selectedBedId && bed.status === 'vacant')
    ));
    if (roomStillAvailable) return;
    const firstSharing = availableSharingTypes.includes(Number(selectedSharingType))
      ? selectedSharingType : String(availableSharingTypes[0] || '');
    setSelectedSharingType(firstSharing);
    const firstFloor = floors.find(floor => floor.rooms.some(room =>
      room.beds.length === Number(firstSharing) && room.beds.some(bed => bed.status === 'vacant')
    ));
    const firstRoom = firstFloor?.rooms.find(room => room.beds.length === Number(firstSharing)
      && room.beds.some(bed => bed.status === 'vacant'));
    const firstBed = firstRoom?.beds.find(bed => bed.status === 'vacant');
    setSelectedFloorId(firstFloor?.id || '');
    setSelectedRoomId(firstRoom?.id || '');
    setSelectedBedId(firstBed?.id || '');
  }, [isOpen, reAddData?.roomId, floors, availableSharingTypes, selectedSharingType, selectedRoomId, selectedBedId]);

  // Derived pre-filled rent from room's baseRent or sharingRentMap
  const prefilledRent = React.useMemo(() => {
    const targetRoomId = selectedRoomId;
    if (!targetRoomId) return '';
    for (const floor of floors) {
      const room = floor.rooms.find(r => r.id === targetRoomId);
      if (room) {
        if (room.baseRent) return String(room.baseRent);
        if (sharingRentMap && sharingRentMap[room.beds.length]) {
          return String(sharingRentMap[room.beds.length]);
        }
      }
    }
    return '';
  }, [selectedRoomId, floors, sharingRentMap]);

  React.useEffect(() => {
    let isActive = true;

    if (isJoinRequest) {
      setResolvedPhotoUrl(undefined);

      void (async () => {
        const photoUrl = reAddData?.id ? await getJoinRequestPhotoUrl(reAddData.id) : reAddData?.photoUrl;

        if (!isActive) return;
        setResolvedPhotoUrl(photoUrl || reAddData?.photoUrl);
      })();
    } else {
      setResolvedPhotoUrl(undefined);
    }

    return () => {
      isActive = false;
    };
  }, [isOpen, isJoinRequest, reAddData?.id, reAddData?.photoUrl, reAddData?.photoPath]);

  if (!isOpen) return null;

  const handleAddSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const isReservedOnly = formData.get('reserved') === 'yes';
    const selectedBed = availableBeds.find(bed => bed.id === selectedBedId);
    const joinDate = formData.get('joiningDate') as string || joiningDate || getTodayIST();
    const stayDays = Number(formData.get('stayTime'));
    const calculatedVacatingDate = !isReservedOnly && Number.isInteger(stayDays) && stayDays > 0
      ? addDaysToDateOnly(joinDate, stayDays)
      : undefined;
    const normalizePhone = (value: FormDataEntryValue | null) => {
      const digits = String(value ?? '').replace(/\D/g, '');
      return digits.length > 10 ? digits.slice(-10) : digits;
    };

    const residentData = {
      name: formData.get('name') as string,
      phone: normalizePhone(formData.get('phone')),
      emergencyPhone: normalizePhone(formData.get('emergencyPhone')),
      aadhar: formData.get('aadhar') as string,
      state: formData.get('state') as string,
      country: formData.get('country') as string,
      rent: Number(formData.get('rent')),
      stayTime: stayDays > 0 ? String(stayDays) : '',
      joinDate,
      vacatingDate: calculatedVacatingDate,
      securityDeposit: Number(formData.get('deposit')) || 0,
      isDepositPaid: false,
      roomId: selectedRoomId,
      bedId: selectedBedId,
      oldResidentId: isReAdd ? reAddData.id : undefined
    };

    // Client-side validations to avoid RPC errors
    if (!selectedRoomId || !selectedBedId || !selectedBed) {
      import('sonner').then(({ toast }) => {
        toast.error('No vacant bed selected');
      });
      return;
    }

    const selectedRoom = floors.flatMap(floor => floor.rooms).find(room => room.id === selectedRoomId);
    if (!selectedRoom || selectedRoom.beds.length !== Number(selectedSharingType)
        || !selectedRoom.beds.some(bed => bed.id === selectedBedId && bed.status === 'vacant')) {
      import('sonner').then(({ toast }) => toast.error('Selected bed is no longer vacant. Choose another bed.'));
      return;
    }

    // Ensure phone is 10 digits
    if (!residentData.phone || String(residentData.phone).length !== 10) {
      import('sonner').then(({ toast }) => {
        toast.error('Phone number must be exactly 10 digits');
      });
      return;
    }

    if (isJoinRequest) {
      setIsApprovingJoinRequest(true);
      try {
        await approveJoinRequest({
          requestId: reAddData.id,
          roomId: selectedRoomId,
          bedId: selectedBedId,
          monthlyRent: residentData.rent,
          joinDate: residentData.joinDate,
          securityDeposit: residentData.securityDeposit || 0,
          isDepositPaid: false,
          stayDurationDays: residentData.stayTime ? Number(residentData.stayTime) : null,
          vacatingDate: residentData.vacatingDate,
          reviewNotes: null,
        });
      } catch (error: any) {
        const message = error?.message || 'Could not approve this join request. Please try again.';
        const isDuplicate = error?.code === 'P0005' || /active resident with phone/i.test(message);
        import('sonner').then(({ toast }) => toast.error(isDuplicate
          ? 'This phone number already belongs to an active resident in this hostel. Check the Residents list before approving this request.'
          : message));
        setIsApprovingJoinRequest(false);
        return;
      }
      setIsApprovingJoinRequest(false);
    } else {
      addResident(residentData, isReservedOnly);

      if (isReAdd) {
        import('sonner').then(({ toast }) => {
          toast.success(`Resident ${residentData.name} re-added successfully!`);
        });
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      <div className="relative z-10 flex max-h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:my-4 sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 p-4 pb-3 sm:p-6 sm:pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
              {isReAdd ? 'Re-add Resident' : isJoinRequest ? 'Check & Add' : 'Add Resident'}
            </h2>
            <p className="text-xs text-gray-500 mt-1"><span className="text-red-500">*</span> indicates a mandatory field</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors self-start"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAddSubmit} className="flex flex-col overflow-hidden min-h-0">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 custom-scrollbar sm:p-6">
            {isJoinRequest && (
              <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                  <p className="text-sm font-semibold text-gray-900">Applicant photo</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-blue-100 bg-white p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Photo</p>
                    {resolvedPhotoUrl ? (
                      <div className="mt-2 space-y-2">
                        {resolvedPhotoUrl ? (
                          <a href={resolvedPhotoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-gray-200 bg-gray-50 hover:border-blue-300 transition-colors">
                            <img
                              src={resolvedPhotoUrl}
                              alt={`${reAddData.name || 'Resident'} photo`}
                              className="h-36 w-full object-contain"
                              onError={async () => { const fresh = reAddData?.id ? await getJoinRequestPhotoUrl(reAddData.id) : undefined; if (fresh) setResolvedPhotoUrl(fresh); }}
                            />
                          </a>
                        ) : (
                          <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 overflow-hidden shrink-0">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">Photo uploaded</p>
                              <p className="text-xs text-gray-500 truncate">Open submitted resident photo</p>
                            </div>
                          </div>
                        )}
                        <a href={resolvedPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-medium text-blue-700 hover:text-blue-800">
                          Open photo
                        </a>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">
                        {reAddData?.photoPath
                          ? 'A photo was submitted, but it could not be opened. Check the storage file or ask the applicant to resubmit it.'
                          : 'No photo uploaded'}
                      </p>
                    )}
                  </div>

                </div>
              </div>
            )}

            {isJoinRequest && reAddData?.phone && (
              <a
                href={`tel:+91${String(reAddData.phone).replace(/\D/g, '').slice(-10)}`}
                className="block w-full min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 inline-flex"
              >
                <Phone className="h-4 w-4" />
                Call Applicant
              </a>
            )}

            {isJoinRequest && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-900">Requested Preferences</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Room Number</p>
                    <p className="font-medium text-gray-900">{reAddData?.preferredRoom || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Sharing Type</p>
                    <p className="font-medium text-gray-900">{reAddData?.preferredSharing || 'Not provided'}</p>
                  </div>
                </div>
              </div>
            )}

            {!isSpecificBed && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Sharing Type</label>
                  <div className="relative">
                    <select
                      value={selectedSharingType}
                      onChange={(e) => {
                        const newSharing = e.target.value;
                        setSelectedSharingType(newSharing);

                        // Update floor to first available for this sharing
                        const firstFloor = floors.find(floor =>
                          floor.rooms.some(room =>
                            (!newSharing || room.beds.length === Number(newSharing)) &&
                            room.beds.some(bed => bed.status === 'vacant')
                          )
                        );

                        if (firstFloor) {
                          setSelectedFloorId(firstFloor.id);
                          const firstRoom = firstFloor.rooms.find(r =>
                            (!newSharing || r.beds.length === Number(newSharing)) &&
                            r.beds.some(b => b.status === 'vacant')
                          );
                          if (firstRoom) {
                            setSelectedRoomId(firstRoom.id);
                            const firstBed = firstRoom.beds.find(b => b.status === 'vacant');
                            setSelectedBedId(firstBed?.id || '');
                          }
                        } else {
                          setSelectedFloorId('');
                          setSelectedRoomId('');
                          setSelectedBedId('');
                        }
                      }}
                      className="w-full appearance-none border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 pr-10 text-sm outline-none transition-all bg-white cursor-pointer"
                    >
                      <option value="">All Sharing Types</option>
                      {availableSharingTypes.map(type => (
                        <option key={type} value={type}>{type} Sharing</option>
                      ))}
                      {availableSharingTypes.length === 0 && <option value="">No vacancy</option>}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 block">Floor</label>
                    <div className="relative">
                      <select
                        value={selectedFloorId}
                        onChange={(e) => {
                          const newFloorId = e.target.value;
                          setSelectedFloorId(newFloorId);
                          // Update room to first available in new floor with selected sharing
                          const floor = floors.find(f => f.id === newFloorId);
                          const firstRoom = floor?.rooms.find(r =>
                            (!selectedSharingType || r.beds.length === Number(selectedSharingType)) &&
                            r.beds.some(b => b.status === 'vacant')
                          );
                          if (firstRoom) {
                            setSelectedRoomId(firstRoom.id);
                            const firstBed = firstRoom.beds.find(b => b.status === 'vacant');
                            setSelectedBedId(firstBed?.id || '');
                          }
                        }}
                        className="w-full appearance-none border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 pr-10 text-sm outline-none transition-all bg-white cursor-pointer"
                      >
                        {availableFloors.map(floor => (
                          <option key={floor.id} value={floor.id}>{floor.name}</option>
                        ))}
                        {availableFloors.length === 0 && <option value="">No vacancy</option>}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 block">Room</label>
                    <div className="relative">
                      <select
                        value={selectedRoomId}
                        onChange={(e) => {
                          const newRoomId = e.target.value;
                          setSelectedRoomId(newRoomId);
                          // Update bed to first available in new room
                          for (const f of floors) {
                            const r = f.rooms.find(room => room.id === newRoomId);
                            if (r) {
                              const firstBed = r.beds.find(b => b.status === 'vacant');
                              setSelectedBedId(firstBed?.id || '');
                              break;
                            }
                          }
                        }}
                        className="w-full appearance-none border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 pr-10 text-sm outline-none transition-all bg-white cursor-pointer"
                      >
                        {availableRooms.map(room => (
                          <option key={room.id} value={room.id}>{room.number}</option>
                        ))}
                        {availableRooms.length === 0 && <option value="">Select Floor first</option>}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 block">Bed</label>
                    <div className="relative">
                      <select
                        value={selectedBedId}
                        onChange={(e) => setSelectedBedId(e.target.value)}
                        className="w-full appearance-none border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 pr-10 text-sm outline-none transition-all bg-white cursor-pointer"
                      >
                        {availableBeds.map(bed => (
                          <option key={bed.id} value={bed.id}>{bed.name}</option>
                        ))}
                        {availableBeds.length === 0 && <option value="">Select Room first</option>}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-900 block">Stay Time(Days)</label>
              <div className="relative">
                <input
                  type="number"
                  name="stayTime"
                  min="1"
                  step="1"
                  value={stayDurationDays}
                  onChange={(e) => setStayDurationDays(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 uppercase tracking-wider pointer-events-none">Days</div>
              </div>
              {stayDurationDays && Number(stayDurationDays) > 0 && (
                <p className="text-xs text-gray-500">Expected vacating date: {formatDate(addDaysToDateOnly(joiningDate, Number(stayDurationDays)))}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-900 block">Name <span className="text-red-500">*</span>{isJoinRequest && <span className="text-xs text-gray-500 ml-2">(from request)</span>}</label>
              <input
                type="text"
                name="name"
                required
                disabled={isJoinRequest}
                defaultValue={reAddData?.name || ''}
                placeholder="e.g. Aarav Sharma"
                className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Phone No. <span className="text-red-500">*</span>{isJoinRequest && <span className="text-xs text-gray-500 ml-2">(from request)</span>}</label>
                <div className="flex">
                  <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-white text-gray-500 text-sm font-medium">
                    +91
                  </span>
                  <input
                    type="tel"
                    name="phone"
                    required
                    disabled={isJoinRequest}
                    inputMode="numeric"
                    pattern="\d{10}"
                    minLength={10}
                    maxLength={10}
                    title="Phone number must be exactly 10 digits"
                    defaultValue={(reAddData?.phone || '').replace(/\D/g, '').slice(-10)}
                    onInput={(e) => {
                      if (!isJoinRequest) {
                        const input = e.currentTarget;
                        input.value = input.value.replace(/\D/g, '').slice(0, 10);
                      }
                    }}
                    placeholder="98765 43210"
                    className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-r-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
                  />
                  {isJoinRequest && (
                    <input
                      type="hidden"
                      name="phone"
                      value={(reAddData?.phone || '').replace(/\D/g, '').slice(-10)}
                    />
                  )}
                </div>
              </div>
            <div className="space-y-1.5 relative">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium text-gray-900 block">Joining Date</label>
                <button
                  type="button"
                  onClick={() => setShowJoiningInfo(!showJoiningInfo)}
                  className="text-red-500 hover:text-red-600 transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>

              <AnimatePresence>
                {showJoiningInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    className="absolute z-20 bottom-full left-0 mb-2 w-56 bg-gray-900 text-white text-[11px] p-2.5 rounded-xl shadow-xl border border-gray-800"
                  >
                    <div className="relative pr-5">
                      <button
                        type="button"
                        aria-label="Close joining date info"
                        onClick={() => setShowJoiningInfo(false)}
                        className="absolute -top-0.5 -right-0.5 text-gray-300 hover:text-white transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      This date will be due date
                      <div className="absolute -bottom-3.5 left-2 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-800"></div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <input
                type="date"
                name="joiningDate"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-900 block">Monthly Rent <span className="text-red-500">*</span></label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</div>
                  <input
                    type="number"
                    name="rent"
                    required
                    key={prefilledRent} // re-mount when prefilled changes
                    defaultValue={prefilledRent || ''}
                    placeholder="e.g. 8000"
                    className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-8 pr-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400"
                  />
                </div>
                {prefilledRent && (
                  <p className="text-xs text-blue-600 font-medium mt-1">Auto-filled from room sharing type</p>
                )}
            </div>
            {collectsSecurityDeposit && <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-900 block">Security Deposit</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</div>
                <input
                  type="number"
                  name="deposit"
                  key={hostelProfile?.security_deposit || securityDeposit || 'deposit'}
                  defaultValue={hostelProfile?.security_deposit || securityDeposit || ''}
                  placeholder="e.g. 1000"
                  className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-8 pr-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            </div>}
          </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Emergency Contact No.{isJoinRequest && <span className="text-xs text-gray-500 ml-2">(from request)</span>}</label>
                <div className="flex">
                  <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-white text-gray-500 text-sm font-medium">
                    +91
                  </span>
                  <input
                    type="tel"
                    name="emergencyPhone"
                    disabled={isJoinRequest}
                    inputMode="numeric"
                    pattern="\d{10}"
                    minLength={10}
                    maxLength={10}
                    title="Emergency number must be exactly 10 digits"
                    defaultValue={(reAddData?.emergencyPhone || '').replace(/\D/g, '').slice(-10)}
                    onInput={(e) => {
                      if (!isJoinRequest) {
                        const input = e.currentTarget;
                        input.value = input.value.replace(/\D/g, '').slice(0, 10);
                      }
                    }}
                    placeholder="98765 43210"
                    className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-r-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 block">Aadhar No.{isJoinRequest && <span className="text-xs text-gray-500 ml-2">(from request)</span>}</label>
                <input
                  type="text"
                name="aadhar"
                disabled={isJoinRequest}
                defaultValue={reAddData?.aadhar || ''}
                placeholder="1234 5678 9012"
                className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-900 block">State{isJoinRequest && <span className="text-xs text-gray-500 ml-2">(from request)</span>}</label>
              <input
                type="text"
                name="state"
                disabled={isJoinRequest}
                defaultValue={reAddData?.state || ''}
                placeholder="e.g. Karnataka"
                className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-900 block">Country{isJoinRequest && <span className="text-xs text-gray-500 ml-2">(from request)</span>}</label>
              <input
                type="text"
                name="country"
                disabled={isJoinRequest}
                defaultValue={reAddData?.country || 'India'}
                placeholder="e.g. India"
                className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-900 block mb-2">Reserve Bed?</label>
              <div className="flex items-center gap-4 h-[46px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="reserved" value="yes" className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="reserved" value="no" defaultChecked className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">No</span>
                </label>
              </div>
            </div>
          </div>
          </div>

          <div className="p-6 pt-4 border-t border-gray-100 shrink-0 bg-white">
            <button
              type="submit"
              disabled={!selectedBedId || isApprovingJoinRequest}
              className="w-full bg-[#1D4ED8] hover:bg-[#1e40af] disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-base font-semibold shadow-sm transition-colors"
            >
              {isApprovingJoinRequest ? 'Approving…' : isReAdd ? 'Confirm Re-add' : isJoinRequest ? 'Confirm Add' : 'Add Resident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
