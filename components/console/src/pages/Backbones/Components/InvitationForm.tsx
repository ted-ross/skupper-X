import { useState, FC, FormEvent, useEffect } from 'react';

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
import { useMutation, useQueries } from '@tanstack/react-query';

import { RESTApi } from '@API/REST.api';
import { InvitationRequest, HTTPError } from '@API/REST.interfaces';

import { BackboneLabels, InvitationLabels, QueriesBackbones } from '../Backbones.enum';

const InvitationForm: FC<{
  bid: string;
  vid: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = function ({ vid, bid, onSubmit, onCancel }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string | undefined>();
  const [claimId, setClaimId] = useState<string | undefined>();
  const [memberId, setMemberId] = useState<string | undefined>();

  const [{ data: claims }, { data: members }] = useQueries({
    queries: [
      {
        queryKey: [QueriesBackbones.GetAccessClaim],
        queryFn: () => RESTApi.fetchAccessClaims(bid)
      },
      {
        queryKey: [QueriesBackbones.GetAccessMember],
        queryFn: () => RESTApi.fetchAccessMember(bid)
      }
    ]
  });

  const mutationCreate = useMutation({
    mutationFn: (data: InvitationRequest) => RESTApi.createInvitation(vid, data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: onSubmit
  });

  const handleNameChange = (_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
  };

  const handleClaimChange = (_: FormEvent<HTMLSelectElement>, value: string) => {
    setClaimId(value);
  };

  const handleMemberChange = (_: FormEvent<HTMLSelectElement>, value: string) => {
    setMemberId(value);
  };

  const handleSubmit = () => {
    if (!name) {
      setValidated(BackboneLabels.ErrorMessageRequiredField);

      return;
    }

    const data = {
      name,
      claimaccess: claimId,
      primaryaccess: memberId
    } as InvitationRequest;

    mutationCreate.mutate(data);
  };

  const handleCancel = () => {
    onCancel();
  };

  useEffect(() => {
    if (claims?.length) {
      setClaimId(claims[0].id);
    }

    if (members?.length) {
      setMemberId(members[0].id);
    }
  }, [claims, members]);

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}

      <FormGroup isRequired label={InvitationLabels.Name} fieldId="site-name">
        <TextInput isRequired type="text" id="site-name" name="site-name" value={name} onChange={handleNameChange} />
      </FormGroup>

      <FormGroup label={InvitationLabels.ClaimAccess} style={{ gridTemplateColumns: '1fr 4fr' }} fieldId="claim">
        <FormSelect value={claimId} onChange={handleClaimChange} aria-label="FormSelect Input">
          {claims?.map((option, index) => <FormSelectOption key={index} value={option.id} label={option.name} />)}
        </FormSelect>
      </FormGroup>

      <FormGroup label={InvitationLabels.MemberAccess} style={{ gridTemplateColumns: '1fr 4fr' }} fieldId="member">
        <FormSelect value={memberId} onChange={handleMemberChange} aria-label="FormSelect Input">
          {members?.map((option, index) => <FormSelectOption key={index} value={option.id} label={option.name} />)}
        </FormSelect>
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

export default InvitationForm;
