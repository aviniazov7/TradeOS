import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

// The signed-in user's picture: an uploaded avatar (profile.avatarDataUrl)
// first, then the Google account photo, then initials. One component so the
// header and the profile page always show the same face.
export default function UserAvatar({ className = 'w-8 h-8', textClass = 'text-sm' }) {
  const { user, profile } = useAuth();
  const src = profile?.avatarDataUrl || user?.photoURL || '';
  const [failed, setFailed] = useState('');
  const name = profile?.displayName || user?.displayName || user?.email || '';
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(src)}
        className={`${className} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <span className={`${className} ${textClass} rounded-full shrink-0 grid place-items-center font-bold text-white`}
      style={{ background: 'linear-gradient(135deg, #005e80 0%, #007ba7 100%)' }} aria-label={name}>
      {initials}
    </span>
  );
}
