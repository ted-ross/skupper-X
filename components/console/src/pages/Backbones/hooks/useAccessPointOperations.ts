import { useCallback, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';

export const useAccessPointOperations = (siteId: string) => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const mutationDeleteAccessPoint = useMutation({
    mutationFn: (apid: string) => RESTApi.deleteAccessPoint(apid),
    onError: (data: HTTPError) => {
      // Check if this is a foreign key constraint error
      if (
        data.descriptionMessage?.includes('foreign key constraint') ||
        data.descriptionMessage?.includes('memberinvitations_claimaccess_fkey') ||
        data.descriptionMessage?.includes('is still referenced')
      ) {
        setError(
          'Cannot delete access point: It is still being used by member invitations. Please remove all member invitations that reference this access point before deleting it.'
        );
      } else {
        setError(data.descriptionMessage || 'Failed to delete access point');
      }
    },
    onSuccess: () => {
      // Clear any previous errors on successful deletion
      setError(undefined);
      // Refresh the access points list
      queryClient.invalidateQueries({ queryKey: ['accessPoints', siteId] });
    }
  });

  const deleteAccessPoint = useCallback(
    (apid: string) => {
      // Clear any previous errors before attempting deletion
      setError(undefined);
      mutationDeleteAccessPoint.mutate(apid);
    },
    [mutationDeleteAccessPoint]
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    error,
    deleteAccessPoint,
    clearError,
    isDeleting: mutationDeleteAccessPoint.isPending
  };
};
