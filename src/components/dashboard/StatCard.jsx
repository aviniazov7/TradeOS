import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { staggerItem } from '../../utils/animations';
import RollingNumber from '../shared/RollingNumber';
import Card from '../shared/Card';

export default function StatCard({ label, value, subtitle, subtitleColor, icon: Icon, color = 'text-text-primary', gradient }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Card
      as={motion.div}
      variants={staggerItem}
      hover
      className="p-3 md:p-4 relative overflow-hidden group"
    >
      {gradient && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-700"
          style={{
            background: gradient === 'profit'
              ? 'radial-gradient(ellipse at top right, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 40%, transparent 70%)'
              : 'radial-gradient(ellipse at top right, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.03) 40%, transparent 70%)',
          }}
        />
      )}
      <div className="relative">
        <div className="flex items-center justify-between mb-1.5 md:mb-2">
          <span className="text-[11px] md:text-xs text-text-muted">{label}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className={`p-0.5 rounded transition-all cursor-pointer ${
                copied
                  ? 'text-profit opacity-100'
                  : 'text-text-muted opacity-0 group-hover:opacity-60 hover:!opacity-100'
              }`}
              title="העתק"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
            {Icon && <Icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${color}`} />}
          </div>
        </div>
        <motion.p
          className={`text-base md:text-xl font-bold ${color}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <RollingNumber value={value} />
        </motion.p>
        {subtitle && (
          <p className={`text-[10px] md:text-xs mt-0.5 md:mt-1 ${subtitleColor || 'text-text-muted'}`}>{subtitle}</p>
        )}
      </div>
    </Card>
  );
}
