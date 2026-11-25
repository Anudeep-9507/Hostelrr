import React, { useEffect, useRef, useState } from 'react';

export const REMINDER_PLACEHOLDERS = [
  { token: 'name', label: 'Resident name' },
  { token: 'amount', label: 'Rent amount' },
  { token: 'room', label: 'Room number' },
  { token: 'due_date', label: 'Due date' },
  { token: 'hostel_name', label: 'Hostel name' },
];
const TOKEN_DRAG_TYPE = 'application/x-hostelrr-reminder-token';
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const badgeHtml = (token: string) => {
  const item = REMINDER_PLACEHOLDERS.find(entry => entry.token === token.toLowerCase());
  return item ? `<span contenteditable="false" data-template-token="${item.token}" class="inline-flex select-none items-center rounded-full bg-indigo-100 px-2.5 py-1 align-middle text-xs font-bold text-indigo-800 ring-1 ring-inset ring-indigo-200">${item.label}</span>` : '';
};
const toEditorHtml = (value: string) => value.split(/(\{\{\s*(?:name|amount|room|due_date|hostel_name)\s*\}\})/gi).map(part => {
  const match = part.match(/^\{\{\s*(name|amount|room|due_date|hostel_name)\s*\}\}$/i);
  return match ? badgeHtml(match[1]) : escapeHtml(part).replace(/\n/g, '<br>');
}).join('');

function serialize(root: HTMLElement): string {
  const visit = (node: Node): string => {
    if (node instanceof HTMLElement && node.dataset.templateToken) return `{{${node.dataset.templateToken}}}`;
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\u200B/g, '');
    if (node instanceof HTMLElement && node.tagName === 'BR') return '\n';
    const text = Array.from(node.childNodes).map(visit).join('');
    return node instanceof HTMLElement && ['DIV', 'P'].includes(node.tagName) ? `${text}\n` : text;
  };
  return Array.from(root.childNodes).map(visit).join('').replace(/\n+$/, '');
}

export default function TemplateEditor({ value, onChange, className = '', disabled = false }: { value: string; onChange: (value: string) => void; className?: string; disabled?: boolean }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [isDraggingToken, setIsDraggingToken] = useState(false);
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && !editor.contains(document.activeElement) && serialize(editor) !== value) editor.innerHTML = toEditorHtml(value);
  }, [value]);

  const rememberCaret = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer)) savedRangeRef.current = range.cloneRange();
  };

  const insertToken = (token: string, targetRange?: Range | null) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    const validTarget = targetRange && editor.contains(targetRange.startContainer) ? targetRange : null;
    const range = validTarget?.cloneRange() || savedRangeRef.current?.cloneRange() || document.createRange();
    if (!validTarget && !savedRangeRef.current) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    const badge = document.createElement('span');
    const item = REMINDER_PLACEHOLDERS.find(entry => entry.token === token);
    if (!item) return;
    badge.contentEditable = 'false';
    badge.dataset.templateToken = token;
    badge.className = 'inline-flex select-none items-center rounded-full bg-indigo-100 px-2.5 py-1 align-middle text-xs font-bold text-indigo-800 ring-1 ring-inset ring-indigo-200';
    badge.textContent = item.label;

    if (range) {
      range.deleteContents();
      range.insertNode(badge);
      range.setStartAfter(badge);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedRangeRef.current = range.cloneRange();
    }
    editor.focus();
    onChange(serialize(editor));
  };

  const deleteAdjacentToken = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!editor || !selection?.rangeCount || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return;
    const container = range.startContainer;
    let token: HTMLElement | null = null;
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent || '';
      if (event.key === 'Backspace' && range.startOffset === 0) token = container.previousSibling as HTMLElement | null;
      if (event.key === 'Delete' && range.startOffset === text.length) token = container.nextSibling as HTMLElement | null;
    } else if (container instanceof HTMLElement) {
      const index = event.key === 'Backspace' ? range.startOffset - 1 : range.startOffset;
      token = container.childNodes[index] as HTMLElement | null;
    }
    if (!token?.dataset?.templateToken) return;
    event.preventDefault();
    const caret = document.createRange();
    caret.setStartBefore(token);
    caret.collapse(true);
    token.remove();
    selection.removeAllRanges();
    selection.addRange(caret);
    savedRangeRef.current = caret.cloneRange();
    onChange(serialize(editor));
  };

  const rangeAtPoint = (x: number, y: number): Range | null => {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range) return range;
    const position = doc.caretPositionFromPoint?.(x, y);
    if (!position) return null;
    const fallback = document.createRange();
    fallback.setStart(position.offsetNode, position.offset);
    fallback.collapse(true);
    return fallback;
  };

  return <div className={className}>
    <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Tap or drag a placeholder into the message">
      {REMINDER_PLACEHOLDERS.map(item => <button type="button" key={item.token} draggable={!disabled} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => insertToken(item.token, savedRangeRef.current)} onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(TOKEN_DRAG_TYPE, item.token); event.dataTransfer.setData('text/plain', item.token); setIsDraggingToken(true); }} onDragEnd={() => setIsDraggingToken(false)} className={`min-h-11 touch-manipulation select-none rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 disabled:opacity-50 ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}>{item.label}</button>)}
    </div>
    <div ref={editorRef} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" onKeyDown={event => deleteAdjacentToken(event)} onKeyUp={rememberCaret} onPointerUp={rememberCaret} onMouseUp={rememberCaret} onInput={event => { rememberCaret(); onChange(serialize(event.currentTarget)); }} onDragOver={event => { if (event.dataTransfer.types.includes(TOKEN_DRAG_TYPE) || event.dataTransfer.types.includes('text/plain')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={event => {
      const token = event.dataTransfer.getData(TOKEN_DRAG_TYPE) || event.dataTransfer.getData('text/plain');
      if (!token || !REMINDER_PLACEHOLDERS.some(item => item.token === token)) return;
      event.preventDefault();
      insertToken(token, rangeAtPoint(event.clientX, event.clientY));
    }} className={`min-h-48 w-full whitespace-pre-wrap rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium leading-7 text-slate-800 outline-none ${disabled ? 'bg-slate-50' : isDraggingToken ? 'border-indigo-500 bg-indigo-50/50 ring-4 ring-indigo-100' : 'bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'}`} />
    {!disabled && <p className="mt-2 text-xs text-slate-500">Tap a placeholder to insert it at the cursor, or drag it into the message. Use Backspace or Delete to remove it.</p>}
  </div>;
}
