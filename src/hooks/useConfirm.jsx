// @ts-nocheck
import { useState, useCallback } from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export function useConfirm() {
  const [state, setState] = useState({ open: false, message: '', resolve: null, danger: false });
  const confirm = useCallback((message, danger = false) => new Promise(resolve => setState({ open: true, message, resolve, danger })), []);
  const handleConfirm = () => { state.resolve(true); setState(p => ({ ...p, open: false })); };
  const handleCancel = () => { state.resolve(false); setState(p => ({ ...p, open: false })); };
  const Dialog = () => <ConfirmDialog open={state.open} message={state.message} onConfirm={handleConfirm} onCancel={handleCancel} danger={state.danger} />;
  return { confirm, Dialog };
}
