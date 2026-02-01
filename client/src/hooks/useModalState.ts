import { useState, useCallback } from 'react';

/**
 * Hook for managing modal visibility state
 * Consolidates multiple modal useState declarations
 * Extracted from CryptoIndicators.tsx for Phase 4G-10
 */
export function useModalState() {
  const [openModals, setOpenModals] = useState<Set<string>>(new Set());

  const openModal = useCallback((modalId: string) => {
    setOpenModals(prev => {
      const next = new Set(prev);
      next.add(modalId);
      return next;
    });
  }, []);

  const closeModal = useCallback((modalId: string) => {
    setOpenModals(prev => {
      const next = new Set(prev);
      next.delete(modalId);
      return next;
    });
  }, []);

  const toggleModal = useCallback((modalId: string) => {
    setOpenModals(prev => {
      const next = new Set(prev);
      if (next.has(modalId)) {
        next.delete(modalId);
      } else {
        next.add(modalId);
      }
      return next;
    });
  }, []);

  const isOpen = useCallback((modalId: string) => {
    return openModals.has(modalId);
  }, [openModals]);

  const closeAll = useCallback(() => {
    setOpenModals(new Set());
  }, []);

  return {
    openModal,
    closeModal,
    toggleModal,
    isOpen,
    closeAll
  };
}
