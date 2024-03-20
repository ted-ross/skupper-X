import { useState, FC, FormEvent } from 'react';

import { Form, FormGroup, TextInput, ActionGroup, Button, FormAlert, Alert, Checkbox } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';

import { RESTApi } from '@API/REST.api';
import { SiteRequest, HTTPError } from '@API/REST.interfaces';

import { BackboneLabels, SiteLabels } from '../Backbones.enum';

const SiteForm: FC<{
  bid: string;
  position?: { x: number; y: number };
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ bid, position, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string | undefined>();
  const [claim, setClaim] = useState<boolean>(true);
  const [peer, setPeer] = useState<boolean>(false);
  const [member, setMember] = useState<boolean>(true);
  const [manage, setManage] = useState<boolean>(false);

  const mutationCreate = useMutation({
    mutationFn: (data: SiteRequest) => RESTApi.createSite(bid, data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleNameChange = (_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
  };

  const handleChangeKind = (event: FormEvent<HTMLInputElement>, checked: boolean) => {
    const target = event.currentTarget;
    const targetName = target.name;

    switch (targetName) {
      case 'claim':
        setClaim(checked);
        break;
      case 'peer':
        setPeer(checked);
        break;
      case 'member':
        setMember(checked);
        break;
      case 'manage':
        setManage(checked);
        break;
      default:
        break;
    }
  };

  const handleSubmit = () => {
    if (!name) {
      setValidated(BackboneLabels.ErrorMessageRequiredField);

      return;
    }

    const data = {
      name,
      claim: claim.toString(),
      peer: peer.toString(),
      member: member.toString(),
      manage: manage.toString()
    } as SiteRequest;

    if (position) {
      data.metadata = JSON.stringify({
        position
      });
    }

    mutationCreate.mutate(data);
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

      <FormGroup isRequired label={BackboneLabels.Name} fieldId="site-name">
        <TextInput isRequired type="text" id="site-name" name="site-name" value={name} onChange={handleNameChange} />
      </FormGroup>

      <FormGroup fieldId="site-claim" isInline role="group">
        <Checkbox
          label={SiteLabels.Claim}
          isChecked={claim}
          onChange={handleChangeKind}
          id="claim-check-"
          name="claim"
        />
        <Checkbox label={SiteLabels.Peer} isChecked={peer} onChange={handleChangeKind} id="peer-check-" name="peer" />
        <Checkbox
          label={SiteLabels.Member}
          isChecked={member}
          onChange={handleChangeKind}
          id="member-check-"
          name="member"
        />
        <Checkbox
          label={SiteLabels.Manage}
          isChecked={manage}
          onChange={handleChangeKind}
          id="manage-check-"
          name="manage"
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

export default SiteForm;
