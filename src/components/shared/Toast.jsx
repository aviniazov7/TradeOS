import { Toaster } from 'react-hot-toast';

export default function Toast() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#0a0a0a',
          color: '#f0f0f0',
          border: '1px solid #1a1a1a',
          borderRadius: '12px',
        },
        success: {
          iconTheme: {
            primary: '#22c55e',
            secondary: '#0a0a0a',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#0a0a0a',
          },
        },
      }}
    />
  );
}
