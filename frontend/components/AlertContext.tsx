"use client";
import React, { createContext, useContext, useState, useCallback } from 'react';
import Alert from '@/components/Alert';

interface AlertContextType {
  showAlert: (msg: string, type?: 'error' | 'success' | 'info') => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider = ({ children }: { children: React.ReactNode }) => {
  const [alert, setAlert] = useState<{ msg: string | null; type: 'error' | 'success' | 'info' }>({
    msg: null,
    type: 'info'
  });

  const showAlert = useCallback((msg: string, type: 'error' | 'success' | 'info' = 'info') => {
    setAlert({ msg, type });
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Alert 
        message={alert.msg} 
        type={alert.type} 
        onClose={() => setAlert({ ...alert, msg: null })} 
      />
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlert must be used within AlertProvider");
  return context;
};
