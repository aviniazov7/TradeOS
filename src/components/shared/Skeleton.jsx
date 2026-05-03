export default function Skeleton({ className = '', variant = 'text' }) {
  const base = 'animate-pulse bg-bg-tertiary';

  const variants = {
    text: `${base} h-4 rounded-md`,
    title: `${base} h-6 w-40 rounded-md`,
    card: `${base} rounded-xl`,
    circle: `${base} rounded-full`,
  };

  return <div className={`${variants[variant] || base} ${className}`} />;
}
