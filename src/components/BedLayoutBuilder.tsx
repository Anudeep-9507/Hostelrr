import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { RotateCcw, Save, LayoutTemplate, CheckCircle, Plus, X, Minus, Move, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
 
export const LAYOUT_COLORS = [
  { name: 'Blue', class: 'bg-blue-50 text-blue-600 border-blue-200', dot: 'bg-blue-500', hover: 'hover:bg-blue-100' },
  { name: 'Pink', class: 'bg-pink-50 text-pink-600 border-pink-200', dot: 'bg-pink-500', hover: 'hover:bg-pink-100' },
  { name: 'Purple', class: 'bg-purple-50 text-purple-600 border-purple-200', dot: 'bg-purple-500', hover: 'hover:bg-purple-100' },
  { name: 'Amber', class: 'bg-amber-50 text-amber-600 border-amber-200', dot: 'bg-amber-500', hover: 'hover:bg-amber-100' },
  { name: 'Emerald', class: 'bg-emerald-50 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500', hover: 'hover:bg-emerald-100' },
];
 
export interface Template {
  id: string;
  sharing: number;
  positions: Record<string, {x: number, y: number, rotated: boolean}>;
  door: 'N'|'S'|'E'|'W' | null;
  color: string;
}
 
type SharingType = number;

function getDefaultPositions(sharing: SharingType) {
  const positions: Record<string, {x: number, y: number, rotated: boolean}> = {};
  if (sharing === 1) {
    positions['A'] = { x: 112, y: 180, rotated: false };
  } else if (sharing === 2) {
    positions['A'] = { x: 40, y: 180, rotated: false };
    positions['B'] = { x: 184, y: 180, rotated: false };
  } else if (sharing === 3) {
    positions['A'] = { x: 40, y: 60, rotated: false };
    positions['B'] = { x: 184, y: 60, rotated: false };
    positions['C'] = { x: 112, y: 300, rotated: false };
  } else if (sharing === 4) {
    positions['A'] = { x: 40, y: 60, rotated: false };
    positions['B'] = { x: 184, y: 60, rotated: false };
    positions['C'] = { x: 40, y: 300, rotated: false };
    positions['D'] = { x: 184, y: 300, rotated: false };
  } else if (sharing === 5) {
    positions['A'] = { x: 10, y: 60, rotated: false };
    positions['B'] = { x: 112, y: 60, rotated: false };
    positions['C'] = { x: 214, y: 60, rotated: false };
    positions['D'] = { x: 60, y: 300, rotated: false };
    positions['E'] = { x: 164, y: 300, rotated: false };
  } else if (sharing === 6) {
    positions['A'] = { x: 10, y: 60, rotated: false };
    positions['B'] = { x: 112, y: 60, rotated: false };
    positions['C'] = { x: 214, y: 60, rotated: false };
    positions['D'] = { x: 10, y: 300, rotated: false };
    positions['E'] = { x: 112, y: 300, rotated: false };
    positions['F'] = { x: 214, y: 300, rotated: false };
  } else if (sharing === 7) {
    positions['A'] = { x: 10, y: 20, rotated: false };
    positions['B'] = { x: 112, y: 20, rotated: false };
    positions['C'] = { x: 214, y: 20, rotated: false };
    positions['D'] = { x: 10, y: 180, rotated: false };
    positions['E'] = { x: 214, y: 180, rotated: false };
    positions['F'] = { x: 60, y: 340, rotated: false };
    positions['G'] = { x: 164, y: 340, rotated: false };
  } else if (sharing === 8) {
    positions['A'] = { x: 10, y: 20, rotated: false };
    positions['B'] = { x: 112, y: 20, rotated: false };
    positions['C'] = { x: 214, y: 20, rotated: false };
    positions['D'] = { x: 10, y: 180, rotated: false };
    positions['E'] = { x: 214, y: 180, rotated: false };
    positions['F'] = { x: 10, y: 340, rotated: false };
    positions['G'] = { x: 112, y: 340, rotated: false };
    positions['H'] = { x: 214, y: 340, rotated: false };
  } else if (sharing === 9) {
    positions['A'] = { x: 10, y: 20, rotated: false };
    positions['B'] = { x: 112, y: 20, rotated: false };
    positions['C'] = { x: 214, y: 20, rotated: false };
    positions['D'] = { x: 10, y: 180, rotated: false };
    positions['E'] = { x: 112, y: 180, rotated: false };
    positions['F'] = { x: 214, y: 180, rotated: false };
    positions['G'] = { x: 10, y: 340, rotated: false };
    positions['H'] = { x: 112, y: 340, rotated: false };
    positions['I'] = { x: 214, y: 340, rotated: false };
  } else if (sharing === 10) {
    positions['A'] = { x: 10, y: 20, rotated: false };
    positions['B'] = { x: 112, y: 20, rotated: false };
    positions['C'] = { x: 214, y: 20, rotated: false };
    positions['D'] = { x: 10, y: 125, rotated: false };
    positions['E'] = { x: 214, y: 125, rotated: false };
    positions['F'] = { x: 10, y: 235, rotated: false };
    positions['G'] = { x: 214, y: 235, rotated: false };
    positions['H'] = { x: 10, y: 340, rotated: false };
    positions['I'] = { x: 112, y: 340, rotated: false };
    positions['J'] = { x: 214, y: 340, rotated: false };
  } else {
    // Fallback for > 10 sharing
    for (let i = 0; i < sharing; i++) {
      const letter = String.fromCharCode(65 + i);
      positions[letter] = { x: (i % 3) * 100 + 10, y: Math.floor(i / 3) * 60 + 20, rotated: false };
    }
  }
  return positions;
}

export default function BedLayoutBuilder({ hostelId }: { hostelId?: string }) {
  const { sharingRentMap } = useApp();

  // Compute a per-hostel localStorage key so each account has isolated templates.
  // Falls back to the legacy shared key when hostelId is not yet known (e.g. demo mode).
  const STORAGE_KEY = hostelId ? `hostelrr_all_templates_${hostelId}` : 'hostelrr_all_templates';
  const onboardedTabs = Object.keys(sharingRentMap).map(Number).sort((a, b) => a - b);
  const [availableTabs, setAvailableTabs] = useState<number[]>(onboardedTabs.length > 0 ? onboardedTabs : [1, 2, 4]);
  
  const initialTemplates = (() => {
    try {
      // Try the scoped (per-hostel) key first
      const scoped = localStorage.getItem(STORAGE_KEY);
      if (scoped) return JSON.parse(scoped);

      // One-time migration: if there is data in the old shared key and we now
      // have a real hostelId, move it into the scoped key and clear the old one.
      if (hostelId) {
        const shared = localStorage.getItem('hostelrr_all_templates');
        if (shared) {
          localStorage.setItem(STORAGE_KEY, shared);
          localStorage.removeItem('hostelrr_all_templates');
          return JSON.parse(shared);
        }
      }
    } catch (e) {}
    
    // Legacy per-sharing-type keys (very old format)
    const legacy: Template[] = [];
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(s => {
      try {
        const old = localStorage.getItem(`hostelrr_template_${s}`);
        if (old) {
          const p = JSON.parse(old);
          legacy.push({
            id: `t${s}_legacy`,
            sharing: s,
            positions: p.positions,
            door: p.door,
            color: 'Blue'
          });
        }
      } catch (e) {}
    });
    return legacy;
  })();

  const [allTemplates, setAllTemplates] = useState<Template[]>(initialTemplates);

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(() => {
    if (initialTemplates.length > 0) return initialTemplates[0].id;
    return null;
  });
  
  const [activeSharing, setActiveSharing] = useState<number>(() => {
    if (initialTemplates.length > 0) return initialTemplates[0].sharing;
    return availableTabs[0];
  });

  const roomRef = useRef<HTMLDivElement>(null);
  
  // Local state for editing the active template
  const [editingPositions, setEditingPositions] = useState<Record<string, {x: number, y: number, rotated: boolean}>>(getDefaultPositions(activeSharing));
  const [editingDoor, setEditingDoor] = useState<'N'|'S'|'E'|'W' | null>(null);
  const [editingColor, setEditingColor] = useState<string>('Blue');

  // Sync editing state when active template changes
  React.useEffect(() => {
    if (activeTemplateId) {
      const template = allTemplates.find(t => t.id === activeTemplateId);
      if (template) {
        setEditingPositions(template.positions);
        setEditingDoor(template.door);
        setEditingColor(template.color);
        setActiveSharing(template.sharing);
      }
    } else {
      setEditingPositions(getDefaultPositions(activeSharing));
      setEditingDoor(null);
      setEditingColor('Blue');
    }
  }, [activeTemplateId, allTemplates, activeSharing]);

  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customSharingValue, setCustomSharingValue] = useState('');

  const beds = Array.from({length: activeSharing}).map((_, i) => String.fromCharCode(65 + i));

  const handleReset = () => {
    setEditingPositions(getDefaultPositions(activeSharing));
    toast.success('Layout reset to default positions');
  };

  const handleSpacing = (direction: 'increase' | 'decrease') => {
    const centerX = 160;
    const centerY = 200;
    const shift = direction === 'increase' ? 24 : -24;

    const newPos = { ...editingPositions };
    
    Object.keys(newPos).forEach(label => {
      const p = newPos[label];
      const bedW = p.rotated ? 48 : 96;
      const bedH = p.rotated ? 96 : 44;

      const bedCenterX = p.x + bedW / 2;
      const bedCenterY = p.y + bedH / 2;

      let dx = 0;
      if (bedCenterX < centerX - 10) dx = -1;
      else if (bedCenterX > centerX + 10) dx = 1;

      let dy = 0;
      if (bedCenterY < centerY - 10) dy = -1;
      else if (bedCenterY > centerY + 10) dy = 1;

      let newX = p.x + (dx * shift);
      let newY = p.y + (dy * shift);

      const GRID_SIZE = 24;
      newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
      newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

      newX = Math.max(0, Math.min(newX, 316 - bedW));
      newY = Math.max(0, Math.min(newY, 396 - bedH));

      newPos[label] = { ...p, x: newX, y: newY };
    });

    setEditingPositions(newPos);
  };

  const handleSave = () => {
    let updatedTemplates = [...allTemplates];
    const newTemplate: Template = {
      id: activeTemplateId || `t${activeSharing}_${Date.now()}`,
      sharing: activeSharing,
      positions: editingPositions,
      door: editingDoor,
      color: editingColor
    };

    const index = updatedTemplates.findIndex(t => t.id === newTemplate.id);
    if (index >= 0) {
      updatedTemplates[index] = newTemplate;
    } else {
      updatedTemplates.push(newTemplate);
    }

    setAllTemplates(updatedTemplates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTemplates));
    setActiveTemplateId(newTemplate.id);
    toast.success('Template saved successfully!');
  };

  const handleDeleteTemplate = () => {
    if (!activeTemplateId) return;
    
    const templateToDelete = allTemplates.find(t => t.id === activeTemplateId);
    if (!templateToDelete) return;

    if (!window.confirm(`Are you sure you want to delete this ${templateToDelete.sharing}-sharing layout version?`)) return;

    const newTemplates = allTemplates.filter(t => t.id !== activeTemplateId);
    setAllTemplates(newTemplates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newTemplates));
    
    if (newTemplates.length > 0) {
      // Try to find another template with the same sharing
      const sameSharing = newTemplates.find(t => t.sharing === templateToDelete.sharing);
      if (sameSharing) {
        setActiveTemplateId(sameSharing.id);
        setActiveSharing(sameSharing.sharing);
      } else {
        setActiveTemplateId(newTemplates[0].id);
        setActiveSharing(newTemplates[0].sharing);
      }
    } else {
      setActiveTemplateId(null);
    }
    toast.success("Layout version deleted successfully");
  };

  const handleAddNewLayout = (sharing: number) => {
    // Find next available color
    const existingColors = allTemplates.filter(t => t.sharing === sharing).map(t => t.color);
    const nextColor = LAYOUT_COLORS.find(c => !existingColors.includes(c.name))?.name || 'Blue';
    
    const newTemplate: Template = {
      id: `t${sharing}_${Date.now()}`,
      sharing: sharing,
      positions: getDefaultPositions(sharing),
      door: null,
      color: nextColor
    };
    
    const updated = [...allTemplates, newTemplate];
    setAllTemplates(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setActiveTemplateId(newTemplate.id);
    setActiveSharing(sharing);
  };

  const handleAddCustomLayoutClick = () => {
    setIsAddingCustom(true);
    setCustomSharingValue('');
  };

  const handleConfirmCustomLayout = () => {
    const newSharing = parseInt(customSharingValue, 10);
    if (isNaN(newSharing) || newSharing <= 0) {
      toast.error("Please enter a valid number greater than 0");
      return;
    }
    
    if (!availableTabs.includes(newSharing)) {
      setAvailableTabs(prev => [...prev, newSharing].sort((a, b) => a - b));
    }
    
    // Create first template for this sharing if not exists
    const existing = allTemplates.find(t => t.sharing === newSharing);
    if (!existing) {
      handleAddNewLayout(newSharing);
    } else {
      setActiveSharing(newSharing);
      setActiveTemplateId(existing.id);
    }
    
    setIsAddingCustom(false);
  };

  return (
    <div className="bg-white p-0 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="py-4 px-5 border-b border-gray-100 bg-white">
        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <LayoutTemplate className="w-6 h-6 text-[#1D4ED8]" />
          Bed Layout Templates
        </h3>
        <p className="text-gray-400 text-[13px] mt-0.5">Create standard bed positions for each sharing room type.</p>
        
        {/* Tabs */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          {availableTabs.map(sharing => {
            const templates = allTemplates.filter(t => t.sharing === sharing);
            return (
              <div key={sharing} className="flex items-center gap-1">
                {templates.length > 0 ? (
                  templates.map((template, idx) => {
                    const colorConfig = LAYOUT_COLORS.find(c => c.name === template.color) || LAYOUT_COLORS[0];
                    const isActive = activeTemplateId === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => setActiveTemplateId(template.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border-2 ${
                          isActive 
                            ? `${colorConfig.class} shadow-sm scale-105` 
                            : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${colorConfig.dot}`} />
                        {sharing} Sharing {templates.length > 1 ? `(v${idx + 1})` : ''}
                      </button>
                    )
                  })
                ) : (
                  <button
                    onClick={() => handleAddNewLayout(sharing)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap bg-gray-50 text-gray-600 hover:bg-gray-100 border border-transparent`}
                  >
                    {sharing} Sharing
                  </button>
                )}
                <button 
                  onClick={() => handleAddNewLayout(sharing)}
                  title="Add another layout for this sharing"
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div className="w-px h-6 bg-gray-100 mx-1" />
              </div>
            )
          })}
          {isAddingCustom ? (
            <div className="flex items-center gap-1 ml-2 bg-white border border-blue-200 rounded-xl p-1 shadow-sm">
              <input 
                type="number" 
                min="1" 
                value={customSharingValue}
                onChange={(e) => setCustomSharingValue(e.target.value)}
                className="w-16 px-2 py-1 text-sm outline-none bg-transparent"
                placeholder="Beds"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmCustomLayout();
                  if (e.key === 'Escape') setIsAddingCustom(false);
                }}
              />
              <button 
                onClick={handleConfirmCustomLayout}
                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                title="Confirm"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsAddingCustom(false)}
                className="p-1.5 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddCustomLayoutClick}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 transition-colors whitespace-nowrap ml-2"
            >
              <Plus className="w-4 h-4" /> Custom Layout
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100">
        
        {/* LEFT: Canvas */}
        <div className="flex-1 p-6 pb-12 bg-gray-50/50 flex flex-col items-center justify-center min-h-[480px]">
          <div className="relative">
            {/* Compass indicators */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-gray-400 font-bold text-sm select-none">N</div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-gray-400 font-bold text-sm select-none">S</div>
            <div className="absolute top-1/2 -left-6 -translate-y-1/2 text-gray-400 font-bold text-sm select-none">W</div>
            <div className="absolute top-1/2 -right-6 -translate-y-1/2 text-gray-400 font-bold text-sm select-none">E</div>
            
            <div 
              ref={roomRef}
              className="w-[320px] h-[400px] bg-white border-2 border-gray-200 rounded-3xl relative shadow-sm overflow-hidden"
            >
            {/* Guidelines */}
            <div className="absolute top-0 bottom-0 left-1/2 w-px border-l-2 border-dotted border-gray-300 opacity-60" />
            <div className="absolute left-0 right-0 top-1/2 h-px border-t-2 border-dotted border-gray-300 opacity-60" />

            {/* Doors */}
            {['N', 'S', 'E', 'W'].map(pos => {
               const isSelected = editingDoor === pos;
               let classes = "absolute transition-all z-20 cursor-pointer border-2 ";
               if (pos === 'N') classes += "top-0 left-1/2 -translate-x-1/2 w-16 h-3 rounded-b-lg border-t-0 ";
               if (pos === 'S') classes += "bottom-0 left-1/2 -translate-x-1/2 w-16 h-3 rounded-t-lg border-b-0 ";
               if (pos === 'E') classes += "right-0 top-1/2 -translate-y-1/2 w-3 h-16 rounded-l-lg border-r-0 ";
               if (pos === 'W') classes += "left-0 top-1/2 -translate-y-1/2 w-3 h-16 rounded-r-lg border-l-0 ";
               
               classes += isSelected ? "bg-amber-700 border-amber-800 shadow-[0_0_8px_rgba(180,83,9,0.4)]" : "bg-gray-100 border-gray-300 hover:bg-gray-200";
               
               return <div 
                 key={pos} 
                 onClick={() => setEditingDoor(editingDoor === pos ? null : pos as any)} 
                 className={classes} 
                 title={`Set ${pos} Door`} 
               />
            })}

            <div className="absolute top-4 left-4 text-xs font-semibold text-gray-400 select-none uppercase tracking-wider">
              Room Layout
            </div>
            
            {beds.map(bed => {
              const rotated = editingPositions[bed]?.rotated || false;
              return (
                <motion.div
                  key={`${activeTemplateId}-${bed}`}
                  drag
                  dragConstraints={roomRef}
                  dragMomentum={false}
                  dragElastic={0}
                  initial={false}
                  animate={{ 
                    x: editingPositions[bed]?.x || 0, 
                    y: editingPositions[bed]?.y || 0 
                  }}
                  onDragEnd={(e, info) => {
                    const bedW = rotated ? 48 : 96;
                    const bedH = rotated ? 96 : 44;
                    let newX = editingPositions[bed].x + info.offset.x;
                    let newY = editingPositions[bed].y + info.offset.y;
                    
                    const GRID_SIZE = 24;
                    newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
                    newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

                    newX = Math.max(0, Math.min(newX, 316 - bedW));
                    newY = Math.max(0, Math.min(newY, 396 - bedH));
                    
                    setEditingPositions(prev => ({
                      ...prev,
                      [bed]: {
                        ...prev[bed],
                        x: newX,
                        y: newY
                      }
                    }));
                  }}
                  className={`absolute top-0 left-0 bg-blue-50 border-2 border-blue-200 rounded-xl shadow-sm text-blue-900 font-semibold text-sm flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing hover:bg-blue-100 hover:border-blue-300 transition-colors z-10 group ${
                    rotated ? 'w-12 h-24 flex-col' : 'w-24 px-3 py-2.5 flex-row'
                  }`}
                >
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const newRotated = !editingPositions[bed].rotated;
                      const bedW = newRotated ? 48 : 96;
                      const bedH = newRotated ? 96 : 44;
                      let newX = editingPositions[bed].x;
                      let newY = editingPositions[bed].y;
                      newX = Math.max(0, Math.min(newX, 316 - bedW));
                      newY = Math.max(0, Math.min(newY, 396 - bedH));

                      setEditingPositions(prev => ({
                        ...prev,
                        [bed]: {
                          ...prev[bed],
                          rotated: newRotated,
                          x: newX,
                          y: newY
                        }
                      }));
                    }}
                    className="absolute -top-3 -right-3 bg-white border border-gray-200 text-gray-500 hover:text-blue-600 rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-20 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <span className={rotated ? "-rotate-90 origin-center text-sm" : "text-sm"}>Bed {bed}</span>
                </motion.div>
              );
            })}
            </div>
          </div>
        </div>

        {/* RIGHT: Controls */}
        <div className="w-full md:w-96 p-6 flex flex-col bg-white">
          <div className="flex-1 space-y-4">
            <div>
              <div className="text-sm font-medium text-gray-500 uppercase tracking-widest mb-1">Editing Template</div>
              <div className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                {activeSharing} Sharing Room
                <div className={`w-3 h-3 rounded-full ${LAYOUT_COLORS.find(c => c.name === editingColor)?.dot}`} />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 block">Layout Theme Color</label>
              <div className="flex flex-wrap gap-2">
                {LAYOUT_COLORS.map(color => (
                  <button
                    key={color.name}
                    onClick={() => setEditingColor(color.name)}
                    className={`w-10 h-10 rounded-full border-4 transition-all ${color.class} ${editingColor === color.name ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                    title={color.name}
                  >
                    <div className={`w-full h-full rounded-full ${color.dot} opacity-20`} />
                  </button>
                ))}
              </div>
            </div>
            
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Total Beds</span>
                <span className="text-sm font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">{activeSharing}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Drag and drop the beds in the room canvas. These positions will be used as the default layout for new {activeSharing}-sharing rooms.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Move className="w-4 h-4" />
                  Spacing
                </span>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleSpacing('decrease')}
                    className="w-8 h-8 flex items-center justify-center bg-white hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleSpacing('increase')}
                    className="w-8 h-8 flex items-center justify-center bg-white hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <button
                onClick={handleReset}
                className="w-full py-3 px-4 bg-white hover:bg-red-50 text-red-600 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors border border-red-100 hover:border-red-200"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Layout
              </button>

              <button
                onClick={handleDeleteTemplate}
                disabled={!activeTemplateId}
                className="w-full py-3 px-4 bg-white hover:bg-red-50 text-red-600 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors border border-red-100 hover:border-red-200"
              >
                <Trash2 className="w-4 h-4" />
                Delete Layout
              </button>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100">
            <button
              onClick={handleSave}
              className="w-full py-3.5 px-4 bg-[#1D4ED8] hover:bg-[#1e40af] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
