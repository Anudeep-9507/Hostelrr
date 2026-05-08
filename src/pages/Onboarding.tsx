import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ArrowLeft, Check, Building2, CalendarDays, User2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  // Union Territories
  'Andaman & Nicobar Islands', 'Chandigarh',
  'Dadra & Nagar Haveli and Daman & Diu', 'Delhi (NCT)',
  'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export default function Onboarding() {
  const { completeOnboarding } = useApp();
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Step 2
  const [hostelName, setHostelName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('India');
  const [pincode, setPincode] = useState('');

  // Step 3
  const [numFloors, setNumFloors] = useState<number | null>(null);
  const [customFloors, setCustomFloors] = useState('');
  const [numRooms, setNumRooms] = useState('');
  const [roomsPerFloor, setRoomsPerFloor] = useState<Record<number, string>>({});
  const [totalBeds, setTotalBeds] = useState('');

  // Step 4
  const [selectedSharing, setSelectedSharing] = useState<number[]>([]);
  const [roomsPerSharing, setRoomsPerSharing] = useState<Record<number, string>>({});

  // Step 5
  const [rentPerSharing, setRentPerSharing] = useState<Record<number, string>>({});
  const [securityDeposit, setSecurityDeposit] = useState<string>('');

  // Step 6
  const [rentDueType, setRentDueType] = useState<'1st_of_month' | 'joining_date' | ''>('');

  const toggleSharing = (num: number) => {
    setSelectedSharing(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const getEffectiveFloors = () => {
    if (numFloors === 4) return parseInt(customFloors || '4');
    return numFloors || 1;
  };

  const getTotalRoomsFromFloors = () => {
    const floors = getEffectiveFloors();
    return Array.from({ length: floors }, (_, i) => i + 1)
      .reduce((acc, f) => acc + parseInt(roomsPerFloor[f] || '0'), 0);
  };

  const isStep3Valid = () => {
    if (!numFloors) return false;
    if (numFloors === 4 && !customFloors) return false;
    const floors = getEffectiveFloors();
    const allFilled = Array.from({ length: floors }, (_, i) => i + 1)
      .every(f => parseInt(roomsPerFloor[f] || '0') > 0);
    return allFilled && !!totalBeds && parseInt(totalBeds) > 0;
  };

  const calculateTotalBeds = () => {
    return selectedSharing.reduce((acc, curr) => {
      return acc + (parseInt(roomsPerSharing[curr] || '0') * curr);
    }, 0);
  };

  const calculateTotalRoomsFromSharing = () => {
    return selectedSharing.reduce((acc, curr) => {
      return acc + (parseInt(roomsPerSharing[curr] || '0'));
    }, 0);
  };

  const handleFinish = async () => {
    const totalRooms = getTotalRoomsFromFloors() || parseInt(numRooms || '0');
    const bpR = Math.round(parseInt(totalBeds || '0') / Math.max(totalRooms, 1));
    // Use step-4 sharing configs if filled, otherwise derive from floor data
    const sharingConfigs = selectedSharing.length > 0
      ? selectedSharing.map(sharing => ({
          sharing,
          roomCount: parseInt(roomsPerSharing[sharing] || '0'),
          rent: rentPerSharing[sharing] || '0'
        }))
      : [{ sharing: Math.max(bpR, 1), roomCount: totalRooms, rent: '0' }];

    try {
      await completeOnboarding({
        hostelName, ownerName, phone, city, state, country, pincode,
        numFloors: getEffectiveFloors(),
        numRooms: calculateTotalRoomsFromSharing() || getTotalRoomsFromFloors() || parseInt(numRooms || '0'),
        roomsPerFloor,
        totalBeds: parseInt(totalBeds || '0'),
        sharingConfigs,
        rentDueType: rentDueType || '1st_of_month',
        rentDueDate: rentDueType === '1st_of_month' ? 1 : 0,
        securityDeposit
      });
    } catch (e: any) {
      alert("Failed to create hostel: " + (e.message || JSON.stringify(e)));
    }
  };

  const renderProgress = () => {
    if (step > totalSteps) return null;
    return (
      <div className="w-full max-w-md mx-auto mb-8">
        <div className="flex items-center justify-between text-sm font-semibold text-gray-500 mb-3">
          <span>Step {step} of {totalSteps}</span>
          <span>{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <motion.div
            className="h-full bg-blue-600 rounded-full"
            initial={{ width: `${((step - 1) / totalSteps) * 100}%` }}
            animate={{ width: `${(step / totalSteps) * 100}%` }}
            transition={{ ease: "easeInOut", duration: 0.3 }}
          />
        </div>
      </div>
    );
  };

  const nextStep = () => {
    if (step < totalSteps + 1) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const buttonClass = "w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-base shadow-sm";
  const inputClass = "w-full border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 bg-gray-50 hover:bg-gray-100/50 focus:bg-white";
  const labelClass = "text-sm font-bold text-gray-800 block mb-1.5";

  return (
    <div className="min-h-screen bg-[#F8FAFC] overflow-y-auto flex flex-col items-center justify-start py-8 px-4 sm:px-6 font-sans relative">
      <div className="w-full max-w-lg">
        {renderProgress()}

        <div className="bg-white rounded-2xl sm:border sm:border-gray-100 sm:shadow-lg p-5 sm:p-8 flex flex-col justify-center relative overflow-hidden">
          <AnimatePresence mode="wait">

            {/* Step 1 - Welcome */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-6 py-4"
              >
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600">
                  <Building2 className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-2">Welcome to Hostelrr</h1>
                  <p className="text-base text-gray-500 font-medium">Let's set up your hostel in 3 minutes.</p>
                </div>
                <button onClick={nextStep} className={buttonClass}>
                  Start Setup <ArrowRight className="w-5 h-5" />
                </button>
              </motion.div>
            )}

            {/* Step 2 - Hostel Info */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-1">Tell us about your hostel</h2>
                  <p className="text-sm text-gray-500">Just the basic details.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Hostel Name</label>
                    <input type="text" value={hostelName} onChange={e => setHostelName(e.target.value)} placeholder="e.g. Sai Krupa PG" className={inputClass} autoFocus />
                  </div>
                  <div>
                    <label className={labelClass}>Owner Name</label>
                    <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="e.g. Aryan O." className={inputClass} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Mobile Number</label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 9876543210" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Area & City</label>
                      <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Madhapur, Hyderabad" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>State</label>
                    <select
                      value={state}
                      onChange={e => setState(e.target.value)}
                      className={cn(inputClass, "appearance-none cursor-pointer")}
                    >
                      <option value="">Select your state</option>
                      {INDIAN_STATES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Country</label>
                    <select
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      className={cn(inputClass, "appearance-none cursor-pointer")}
                    >
                      <option value="India">India</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>PIN Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pincode}
                      onChange={e => setPincode(e.target.value)}
                      placeholder="e.g. 500081"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="pt-3 flex gap-3">
                  <button onClick={prevStep} className="p-3 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button onClick={nextStep} disabled={!hostelName} className={cn(buttonClass, !hostelName && "opacity-50 cursor-not-allowed")}>
                    Next
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3 - Building Setup */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-1">Your building setup</h2>
                  <p className="text-sm text-gray-500">How big is your property?</p>
                </div>

                <div className="space-y-8">
                  <div>
                    <label className={labelClass}>Number of Floors</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map(num => (
                        <button
                          key={num}
                          onClick={() => { setNumFloors(num); if (num !== 4) setCustomFloors(''); }}
                          className={cn(
                            "py-3 text-base font-bold rounded-xl border-2 transition-all",
                            numFloors === num
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"
                          )}
                        >
                          {num}{num === 4 ? '+' : ''}
                        </button>
                      ))}
                    </div>
                    {numFloors === 4 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-4 overflow-hidden"
                      >
                        <label className="text-sm font-semibold text-gray-600 block mb-2">Enter exact number of floors</label>
                        <input
                          type="number"
                          min="4"
                          value={customFloors}
                          onChange={e => setCustomFloors(e.target.value)}
                          placeholder="e.g. 7"
                          className={inputClass}
                          autoFocus
                        />
                      </motion.div>
                    )}
                  </div>

                  {/* Per-floor room inputs */}
                  {numFloors !== null && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="overflow-hidden space-y-4"
                    >
                      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 space-y-3">
                        <label className="text-sm font-bold tracking-wide text-gray-700 uppercase block">Rooms per Floor</label>
                        {Array.from({ length: getEffectiveFloors() }, (_, i) => i + 1).map(f => (
                          <div key={f} className="flex items-center gap-4">
                            <div className="w-20 font-bold text-gray-600 text-sm">Floor {f}</div>
                            <input
                              type="number"
                              min="0"
                              placeholder="No. of rooms"
                              value={roomsPerFloor[f] || ''}
                              onChange={e => setRoomsPerFloor(prev => ({ ...prev, [f]: e.target.value }))}
                              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white"
                            />
                          </div>
                        ))}

                        <div className="pt-3 mt-1 border-t border-gray-200 flex justify-between items-center text-sm font-bold text-gray-700">
                          <span>Total Rooms:</span>
                          <span className="text-blue-600 text-base bg-blue-50 px-3 py-1 rounded-lg">{getTotalRoomsFromFloors()}</span>
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Total Beds</label>
                        <input
                          type="number"
                          min="1"
                          value={totalBeds}
                          onChange={e => setTotalBeds(e.target.value)}
                          placeholder="e.g. 34"
                          className={inputClass}
                        />
                        <p className="text-sm font-medium text-gray-500 mt-3">You can customise exact room types in the next step.</p>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="pt-3 flex gap-3">
                  <button onClick={prevStep} className="p-3 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextStep}
                    disabled={!isStep3Valid()}
                    className={cn(buttonClass, !isStep3Valid() && "opacity-50 cursor-not-allowed")}
                  >
                    Next
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 4 - Room Sharing Types */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-1">Room sharing types</h2>
                  <p className="text-sm text-gray-500">Select the types of rooms you have.</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => {
                    const isSelected = selectedSharing.includes(num);
                    return (
                      <button
                        key={num}
                        onClick={() => toggleSharing(num)}
                        className={cn(
                          "flex items-center gap-2 p-3 border-2 rounded-xl text-left transition-all",
                          isSelected
                            ? "border-blue-600 bg-blue-50"
                            : "border-gray-100 bg-white hover:border-gray-200"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                          isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"
                        )}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <span className={cn("font-bold text-sm", isSelected ? "text-blue-900" : "text-gray-700")}>
                          {num} Sharing
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedSharing.length > 0 && (
                  <>
                    <div className="space-y-4 bg-gray-50 p-5 rounded-2xl border border-gray-100">
                      <label className="text-sm font-bold tracking-wide text-gray-800 uppercase block mb-1">Rooms & Rent per Sharing Type</label>
                      {selectedSharing.sort().map(num => (
                        <div key={num} className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="w-24 font-bold text-gray-700">{num} Sharing</div>
                          <div className="flex gap-2 flex-1">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                placeholder="# of rooms"
                                value={roomsPerSharing[num] || ''}
                                onChange={(e) => setRoomsPerSharing(prev => ({ ...prev, [num]: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white font-semibold"
                              />
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold uppercase">Rooms</div>
                            </div>
                            <div className="relative flex-1">
                              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</div>
                              <input
                                type="number"
                                min="0"
                                placeholder="Rent/bed"
                                value={rentPerSharing[num] || ''}
                                onChange={(e) => setRentPerSharing(prev => ({ ...prev, [num]: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white font-semibold"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4 bg-gray-50 p-5 rounded-2xl border border-gray-100 mt-4">
                      <label className="text-sm font-bold tracking-wide text-gray-800 uppercase block mb-1">Global Security Deposit</label>
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</div>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 15000"
                          value={securityDeposit}
                          onChange={(e) => setSecurityDeposit(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white font-semibold"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="pt-2 flex gap-3">
                  <button onClick={prevStep} className="p-3 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button onClick={nextStep} disabled={selectedSharing.length === 0} className={cn(buttonClass, selectedSharing.length === 0 && "opacity-50 cursor-not-allowed")}>
                    Next
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 5 - Rent Collection */}
            {step === 5 && (
              <motion.div
                key="step6"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-1">Rent collection</h2>
                  <p className="text-sm text-gray-500">When is rent due every month?</p>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={() => setRentDueType('1st_of_month')}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all",
                      rentDueType === '1st_of_month'
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                      rentDueType === '1st_of_month' ? "border-blue-600 bg-blue-600" : "border-gray-300"
                    )}>
                      {rentDueType === '1st_of_month' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div>
                      <div className={cn("font-bold text-sm", rentDueType === '1st_of_month' ? "text-blue-900" : "text-gray-800")}>
                        1st of every month
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">All residents pay on the 1st</div>
                    </div>
                    <CalendarDays className={cn("w-5 h-5 ml-auto shrink-0", rentDueType === '1st_of_month' ? "text-blue-500" : "text-gray-300")} />
                  </button>

                  <button
                    onClick={() => setRentDueType('joining_date')}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all",
                      rentDueType === 'joining_date'
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                      rentDueType === 'joining_date' ? "border-blue-600 bg-blue-600" : "border-gray-300"
                    )}>
                      {rentDueType === 'joining_date' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div>
                      <div className={cn("font-bold text-sm", rentDueType === 'joining_date' ? "text-blue-900" : "text-gray-800")}>
                        Based on resident joining date
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">Each resident's due date matches their join date</div>
                    </div>
                    <User2 className={cn("w-5 h-5 ml-auto shrink-0", rentDueType === 'joining_date' ? "text-blue-500" : "text-gray-300")} />
                  </button>
                </div>

                <div className="pt-2 flex gap-3">
                  <button onClick={prevStep} className="p-3 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextStep}
                    disabled={!rentDueType}
                    className={cn(buttonClass, !rentDueType && "opacity-50 cursor-not-allowed")}
                  >
                    Complete Setup
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 6 - Done */}
            {step === 6 && (
              <motion.div
                key="step6done"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="text-center space-y-6 py-4"
              >
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-600">
                  <Check className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-2">Your hostel is ready 🎉</h1>
                  <p className="text-base text-gray-500 font-medium">Start managing your hostel now.</p>
                </div>
                <button onClick={handleFinish} className={buttonClass}>
                  Go to Dashboard <ArrowRight className="w-5 h-5" />
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
