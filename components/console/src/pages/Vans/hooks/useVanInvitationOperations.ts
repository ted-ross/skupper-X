import { useCallback, useState } from 'react';

import { useMutation, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError, InvitationResponse, InvitationRequest } from '../../../API/REST.interfaces';
import { QueriesVans } from '../Vans.enum';

export const useVanInvitationOperations = (vanId: string) => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: invitations } = useSuspenseQuery<InvitationResponse[]>({
    queryKey: [QueriesVans.GetVanInvitations, vanId],
    queryFn: () => RESTApi.fetchInvitations(vanId)
  });

  const mutationCreateInvitation = useMutation({
    mutationFn: (data: InvitationRequest) => RESTApi.createInvitation(vanId, data),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVanInvitations, vanId] });
    },
    onMutate: () => {
      setError(undefined);
    }
  });

  const mutationDeleteInvitation = useMutation({
    mutationFn: (invitationId: string) => RESTApi.deleteInvitation(invitationId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVanInvitations, vanId] });
    },
    onMutate: () => {
      setError(undefined);
    }
  });

  const mutationExpireInvitation = useMutation({
    mutationFn: (invitationId: string) => RESTApi.expireInvitation(invitationId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVanInvitations, vanId] });
    },
    onMutate: () => {
      setError(undefined);
    }
  });

  const refreshInvitations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVanInvitations, vanId] });
  }, [queryClient, vanId]);

  const createInvitation = useCallback(
    (data: InvitationRequest) => {
      mutationCreateInvitation.mutate(data);
    },
    [mutationCreateInvitation]
  );

  const deleteInvitation = useCallback(
    (invitationId: string) => {
      mutationDeleteInvitation.mutate(invitationId);
    },
    [mutationDeleteInvitation]
  );

  const expireInvitation = useCallback(
    (invitationId: string) => {
      mutationExpireInvitation.mutate(invitationId);
    },
    [mutationExpireInvitation]
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    invitations,
    error,
    createInvitation,
    deleteInvitation,
    expireInvitation,
    refreshInvitations,
    clearError,
    isCreating: mutationCreateInvitation.isPending,
    isDeleting: mutationDeleteInvitation.isPending,
    isExpiring: mutationExpireInvitation.isPending
  };
};
