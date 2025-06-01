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
  FormSelectOption,
  Checkbox
} from '@patternfly/react-core';
import { useMutation, useQueries } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { InvitationRequest, HTTPError } from '../../../API/REST.interfaces';
import labels from '../../../core/config/labels';

interface InvitationFormProps {
  vanId: string;
  onSubmit: () => void;
  onCancel: () => void;
  onRefresh?: () => void;
}

const InvitationForm: FC<InvitationFormProps> = function ({ vanId, onSubmit, onCancel, onRefresh }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [name, setName] = useState<string>('');
  const [claimAccessId, setClaimAccessId] = useState<string | undefined>();
  const [memberAccessId, setMemberAccessId] = useState<string | undefined>();
  const [joinDeadline, setJoinDeadline] = useState<string>('');
  const [siteClass, setSiteClass] = useState<string>('');
  const [prefix, setPrefix] = useState<string>('');
  const [instanceLimit, setInstanceLimit] = useState<string>('1');
  const [interactive, setInteractive] = useState<boolean>(false);
  const [unlimited, setUnlimited] = useState<boolean>(false);

  // Fetch access points data
  const [, { data: claims }, { data: members }] = useQueries({
    queries: [
      {
        queryKey: ['van', vanId],
        queryFn: () => RESTApi.searchVan(vanId)
      },
      {
        queryKey: ['claimAccess', vanId],
        queryFn: async () => {
          const vanData = await RESTApi.searchVan(vanId);
          return RESTApi.fetchAccessClaims(vanData.backboneid);
        }
      },
      {
        queryKey: ['memberAccess', vanId],
        queryFn: async () => {
          const vanData = await RESTApi.searchVan(vanId);
          return RESTApi.fetchAccessMember(vanData.backboneid);
        }
      }
    ]
  });

  const mutationCreate = useMutation({
    mutationFn: (data: InvitationRequest) => RESTApi.createInvitation(vanId, data),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: () => {
      if (onRefresh) {
        onRefresh();
      }
      onSubmit();
    }
  });

  const handleNameChange = (_: FormEvent<HTMLInputElement>, newName: string) => {
    setName(newName);
  };

  const handleClaimAccessChange = (_: FormEvent<HTMLSelectElement>, value: string) => {
    setClaimAccessId(value);
  };

  const handleMemberAccessChange = (_: FormEvent<HTMLSelectElement>, value: string) => {
    setMemberAccessId(value);
  };

  const handleJoinDeadlineChange = (_: FormEvent<HTMLInputElement>, value: string) => {
    setJoinDeadline(value);
  };

  const handleSiteClassChange = (_: FormEvent<HTMLInputElement>, value: string) => {
    setSiteClass(value);
  };

  const handlePrefixChange = (_: FormEvent<HTMLInputElement>, value: string) => {
    setPrefix(value);
  };

  const handleInstanceLimitChange = (_: FormEvent<HTMLInputElement>, value: string) => {
    setInstanceLimit(value);
  };

  const handleInteractiveChange = (_: FormEvent<HTMLInputElement>, checked: boolean) => {
    setInteractive(checked);
  };

  const handleUnlimitedChange = (_: FormEvent<HTMLInputElement>, checked: boolean) => {
    setUnlimited(checked);
    if (checked) {
      setInstanceLimit('');
    }
  };

  const handleSubmit = () => {
    if (!name) {
      setValidated(labels.validation.nameRequired);
      return;
    }
    if (!claimAccessId || !memberAccessId) {
      setValidated(labels.validation.bothAccessPointsRequired);
      return;
    }
    const data: InvitationRequest = {
      name,
      claimaccess: claimAccessId,
      primaryaccess: memberAccessId,
      interactive: interactive.toString() as 'true' | 'false' // Convert boolean to string for backend
    };
    if (joinDeadline) {
      data.joindeadline = joinDeadline;
    }
    if (siteClass) {
      data.siteclass = siteClass;
    }
    if (prefix) {
      data.prefix = prefix;
    }
    if (!unlimited && instanceLimit) {
      data.instancelimit = parseInt(instanceLimit, 10);
    }
    mutationCreate.mutate(data);
  };

  // Set default values when data is loaded
  useEffect(() => {
    if (claims?.length && !claimAccessId) {
      setClaimAccessId(claims[0].id);
    }
  }, [claims, claimAccessId]);

  useEffect(() => {
    if (members?.length && !memberAccessId) {
      setMemberAccessId(members[0].id);
    }
  }, [members, memberAccessId]);

  // Set default deadline to 1 hour from now
  useEffect(() => {
    if (!joinDeadline) {
      const defaultDeadline = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      setJoinDeadline(defaultDeadline.toISOString().slice(0, 16));
    }
  }, [joinDeadline]);

  const setDeadlinePreset = (hours: number) => {
    const deadline = new Date(Date.now() + hours * 60 * 60 * 1000);
    setJoinDeadline(deadline.toISOString().slice(0, 16));
  };

  return (
    <Form isHorizontal>
      {validated && (
        <FormAlert>
          <Alert variant="danger" title={validated} isInline />
        </FormAlert>
      )}
      <FormGroup isRequired label={labels.forms.name} fieldId="invitation-name">
        <TextInput
          isRequired
          type="text"
          id="invitation-name"
          name="invitation-name"
          value={name}
          onChange={handleNameChange}
        />
      </FormGroup>
      <FormGroup isRequired label={labels.forms.claimAccessPoint} fieldId="claim-access">
        <FormSelect
          value={claimAccessId}
          onChange={handleClaimAccessChange}
          aria-label={labels.forms.selectClaimAccessPoint}
          isDisabled={!claims?.length}
        >
          {claims?.map((claim) => <FormSelectOption key={claim.id} value={claim.id} label={claim.name} />)}
        </FormSelect>
        {!claims?.length && (
          <div className="sk-text-secondary sk-margin-top-xs">{labels.forms.noClaimAccessPoints}</div>
        )}
      </FormGroup>
      <FormGroup isRequired label={labels.forms.memberAccessPoint} fieldId="member-access">
        <FormSelect
          value={memberAccessId}
          onChange={handleMemberAccessChange}
          aria-label={labels.forms.selectMemberAccessPoint}
          isDisabled={!members?.length}
        >
          {members?.map((member) => <FormSelectOption key={member.id} value={member.id} label={member.name} />)}
        </FormSelect>
        {!members?.length && (
          <div className="sk-text-secondary sk-margin-top-xs">{labels.forms.noMemberAccessPoints}</div>
        )}
      </FormGroup>
      <FormGroup label={labels.forms.joinDeadline} fieldId="join-deadline">
        <div>
          <TextInput
            type="datetime-local"
            id="join-deadline"
            name="join-deadline"
            value={joinDeadline}
            onChange={handleJoinDeadlineChange}
          />
          <div className="sk-margin-top-sm">
            <Button variant="link" size="sm" onClick={() => setDeadlinePreset(1)}>
              {labels.forms.oneHour}
            </Button>
            <Button variant="link" size="sm" onClick={() => setDeadlinePreset(24)}>
              {labels.forms.oneDay}
            </Button>
            <Button variant="link" size="sm" onClick={() => setDeadlinePreset(24 * 7)}>
              {labels.forms.oneWeek}
            </Button>
            <Button variant="link" size="sm" onClick={() => setDeadlinePreset(24 * 365)}>
              {labels.forms.oneYear}
            </Button>
          </div>
        </div>
      </FormGroup>
      <FormGroup label={labels.forms.instanceLimit} fieldId="instance-limit">
        <>
          <TextInput
            type="number"
            id="instance-limit"
            name="instance-limit"
            value={instanceLimit}
            onChange={handleInstanceLimitChange}
            isDisabled={unlimited}
            min="1"
          />
          <Checkbox
            label={labels.forms.unlimited}
            isChecked={unlimited}
            onChange={handleUnlimitedChange}
            id="unlimited-check"
          />
        </>
      </FormGroup>
      <FormGroup fieldId="interactive">
        <Checkbox
          label={labels.forms.interactive}
          isChecked={interactive}
          onChange={handleInteractiveChange}
          id="interactive-check"
          description={labels.forms.interactiveDescription}
        />
      </FormGroup>
      <FormGroup label={labels.forms.siteClass} fieldId="site-class">
        <TextInput type="text" id="site-class" name="site-class" value={siteClass} onChange={handleSiteClassChange} />
      </FormGroup>
      <FormGroup label={labels.forms.memberNamePrefix} fieldId="member-name-prefix">
        <TextInput
          type="text"
          id="member-name-prefix"
          name="member-name-prefix"
          value={prefix}
          onChange={handlePrefixChange}
        />
      </FormGroup>
      <ActionGroup>
        <Button variant="primary" onClick={handleSubmit} isLoading={mutationCreate.isPending}>
          {labels.buttons.submit}
        </Button>
        <Button variant="link" onClick={onCancel}>
          {labels.buttons.cancel}
        </Button>
      </ActionGroup>
    </Form>
  );
};

export default InvitationForm;
