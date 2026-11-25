import React from 'react';
import { Check, Pencil, Plus, Search, StickyNote, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import { supabase } from '../supabaseClient';
import { cn, formatDate } from '../lib/utils';

type Note = { id: string; title: string; description: string; updated_at: string };

export default function Notes() {
  const { hostelProfile, isDemoMode } = useApp();
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isNewNote, setIsNewNote] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const hostelId = hostelProfile?.id;
  const storageKey = `hostelrr_notes:${hostelId || 'default'}`;
  const selected = notes.find(note => note.id === selectedId) || null;

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      if (isDemoMode) {
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (active) setNotes(Array.isArray(stored) ? stored : []);
        } catch { if (active) setNotes([]); }
      } else if (hostelId) {
        const { data, error } = await supabase.from('owner_notes').select('id,title,description,updated_at').eq('hostel_id', hostelId).order('updated_at', { ascending: false });
        if (error) { toast.error('Could not load notes'); if (active) setNotes([]); }
        else if (active) setNotes((data || []) as Note[]);
      }
      if (active) setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [hostelId, isDemoMode, storageKey]);

  const persist = async (next: Note[]) => {
    setNotes(next);
    if (isDemoMode) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { toast.error('Could not save note'); }
      return true;
    }
    return true;
  };

  const createNote = async () => {
    if (!hostelId && !isDemoMode) { toast.error('Your hostel profile is not ready'); return; }
    setSelectedId(null);
    setIsNewNote(true);
    setIsEditing(true);
    setEditTitle('');
    setEditDescription('');
  };

  const saveNote = async () => {
    if (!isNewNote && !selected) return;
    setIsSaving(true);
    const updatedAt = new Date().toISOString();
    try {
      if (isNewNote) {
        const values = { title: editTitle.trim(), description: editDescription, updated_at: updatedAt };
        if (isDemoMode) {
          const note = { ...values, id: crypto.randomUUID() };
          await persist([note, ...notes]);
          setSelectedId(note.id);
        } else {
          const { data, error } = await supabase.from('owner_notes').insert({ ...values, hostel_id: hostelId }).select('id,title,description,updated_at').single();
          if (error) throw error;
          setNotes(current => [data as Note, ...current]);
          setSelectedId(data.id);
        }
        setIsNewNote(false);
      } else if (selected) {
        const updated = { ...selected, title: editTitle.trim(), description: editDescription, updated_at: updatedAt };
        if (isDemoMode) {
          const next = [updated, ...notes.filter(note => note.id !== selected.id)];
          await persist(next);
        } else {
          const { error } = await supabase.from('owner_notes').update({ title: updated.title, description: updated.description, updated_at: updatedAt }).eq('id', selected.id).eq('hostel_id', hostelId);
          if (error) throw error;
          setNotes(current => [updated, ...current.filter(note => note.id !== selected.id)]);
        }
      }
      setIsEditing(false);
      toast.success('Note saved');
    } catch {
      toast.error('Could not save note');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = () => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditDescription(selected.description);
    setIsNewNote(false);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (isNewNote) setSelectedId(null);
    setIsNewNote(false);
    setIsEditing(false);
  };

  const deleteNote = async (note: Note) => {
    if (!isDemoMode) {
      const { error } = await supabase.from('owner_notes').delete().eq('id', note.id).eq('hostel_id', hostelId);
      if (error) { toast.error('Could not delete note'); return; }
    }
    const next = notes.filter(item => item.id !== note.id);
    await persist(next);
    setSelectedId(next[0]?.id || null);
    setIsEditing(false);
    toast.success('Note deleted');
  };

  const filtered = notes.filter(note => `${note.title} ${note.description}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="min-h-full min-w-0 bg-slate-100/60 p-3 sm:p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-5 sm:gap-4 sm:pb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Notes</h1>
            <p className="mt-1 max-w-prose text-sm leading-6 text-slate-500">Keep important reminders and details close at hand.</p>
          </div>
          <button
            onClick={() => void createNote()}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-blue-700 bg-blue-600 px-3 sm:px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(29,78,216,0.8)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_10px_20px_-10px_rgba(29,78,216,0.9)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 active:translate-y-0"
          >
            <Plus className="h-4 w-4" />New note
          </button>
        </header>

        <div className="grid min-h-[min(520px,calc(100dvh-12rem))] min-w-0 grid-cols-1 gap-4 md:min-h-[520px] md:grid-cols-[300px_minmax(0,1fr)] md:gap-5">
          <section className={cn('min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_35px_-24px_rgba(15,23,42,0.55)]', (selected || isNewNote) && 'hidden md:block')}>
            <div className="border-b border-slate-200 bg-slate-50/70 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search notes"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search notes"
                  className="h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-medium text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.05)] outline-none placeholder:font-normal placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 [&::-webkit-search-cancel-button]:hidden"
                />
              </div>
            </div>
            <div className="overflow-y-auto overscroll-contain p-2 md:max-h-[460px]">
              {loading ? (
                <p className="p-5 text-sm text-slate-400">Loading notes…</p>
              ) : filtered.length === 0 ? (
                <div className="m-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center">
                  <StickyNote className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">{query ? 'No matching notes' : 'No notes yet'}</p>
                  <p className="mt-1 text-xs text-slate-400">Create a note to get started.</p>
                </div>
              ) : filtered.map(note => (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelectedId(note.id); setIsEditing(false); setIsNewNote(false); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setSelectedId(note.id); setIsEditing(false); setIsNewNote(false); } }}
                  className={cn(
                    'mb-1 w-full cursor-pointer rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/10',
                    selectedId === note.id
                      ? 'border-blue-200 bg-blue-50/80 shadow-sm'
                      : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                  )}
                >
                  <div className="flex justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{note.title || 'Untitled note'}</p>
                    <button
                      onClick={e => { e.stopPropagation(); void deleteNote(note); }}
                      title="Delete note"
                      aria-label={`Delete ${note.title || 'untitled note'}`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(note.updated_at)}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{note.description || 'No description'}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={cn('min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_35px_-24px_rgba(15,23,42,0.55)]', selected || isNewNote ? 'flex' : 'hidden md:flex')}>
            {selected || isNewNote ? (
              <>
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                  <p className="min-w-0 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {isNewNote ? 'New note' : `Last edited ${formatDate(selected!.updated_at)}`}
                  </p>
                  <div className="flex items-center justify-end gap-1 sm:gap-2">
                    {isEditing ? (
                      <>
                        <button onClick={cancelEditing} disabled={isSaving} className="min-h-11 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-200 hover:bg-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/10">Cancel</button>
                        <button onClick={() => void saveNote()} disabled={isSaving} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-700 bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 active:scale-[0.98] disabled:opacity-50"><Check className="h-4 w-4" />{isSaving ? 'Saving…' : 'Save'}</button>
                      </>
                    ) : (
                      <button onClick={startEditing} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20"><Pencil className="h-4 w-4" />Edit</button>
                    )}
                    <button type="button" aria-label="Back to notes" onClick={() => { setSelectedId(null); setIsEditing(false); setIsNewNote(false); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/10 md:hidden"><X className="h-5 w-5" /></button>
                  </div>
                </div>
                <input aria-label="Note title" value={isEditing ? editTitle : selected?.title || ''} onChange={e => setEditTitle(e.target.value)} readOnly={!isEditing} placeholder="Note title" className={cn('mx-4 mt-4 w-[calc(100%-2rem)] min-w-0 rounded-xl border border-transparent px-3 py-2 text-xl font-bold tracking-tight text-slate-950 outline-none transition-colors placeholder:text-slate-300 sm:mx-5 sm:mt-5 sm:w-[calc(100%-2.5rem)] sm:text-2xl', isEditing ? 'border-slate-200 bg-slate-50/60 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10' : 'cursor-default')} />
                <textarea aria-label="Note description" value={isEditing ? editDescription : selected?.description || ''} onChange={e => setEditDescription(e.target.value)} readOnly={!isEditing} placeholder="Write your note here…" className={cn('mx-4 mb-4 mt-2 min-h-[220px] w-[calc(100%-2rem)] min-w-0 flex-1 resize-none rounded-xl border border-transparent px-3 py-3 text-sm leading-7 text-slate-700 outline-none transition-colors placeholder:text-slate-300 sm:mx-5 sm:mb-5 sm:min-h-[340px] sm:w-[calc(100%-2.5rem)]', isEditing ? 'border-slate-200 bg-slate-50/60 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10' : 'cursor-default')} />
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/30 p-8 text-center">
                <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                  <StickyNote className="h-8 w-8 text-blue-500" />
                </div>
                <h2 className="text-lg font-semibold text-slate-700">Select a note</h2>
                <p className="mt-1 max-w-xs text-sm leading-6 text-slate-400">Choose a note or create one to start writing.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
