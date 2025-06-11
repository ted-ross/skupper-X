import { FC, ReactNode } from 'react';

import { Modal, ModalVariant, ModalBody, ModalHeader, ModalFooter, Button } from '@patternfly/react-core';

import { ModalContextProvider, useModalContext } from '../../contexts/ModalContext';

export interface ModalWrapperProps {
  /** Modal title */
  title: string;
  /** Whether modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Modal size variant */
  variant?: ModalVariant;
  /** Modal content */
  children: ReactNode;
  /** Whether modal has a body wrapper */
  hasNoBodyWrapper?: boolean;
  /** Whether to show footer with context actions */
  showFooter?: boolean;
  /** Optional aria-label for accessibility */
  'aria-label'?: string;
  /** Optional aria-describedby for accessibility */
  'aria-describedby'?: string;
}

const ModalFooterButtons = function () {
  const { actions } = useModalContext();
  const { onSubmit, onCancel, isSubmitting, submitLabel, cancelLabel, isSubmitDisabled } = actions;

  if (!onSubmit && !onCancel) {
    return null;
  }

  return (
    <ModalFooter>
      {onSubmit && (
        <Button
          variant="primary"
          onClick={onSubmit}
          isLoading={isSubmitting}
          isDisabled={isSubmitting || isSubmitDisabled}
        >
          {submitLabel || 'Submit'}
        </Button>
      )}
      {onCancel && (
        <Button variant="link" onClick={onCancel} isDisabled={isSubmitting}>
          {cancelLabel || 'Cancel'}
        </Button>
      )}
    </ModalFooter>
  );
};

/**
 * Reusable modal wrapper component that provides consistent modal patterns
 * Handles common modal structure and behavior across the application
 */
export const ModalWrapper: FC<ModalWrapperProps> = function ({
  title,
  isOpen,
  onClose,
  variant = ModalVariant.medium,
  children,
  hasNoBodyWrapper = false,
  showFooter = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby
}) {
  if (hasNoBodyWrapper) {
    return (
      <ModalContextProvider>
        <Modal
          isOpen={isOpen}
          variant={variant}
          onClose={onClose}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedby}
        >
          <ModalHeader title={title} />
          {children}
          {showFooter && <ModalFooterButtons />}
        </Modal>
      </ModalContextProvider>
    );
  }

  return (
    <ModalContextProvider>
      <Modal
        isOpen={isOpen}
        variant={variant}
        onClose={onClose}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
      >
        <ModalHeader title={title} />
        <ModalBody>{children}</ModalBody>
        {showFooter && <ModalFooterButtons />}
      </Modal>
    </ModalContextProvider>
  );
};

export default ModalWrapper;
