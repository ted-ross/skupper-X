import { useCallback, useState } from 'react';

import { BackboneSiteResponse } from '../../../API/REST.interfaces';

export const useDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<BackboneSiteResponse | undefined>();

  const openDrawer = useCallback((site: BackboneSiteResponse) => {
    setSelectedSite(site);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setSelectedSite(undefined);
  }, []);

  return {
    isOpen,
    selectedSite,
    openDrawer,
    closeDrawer
  };
};
