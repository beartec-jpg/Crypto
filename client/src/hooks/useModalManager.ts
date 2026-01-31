import { useState, useCallback } from 'react';

/**
 * Hook for managing multiple modals in the application
 * Extracted from CryptoIndicators.tsx for Phase 4G-7
 */
export function useModalManager() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [modalData, setModalData] = useState<any>(null);

  const openModal = useCallback((modalId: string, data?: any) => {
    setActiveModal(modalId);
    setModalData(data);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setModalData(null);
  }, []);

  const isModalOpen = useCallback((modalId: string) => {
    return activeModal === modalId;
  }, [activeModal]);

  return {
    activeModal,
    modalData,
    openModal,
    closeModal,
    isModalOpen
  };
}
