import { createContext, useContext, ReactNode, useState, useCallback } from 'react';

interface ModalActionsType {
  onSubmit?: () => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitDisabled?: boolean;
}

interface ModalContextType {
  actions: ModalActionsType;
  setActions: (actions: ModalActionsType) => void;
  updateActions: (updates: Partial<ModalActionsType>) => void;
}

const ModalContext = createContext<ModalContextType | null>(null);

export const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModalContext must be used within a ModalContextProvider');
  }

  return context;
};

export const ModalContextProvider = function ({ children }: { children: ReactNode }) {
  const [actions, setActionsState] = useState<ModalActionsType>({});

  const setActions = useCallback((newActions: ModalActionsType) => {
    setActionsState(newActions);
  }, []);

  const updateActions = useCallback((updates: Partial<ModalActionsType>) => {
    setActionsState((prev) => ({ ...prev, ...updates }));
  }, []);

  return <ModalContext.Provider value={{ actions, setActions, updateActions }}>{children}</ModalContext.Provider>;
};
