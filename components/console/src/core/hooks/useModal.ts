import { useCallback, useState } from 'react';

/**
 * Generic modal state management hook
 * Provides consistent modal state management across the application
 */
export const useModal = <T = unknown>() => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<T | undefined>();

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const openEditModal = useCallback((item: T) => {
    setEditingItem(item);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setEditingItem(undefined);
  }, []);

  const toggleModal = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    editingItem,
    openModal,
    openEditModal,
    closeModal,
    toggleModal
  };
};
