import { useState, FC, FormEvent } from 'react';

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
import { useMutation } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { AccessPointRequest, HTTPError } from '../../../API/REST.interfaces';

const AccessPointForm: FC<{
  siteId: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ siteId, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string>('');
  const [kind, setKind] = useState<'claim' | 'peer' | 'member' | 'manage'>('claim');
  const [bindhost, setBindhost] = useState<string>('');

  const mutationCreate = useMutation({
    mutationFn: (data: AccessPointRequest) => RESTApi.createAccessPoint(siteId, data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidated(undefined);

    if (!name.trim()) {
      setValidated('Name is required');

      return;
    }

    const accessPointData: AccessPointRequest = {
      name: name.trim(),
      kind,
      bindhost: bindhost.trim() || undefined
    };

    mutationCreate.mutate(accessPointData);
  };

  return (
    <Form onSubmit={handleSubmit}>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title="Error" isInline>
            {validated}
          </Alert>
        </FormAlert>
      )}
      <FormGroup label="Name" isRequired fieldId="access-point-name">
        <TextInput
          isRequired
          type="text"
          id="access-point-name"
          name="access-point-name"
          value={name}
          onChange={(_event, value) => setName(value)}
          placeholder="Enter access point name"
        />
      </FormGroup>
      <FormGroup label="Kind" isRequired fieldId="access-point-kind">
        <FormSelect
          value={kind}
          onChange={(_event, value) => setKind(value as 'claim' | 'peer' | 'member' | 'manage')}
          id="access-point-kind"
          name="access-point-kind"
        >
          <FormSelectOption value="claim" label="Claim" />
          <FormSelectOption value="peer" label="Peer" />
          <FormSelectOption value="member" label="Member" />
          <FormSelectOption value="manage" label="Manage" />
        </FormSelect>
      </FormGroup>
      <FormGroup label="Bind Host" fieldId="access-point-bindhost">
        <TextInput
          type="text"
          id="access-point-bindhost"
          name="access-point-bindhost"
          value={bindhost}
          onChange={(_event, value) => setBindhost(value)}
          placeholder="Enter bind host (optional)"
        />
      </FormGroup>
      <ActionGroup>
        <Button
          variant="primary"
          type="submit"
          isDisabled={mutationCreate.isPending}
          isLoading={mutationCreate.isPending}
        >
          Create Access Point
        </Button>
        <Button variant="link" onClick={onCancel}>
          Cancel
        </Button>
      </ActionGroup>
    </Form>
  );
};

export default AccessPointForm;
