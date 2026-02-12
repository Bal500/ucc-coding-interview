import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

interface AlertProps {
  message: string | null;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
}

export default function Alert({ message, type = 'error', onClose }: AlertProps) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  const styles = {
    error: "border-red-600 bg-red-950/80 text-red-200",
    success: "border-green-600 bg-green-950/80 text-green-200",
    info: "border-blue-600 bg-blue-950/80 text-blue-200"
  };

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -50, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -20, x: "-50%" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-50 
                      px-6 py-4 rounded-lg border shadow-2xl backdrop-blur-md
                      flex items-center gap-4 min-w-[300px] max-w-md
                      ${styles[type]}`}
        >
          <span className="text-xl">
            {type === 'error' && '⚠️'}
            {type === 'success' && '✅'}
            {type === 'info' && 'ℹ️'}
          </span>
          
          <p className="font-medium text-sm flex-1">{message}</p>

          <button 
            onClick={onClose}
            className="opacity-70 hover:opacity-100 transition-opacity p-1"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
