import { useState, FC, FormEvent, useCallback, useEffect } from 'react';
import { Form, FormGroup, TextInput, FormAlert, Alert, FormSelect, FormSelectOption } from '@patternfly/react-core';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { LinkRequest, HTTPError } from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import labels from '../../../core/config/labels';
import { QueriesBackbones } from '../Backbones.enum';

const LinkForm: FC<{
  bid: string;
  sid: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ bid, sid, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [connectingSite, setConnectingSite] = useState<string | undefined>();
  const [cost, setCost] = useState<string>('1');

  const { data: sites } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetSites, bid],
    queryFn: () => RESTApi.fetchSites(bid)
  });

  const { data: accessPoints } = useSuspenseQuery({
    queryKey: ['accessPoints', sid],
    queryFn: () => RESTApi.fetchAccessPointsForSite(sid)
  });

  const mutationCreate = useMutation({
    mutationFn: ({ accessPointId, linkData }: { accessPointId: string; linkData: LinkRequest }) =>
      RESTApi.createLink(accessPointId, linkData),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleConnectingSiteChange = (_: FormEvent<HTMLSelectElement>, site: string) => {
    setConnectingSite(site);
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

  const handleSubmit = useCallback(() => {
    if (!connectingSite) {
      setValidated(labels.validation.bothAccessPointsRequired);
      return;
    }

    // Find the first available peer access point
    const peerAccessPoints = accessPoints?.filter((ap) => ap.kind === 'peer');
    if (!peerAccessPoints || peerAccessPoints.length === 0) {
      setValidated('No peer access points available for creating links');
      return;
    }

    const linkData = {
      connectingsite: connectingSite,
      cost: Number(cost || '1')
    } as LinkRequest;

    mutationCreate.mutate({ accessPointId: peerAccessPoints[0].id, linkData });
  }, [connectingSite, cost]);

  // Setup modal actions
  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending,
    submitLabel: labels.buttons.submit,
    cancelLabel: labels.buttons.cancel
  });

  useEffect(() => {
    if (sites && sites.length > 0) {
      // Filter out the current site from connecting sites
      const otherSites = sites.filter((site) => site.id !== sid);
      if (otherSites.length > 0) {
        setConnectingSite(otherSites[0].id);
      }
    }
  }, [sid, sites]);

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      <FormGroup label="Dest. Site/AP" isRequired fieldId="link-connecting-site">
        <FormSelect id={`link-connecting-site-select`} value={connectingSite} onChange={handleConnectingSiteChange}>
          {sites
            ?.filter((site) => site.id !== sid)
            .map((site) => <FormSelectOption key={`connecting-${site.id}`} value={site.id} label={site.name} />)}
        </FormSelect>
      </FormGroup>
      <FormGroup label="Cost" fieldId="link-cost">
        <TextInput isRequired type="number" id="link-cost" name="link-cost" value={cost} onChange={handleCostChange} />
      </FormGroup>
    </Form>
  );
};

export default LinkForm;
