import { useState, FC, FormEvent, useCallback, useEffect } from 'react';
import { Form, FormGroup, TextInput, FormAlert, Alert, FormSelect, FormSelectOption } from '@patternfly/react-core';
import { useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { LinkRequest, HTTPError, AccessPointResponse } from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import { useMutationWithCacheInvalidation, CacheInvalidationPresets } from '../../../core/hooks/useMutationWithCacheInvalidation';
import labels from '../../../core/config/labels';
import { QueriesBackbones } from '../Backbones.enum';

const LinkForm: FC<{
  bid: string;
  sid: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ bid, sid, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [selectedAccessPointId, setSelectedAccessPointId] = useState<string | undefined>();
  const [cost, setCost] = useState<string>('1');

  const { data: sites } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetSites, bid],
    queryFn: () => RESTApi.fetchSites(bid)
  });

  // Fetch all access points for the backbone to find peer access points in other sites
  const { data: allAccessPoints } = useSuspenseQuery({
    queryKey: ['allAccessPoints', bid],
    queryFn: () => RESTApi.fetchAccessPointsForBackbone(bid)
  });

  const mutationCreate = useMutationWithCacheInvalidation(
    ({ accessPointId, linkData }: { accessPointId: string; linkData: LinkRequest }) =>
      RESTApi.createLink(accessPointId, linkData),
    CacheInvalidationPresets.createLink(bid),
    {
      onError: (data: HTTPError) => {
        setValidated(data.descriptionMessage);
      },
      onSuccess: onSubmit
    }
  );

  const handleAccessPointChange = (_: FormEvent<HTMLSelectElement>, accessPointId: string) => {
    setSelectedAccessPointId(accessPointId);
  };

  const handleCostChange = (_: FormEvent<HTMLInputElement>, value: string) => {
    if (!value) {
      setCost('');
      return;
    }

    if (Number(value) <= 0) {
      setCost('1');
      return;
    }

    setCost(value);
  };

  // Filter peer access points from other sites (exclude current site)
  const availablePeerAccessPoints =
    allAccessPoints?.filter((ap: AccessPointResponse) => ap.kind === 'peer' && ap.interiorsite !== sid) || [];

  // Create a mapping of access point ID to site name for display
  const siteNameMap =
    sites?.reduce(
      (acc, site) => {
        acc[site.id] = site.name;
        return acc;
      },
      {} as Record<string, string>
    ) || {};

  const handleSubmit = useCallback(() => {
    if (!selectedAccessPointId) {
      setValidated(labels.validation.bothAccessPointsRequired);
      return;
    }

    if (availablePeerAccessPoints.length === 0) {
      setValidated('No peer access points available for creating links');
      return;
    }

    const linkData = {
      connectingsite: sid, // The current site is the connecting site
      cost: Number(cost || '1')
    } as LinkRequest;

    mutationCreate.mutate({ accessPointId: selectedAccessPointId, linkData });
  }, [selectedAccessPointId, cost, sid, availablePeerAccessPoints.length, mutationCreate]);

  // Setup modal actions
  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending,
    submitLabel: labels.buttons.submit,
    cancelLabel: labels.buttons.cancel
  });

  useEffect(() => {
    // Auto-select the first available peer access point
    if (availablePeerAccessPoints.length > 0 && !selectedAccessPointId) {
      setSelectedAccessPointId(availablePeerAccessPoints[0].id);
    }
  }, [availablePeerAccessPoints, selectedAccessPointId]);

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      <FormGroup label="Dest. Site/AP" isRequired fieldId="link-connecting-site">
        <FormSelect id={`link-connecting-site-select`} value={selectedAccessPointId} onChange={handleAccessPointChange}>
          {availablePeerAccessPoints.map((ap) => {
            const siteName = siteNameMap[ap.interiorsite] || 'Unknown Site';
            return <FormSelectOption key={`ap-${ap.id}`} value={ap.id} label={`${siteName}/${ap.name}`} />;
          })}
        </FormSelect>
      </FormGroup>
      <FormGroup label="Cost" fieldId="link-cost">
        <TextInput isRequired type="number" id="link-cost" name="link-cost" value={cost} onChange={handleCostChange} />
      </FormGroup>
    </Form>
  );
};

export default LinkForm;
