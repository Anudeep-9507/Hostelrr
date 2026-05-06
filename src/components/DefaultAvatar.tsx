import React from 'react';

export default function DefaultAvatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className || "w-full h-full"}>
      <circle cx="12" cy="12" r="12" fill="#9CA3AF" />
      <path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" fill="#F9FAFB" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 14C8.66667 14 4 15.6667 4 19V21.5C6.01257 23.0577 8.85243 24 12 24C15.1476 24 17.9874 23.0577 20 21.5V19C20 15.6667 15.3333 14 12 14Z" fill="#F9FAFB" />
    </svg>
  );
}
