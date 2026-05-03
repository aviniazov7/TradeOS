import { useState, useEffect } from 'react';
import Modal from './Modal';

const COLOR_CLASSES = {
  loss: 'bg-loss text-white hover:bg-red-600',
  amber: 'bg-amber-500 text-white hover:bg-amber-600',
};

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'האם אתה בטוח?',
  message = 'לא ניתן לבטל פעולה זו.',
  confirmText = 'מחק',
  cancelText = 'ביטול',
  confirmColor = 'loss',
}) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setLoading(false);
  }, [isOpen]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-text-secondary mb-4">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${COLOR_CLASSES[confirmColor] || COLOR_CLASSES.loss}`}
        >
          {loading ? '...' : confirmText}
        </button>
        <button
          onClick={onClose}
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-secondary text-sm font-medium hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
        >
          {cancelText}
        </button>
      </div>
    </Modal>
  );
}
