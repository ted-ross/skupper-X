import { useEffect } from 'react';

import { useModalContext } from '../contexts/ModalContext';

interface UseModalActionsProps {
  onSubmit?: () => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitDisabled?: boolean;
}

export const useModalActions = ({
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel,
  cancelLabel,
  isSubmitDisabled = false
}: UseModalActionsProps) => {
  const { setActions } = useModalContext();

  useEffect(() => {
    setActions({
      onSubmit,
      onCancel,
      isSubmitting,
      submitLabel,
      cancelLabel,
      isSubmitDisabled
    });
  }, [onSubmit, onCancel, isSubmitting, submitLabel, cancelLabel, isSubmitDisabled, setActions]);

  // Cleanup quando il componente viene smontato
  useEffect(
    () => () => {
      setActions({});
    },
    [setActions]
  );
};
