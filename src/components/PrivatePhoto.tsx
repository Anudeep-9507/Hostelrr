import React, { useEffect, useState } from 'react';
import { getJoinRequestPhotoUrl, getResidentPhotoUrl } from '../lib/supabaseAPI';

type PhotoKind = 'resident' | 'join-request';

type PrivatePhotoProps = {
  kind: PhotoKind;
  id: string;
  photoPath?: string;
  fallbackSrc?: string;
  alt: string;
  className: string;
};

async function getPhotoUrl(kind: PhotoKind, id: string) {
  return kind === 'resident' ? getResidentPhotoUrl(id) : getJoinRequestPhotoUrl(id);
}

export function PrivatePhoto({ kind, id, photoPath, fallbackSrc, alt, className }: PrivatePhotoProps) {
  const [src, setSrc] = useState<string>();
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc(undefined);
    setRetried(false);
    if (photoPath) {
      void getPhotoUrl(kind, id).then((url) => { if (active) setSrc(url); });
    } else {
      setSrc(fallbackSrc);
    }
    return () => { active = false; };
  }, [kind, id, photoPath, fallbackSrc]);

  if (!src) return null;
  return <img src={src} alt={alt} className={className} onError={() => {
    if (!photoPath || retried) { setSrc(undefined); return; }
    setRetried(true);
    void getPhotoUrl(kind, id).then(setSrc);
  }} />;
}

type PrivatePhotoLinkProps = Omit<PrivatePhotoProps, 'className' | 'alt'> & { children: React.ReactNode; className: string };

export function PrivatePhotoLink({ kind, id, photoPath, fallbackSrc, children, className }: PrivatePhotoLinkProps) {
  const openFresh = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!photoPath) return;
    event.preventDefault();
    const tab = window.open('about:blank', '_blank');
    if (!tab) return;
    tab.opener = null;
    const url = await getPhotoUrl(kind, id);
    if (url) tab.location.href = url;
    else tab.close();
  };
  return <a href={photoPath ? '#' : fallbackSrc || '#'} target="_blank" rel="noopener noreferrer" onClick={openFresh} className={className}>{children}</a>;
}
