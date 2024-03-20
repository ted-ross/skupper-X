import { useState, FC, FormEvent } from 'react';

import { Form, FormGroup, TextInput, ActionGroup, Button, FormAlert, Alert, Checkbox } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';

import { RESTApi } from '@API/REST.api';
import { BackboneRequest, HTTPError } from '@API/REST.interfaces';

import { BackboneLabels } from '../Backbones.enum';

const BackboneForm: FC<{
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string | undefined>();
  const [multitenant, setMultitenant] = useState<boolean>(true);

  const mutationCreate = useMutation({
    mutationFn: (data: BackboneRequest) => RESTApi.createBackbone(data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleNameChange = (_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
  };

  const handleChangeMultitenant = (_: FormEvent<HTMLInputElement>, checked: boolean) => {
    setMultitenant(checked);
  };

  const handleSubmit = () => {
    if (!name) {
      setValidated(BackboneLabels.ErrorMessageRequiredField);

      return;
    }

    mutationCreate.mutate({ name, multitenant: String(multitenant) } as BackboneRequest);
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      <FormGroup isRequired label={BackboneLabels.Name} fieldId="backbone-name">
        <TextInput
          isRequired
          type="text"
          id="backbone-name"
          name="backbone-name"
          value={name}
          onChange={handleNameChange}
        />
      </FormGroup>

      <FormGroup fieldId="backbone-multitenancy">
        <Checkbox
          label={BackboneLabels.Multitenant}
          isChecked={multitenant}
          onChange={handleChangeMultitenant}
          id="claim-check-"
          name="claim"
        />
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

export default BackboneForm;
