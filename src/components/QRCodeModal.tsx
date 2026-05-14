import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { QRCodeSVG } from 'qrcode.react';
import { X, Download, ExternalLink, Eye, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import { toPng } from 'html-to-image';
import HostelQrPoster from './HostelQrPoster';

const LOGO_URL =
  'https://res.cloudinary.com/dfkfysygf/image/upload/v1778354944/20260510_005330_xrv4xj.jpg';

/** Fetch an image URL and return a base64 data URL (avoids CORS taint in html-to-image). */
async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function QRCodeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { hostelProfile } = useApp();

  const posterRef = useRef<HTMLDivElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  /* Pre-fetch logo as base64 when modal opens */
  useEffect(() => {
    if (!isOpen) return;
    fetchBase64(LOGO_URL)
      .then(setLogoBase64)
      .catch(() => setLogoBase64(null)); // fallback to "H" block in poster
  }, [isOpen]);

  if (!isOpen) return null;

  const hostelName = hostelProfile?.hostelName || 'My Hostel';
  const urlSlug = hostelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const joinUrl = `${window.location.origin}/join/${urlSlug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    toast.success('Link copied!');
  };

  /** Capture poster DOM → PNG data URL.
   *  300ms delay lets QR SVG paths finish painting before html-to-image snapshots. */
  const capturePoster = async (): Promise<string> => {
    if (!posterRef.current) throw new Error('Poster ref not ready');
    await new Promise<void>(res => setTimeout(res, 300));
    return toPng(posterRef.current, {
      width: 1080,
      height: 1350,
      pixelRatio: 1,
      backgroundColor: '#F8FAFC',
      cacheBust: true,
    });
  };

  const handlePreview = async () => {
    setGenerating(true);
    try {
      const url = await capturePoster();
      setPreviewDataUrl(url);
      setShowPreview(true);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate preview.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const url = previewDataUrl ?? (await capturePoster());
      const a = document.createElement('a');
      a.download = `hostelrr-${urlSlug}-qr-poster.png`;
      a.href = url;
      a.click();
      toast.success('Poster downloaded!');
    } catch (e) {
      console.error(e);
      toast.error('Download failed. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      {/* Hidden poster — base64 logo passed to avoid CORS taint */}
      <HostelQrPoster
        hostelName={hostelName}
        joinUrl={joinUrl}
        posterRef={posterRef}
        logoBase64={logoBase64}
      />

      {/* ── Main QR modal ── */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex justify-between items-center p-5 border-b border-gray-100 shrink-0">
            <h2 className="text-xl font-bold text-gray-900">Your Hostel QR Code</h2>
            <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-8 text-center bg-gray-50/50 overflow-y-auto">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 inline-block mb-6">
              <QRCodeSVG
                id="qr-code-svg"
                value={joinUrl}
                size={200}
                level="H"
                includeMargin={false}
                fgColor="#0F172A"
              />
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-1">{hostelName}</h3>
            <p className="text-sm text-gray-500 mb-6">Scan to open the joining form.</p>

            <div className="flex flex-col gap-3">
              {/* Open form */}
              <button
                onClick={() => { onClose(); navigate(`${ROUTES.join.path}/${urlSlug}`); }}
                type="button"
                className="flex items-center justify-center gap-2 bg-[#1D4ED8] hover:bg-[#1e40af] text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                Open Form to Test <ExternalLink className="w-4 h-4" />
              </button>

              {/* URL copy row */}
              <div className="flex bg-gray-100 p-1.5 rounded-xl border border-gray-200 truncate mt-2">
                <span className="flex-1 shrink text-xs text-gray-500 px-3 py-2 bg-white rounded-lg border border-gray-100 truncate text-left select-all">
                  {joinUrl}
                </span>
                <button
                  onClick={handleCopyLink}
                  className="flex-none px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-transparent flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              </div>

              {/* Preview poster */}
              <button
                onClick={handlePreview}
                disabled={generating}
                className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 py-3 rounded-xl text-sm font-semibold transition-colors mt-2 disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Preview Hostel QR Poster
              </button>

              {/* Download poster */}
              <button
                onClick={handleDownload}
                disabled={generating}
                className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download Hostel QR Poster
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Poster preview modal ── */}
      {showPreview && previewDataUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPreview(false)}
          />

          <div className="relative z-10 bg-white rounded-3xl shadow-2xl flex flex-col max-h-[92vh] w-full max-w-xs sm:max-w-sm overflow-hidden">
            {/* Preview header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">Poster Preview</h3>
                <p className="text-xs text-gray-400 mt-0.5">Looks good? Download below.</p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview image (scaled) */}
            <div className="overflow-y-auto p-5 flex-1 bg-gray-50">
              <div className="rounded-2xl overflow-hidden shadow-md border border-gray-200">
                <img
                  src={previewDataUrl}
                  alt="Hostelrr QR Poster Preview"
                  className="w-full block"
                  style={{ aspectRatio: '1080/1350' }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 pt-3 flex gap-3 shrink-0 border-t border-gray-100 bg-white">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                disabled={generating}
                className="flex-1 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1e40af] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
