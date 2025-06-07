import { useState, FC, useCallback } from 'react';

import { Form, FormGroup, TextInput, FormAlert, Alert, FormSelect, FormSelectOption } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { AccessPointRequest, HTTPError } from '../../../API/REST.interfaces';
import { useModalActions } from '../../../core/hooks/useModalActions';
import labels from '../../../core/config/labels';

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
    onSuccess: () => {
      onSubmit();
    }
  });

  const handleSubmit = useCallback(() => {
    setValidated(undefined);

    if (!name.trim()) {
      setValidated(labels.validation.nameRequired);
      return;
    }

    const accessPointData: AccessPointRequest = {
      name: name.trim(),
      kind,
      bindhost: bindhost.trim() || undefined
    };

    mutationCreate.mutate(accessPointData);
  }, [name, kind, bindhost]);

  // Setup modal actions
  useModalActions({
    onSubmit: handleSubmit,
    onCancel,
    isSubmitting: mutationCreate.isPending,
    submitLabel: labels.buttons.addApTitle,
    cancelLabel: labels.buttons.cancel
  });

  return (
    <Form>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={labels.errors.generic} isInline>
            {validated}
          </Alert>
        </FormAlert>
      )}
      <FormGroup label={labels.forms.name} isRequired fieldId="access-point-name">
        <TextInput
          isRequired
          type="text"
          id="access-point-name"
          name="access-point-name"
          value={name}
          onChange={(_event, value) => setName(value)}
        />
      </FormGroup>
      <FormGroup label={labels.forms.type} isRequired fieldId="access-point-kind">
        <FormSelect
          value={kind}
          onChange={(_event, value) => setKind(value as 'claim' | 'peer' | 'member' | 'manage')}
          id="access-point-kind"
          name="access-point-kind"
        >
          <FormSelectOption value="claim" label={labels.forms.claim} />
          <FormSelectOption value="peer" label={labels.forms.peer} />
          <FormSelectOption value="member" label={labels.forms.member} />
          <FormSelectOption value="manage" label={labels.forms.manage} />
        </FormSelect>
      </FormGroup>
      <FormGroup label="Host" fieldId="access-point-bindhost">
        <TextInput
          type="text"
          id="access-point-bindhost"
          name="access-point-bindhost"
          value={bindhost}
          onChange={(_event, value) => setBindhost(value)}
        />
      </FormGroup>
    </Form>
  );
};

export default AccessPointForm;
