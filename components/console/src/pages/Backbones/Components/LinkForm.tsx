import { useState, FC, FormEvent, useCallback, useEffect } from 'react';

import {
  Form,
  FormGroup,
  TextInput,
  ActionGroup,
  Button,
  FormAlert,
  Alert,
  FormSelect,
  FormSelectOption
} from '@patternfly/react-core';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { LinkRequest, HTTPError } from '../../../API/REST.interfaces';
import { BackboneLabels, LinkLabels, QueriesBackbones } from '../Backbones.enum';

const LinkForm: FC<{
  bid: string;
  sid: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ bid, sid, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [selectedAccessPoint, setSelectedAccessPoint] = useState<string | undefined>();
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

  const handleAccessPointChange = (_: FormEvent<HTMLSelectElement>, accessPoint: string) => {
    setSelectedAccessPoint(accessPoint);
  };

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
    if (!selectedAccessPoint || !connectingSite) {
      setValidated(BackboneLabels.ErrorMessageRequiredField);

      return;
    }

    const linkData = {
      connectingsite: connectingSite,
      cost: Number(cost || '1')
    } as LinkRequest;

    mutationCreate.mutate({ accessPointId: selectedAccessPoint, linkData });
  }, [selectedAccessPoint, connectingSite, cost, mutationCreate]);

  const handleCancel = () => {
    onCancel();
  };

  useEffect(() => {
    if (accessPoints && accessPoints.length > 0) {
      // Only select peer access points for link creation
      const peerAccessPoints = accessPoints.filter((ap) => ap.kind === 'peer');
      if (peerAccessPoints.length > 0) {
        setSelectedAccessPoint(peerAccessPoints[0].id);
      }
    }
    if (sites && sites.length > 0) {
      // Filter out the current site from connecting sites
      const otherSites = sites.filter((site) => site.id !== sid);
      if (otherSites.length > 0) {
        setConnectingSite(otherSites[0].id);
      }
    }
  }, [sid, sites, accessPoints]);

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      <FormGroup label={LinkLabels.AccessPoint} fieldId="link-access-point" isRequired>
        <FormSelect id={`link-access-point-select`} value={selectedAccessPoint} onChange={handleAccessPointChange}>
          {accessPoints
            ?.filter((accessPoint) => accessPoint.kind === 'peer')
            .map((accessPoint) => (
              <FormSelectOption
                key={`access-point-${accessPoint.id}`}
                value={accessPoint.id}
                label={accessPoint.name}
              />
            ))}
        </FormSelect>
      </FormGroup>

      <FormGroup label={LinkLabels.ConnectingSite} fieldId="link-connecting-site" isRequired>
        <FormSelect id={`link-connecting-site-select`} value={connectingSite} onChange={handleConnectingSiteChange}>
          {sites
            ?.filter((site) => site.id !== sid)
            .map((site) => <FormSelectOption key={`connecting-${site.id}`} value={site.id} label={site.name} />)}
        </FormSelect>
      </FormGroup>

      <FormGroup label={LinkLabels.Cost} fieldId="link-cost">
        <TextInput isRequired type="number" id="link-cost" name="link-cost" value={cost} onChange={handleCostChange} />
      </FormGroup>

      <ActionGroup style={{ display: 'flex' }}>
        <Button variant="primary" onClick={handleSubmit}>
          {BackboneLabels.SubmitBackboneBtn}
        </Button>
        <Button variant="link" onClick={handleCancel}>
          {BackboneLabels.CancelBackboneBtn}
        </Button>
      </ActionGroup>
    </Form>
  );
};

export default LinkForm;
