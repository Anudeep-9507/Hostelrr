import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface HostelQrPosterProps {
  hostelName: string;
  joinUrl: string;
  posterRef: React.RefObject<HTMLDivElement | null>;
  /** Base64 data URL of the logo — fetched by parent to avoid CORS in html-to-image */
  logoBase64: string | null;
}

/**
 * Off-screen printable poster — captured by html-to-image (1080×1350).
 * Outer shell: 0×0 overflow-hidden, invisible. Inner div = capture target.
 */
export default function HostelQrPoster({ hostelName, joinUrl, posterRef, logoBase64 }: HostelQrPosterProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: 0, height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      {/* ── Capture root ── */}
      <div
        ref={posterRef}
        style={{
          width: '1080px',
          height: '1350px',
          backgroundColor: '#EEF2FF',        /* light lavender-white bg */
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '70px 80px 60px',
          fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* ── 4 border bars ── */}
        {/* Top — thick */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '10px', background: '#1D4ED8' }} />
        {/* Bottom — thick */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '10px', background: '#1D4ED8' }} />
        {/* Left — thin */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', background: '#1D4ED8' }} />
        {/* Right — thin */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '4px', background: '#1D4ED8' }} />

        {/* ── Header: logo + wordmark + subtitle + divider ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          {/* Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {logoBase64 ? (
              <img
                src={logoBase64}
                alt="Hostelrr Logo"
                style={{ width: '68px', height: '68px', borderRadius: '14px', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: '68px', height: '68px', background: '#1D4ED8',
                borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#fff', fontSize: '32px', fontWeight: '800' }}>H</span>
              </div>
            )}
            <span style={{
              fontSize: '56px',
              fontWeight: '800',
              color: '#1D4ED8',
              letterSpacing: '-1.5px',
              lineHeight: 1,
            }}>
              Hostelrr
            </span>
          </div>

          {/* Subtitle */}
          <div style={{ fontSize: '22px', color: '#94A3B8', fontWeight: '500', letterSpacing: '0.3px' }}>
            Smart Hostel Management
          </div>

          {/* Short divider */}
          <div style={{ width: '56px', height: '3px', background: '#1D4ED8', borderRadius: '99px' }} />
        </div>

        {/* ── CTA heading ── */}
        <div style={{ textAlign: 'center' }}>
          {/* "Join" bold blue + " to Scan Hostel" dark navy — same line */}
          <div style={{ fontSize: '68px', fontWeight: '800', lineHeight: 1.1, letterSpacing: '-2px' }}>
            <span style={{ color: '#1D4ED8' }}>Scan</span>
            <span style={{ color: '#0F172A' }}> to Join Hostel</span>
          </div>
          {/* Hostel name */}
          <div style={{
            fontSize: '42px',
            fontWeight: '700',
            color: '#1D4ED8',
            marginTop: '14px',
            lineHeight: 1.2,
          }}>
            {hostelName}
          </div>
        </div>

        {/* ── QR card ── */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '28px',
          padding: '52px 60px',
          border: '1.5px solid #E2E8F0',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06), 0 10px 36px -6px rgba(0,0,0,0.10)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          width: '780px',
        }}>
          <QRCodeSVG
            value={joinUrl}
            size={520}
            level="H"
            includeMargin={true}
            fgColor="#0F172A"
            bgColor="#FFFFFF"
          />
          <div style={{ fontSize: '22px', color: '#94A3B8', fontWeight: '500', textAlign: 'center' }}>
            Point any camera or browser at the QR to join
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          {/* "Powered by Hostelrr" inline */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '22px', color: '#64748B', fontWeight: '400' }}>Powered by</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '26px', fontWeight: '800', color: '#1D4ED8', letterSpacing: '-0.5px' }}>Hostelrr</span>
              {/* Underline beneath "Hostelrr" */}
              <div style={{ width: '48px', height: '3px', background: '#1D4ED8', borderRadius: '99px' }} />
            </div>
          </div>

          {/* URL row with globe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Globe SVG */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span style={{ fontSize: '20px', color: '#94A3B8', fontWeight: '500', letterSpacing: '0.2px' }}>
              hostelrr.vercel.app
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
