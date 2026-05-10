import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { QRCodeSVG } from 'qrcode.react';
import { X, Download, Share2, Printer, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';

export default function QRCodeModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const navigate = useNavigate();
  const { hostelProfile } = useApp();

  if (!isOpen) return null;

  const hostelName = hostelProfile?.hostelName || 'My Hostel';
  const urlSlug = hostelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const joinUrl = `${window.location.origin}/join/${urlSlug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    toast.success('Link copied to clipboard!');
  };

  const handlePrint = () => {
    // In a real app we would open a print layout
    toast.success('Printing QR Code...');
    window.print();
  };

  const handleDownload = () => {
    const svg = document.getElementById('qr-code-svg');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = "hostelrr-qr-code.png";
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
        toast.success("QR Code downloaded!");
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-gray-100 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Your Hostel QR Code</h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 text-center bg-gray-50/50 overflow-y-auto">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 inline-block mb-6 relative group">
            <QRCodeSVG 
              id="qr-code-svg"
              value={joinUrl} 
              size={200}
              level="H"
              includeMargin={false}
              fgColor="#1e3a8a" // dark blue
            />
          </div>
          
          <h3 className="text-lg font-bold text-gray-900 mb-2">{hostelName}</h3>
          <p className="text-sm text-gray-500 mb-6">Scan this QR to open the joining form.</p>

          <div className="flex flex-col gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-left">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800 leading-relaxed">
                  <strong>Testing in AI Studio?</strong> You might get a "403 That's an error" if you scan this with your phone because development links require you to be logged heavily into AI Studio. <br className="hidden sm:block" />To test the form on this device, click the button below instead.
                </p>
              </div>
            </div>

            <button 
              onClick={() => {
                onClose();
                navigate(`${ROUTES.join.path}/${urlSlug}`);
              }}
              type="button"
              className="flex items-center justify-center gap-2 bg-[#1D4ED8] hover:bg-[#1e40af] text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              Open Form to Test <ExternalLink className="w-4 h-4" />
            </button>

            <div className="flex bg-gray-100 p-1.5 rounded-xl border border-gray-200 truncate mt-2">
               <span className="flex-1 shrink text-xs text-gray-500 px-3 py-2 bg-white rounded-lg border border-gray-100 truncate text-left select-all">
                 {joinUrl}
               </span>
               <button 
                 onClick={handleCopyLink}
                 className="flex-none px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-transparent"
               >
                 Copy
               </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mt-2">
               <button 
                 onClick={handleDownload}
                 className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
               >
                 <Download className="w-4 h-4" /> Download
               </button>
               <button 
                 onClick={handlePrint}
                 className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
               >
                 <Printer className="w-4 h-4" /> Print QR
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
