// @ts-nocheck
import { useState, useCallback } from 'react';

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const removeToast = useCallback((id) => setToasts(p => p.filter(t => t.id !== id)), []);
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => removeToast(id), 3500);
  }, [removeToast]);
  return { toasts, removeToast, toast };
}
