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

import { RESTApi } from '@API/REST.api';
import { LinkRequest, HTTPError } from '@API/REST.interfaces';

import { BackboneLabels, LinkLabels, QueriesBackbones } from '../Backbones.enum';

const LinkForm: FC<{
  bid: string;
  sid?: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ bid, sid, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [listeningSite, setListeningSite] = useState<string | undefined>();
  const [connectingSite, setConnectingSite] = useState<string | undefined>();
  const [cost, setCost] = useState<string>('1');

  const { data: sites } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetSites, bid],
    queryFn: () => RESTApi.fetchSites(bid)
  });

  const mutationCreate = useMutation({
    mutationFn: (data: LinkRequest) => RESTApi.createLink(bid, data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleListeningSiteChange = (_: FormEvent<HTMLSelectElement>, site: string) => {
    setListeningSite(site);
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
    if (!listeningSite || !connectingSite) {
      setValidated(BackboneLabels.ErrorMessageRequiredField);

      return;
    }

    const data = {
      listeningsite: listeningSite,
      connectingsite: connectingSite,
      cost: cost || '1'
    } as LinkRequest;

    mutationCreate.mutate(data);
  }, [listeningSite, connectingSite, cost, mutationCreate]);

  const handleCancel = () => {
    onCancel();
  };

  useEffect(() => {
    if (sites && sites.length > 0) {
      setListeningSite(sid || sites[0].id);
      setConnectingSite(sites[0].id);
    }
  }, [sid, sites]);

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      {!sid && (
        <FormGroup label={LinkLabels.ListeningSite} fieldId="link-listening-site" isRequired>
          <FormSelect id={`link-listening-site-select`} value={listeningSite} onChange={handleListeningSiteChange}>
            {sites.map((site) => (
              <FormSelectOption key={`listening-${site.id}`} value={site.id} label={site.name} />
            ))}
          </FormSelect>
        </FormGroup>
      )}

      <FormGroup label={LinkLabels.ConnectingSite} fieldId="link-connecting-site" isRequired>
        <FormSelect id={`link-connecting-site-select`} value={connectingSite} onChange={handleConnectingSiteChange}>
          {sites.map((site) => (
            <FormSelectOption key={`connecting-${site.id}`} value={site.id} label={site.name} />
          ))}
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
