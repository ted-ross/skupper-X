import { FC, useCallback, useState } from 'react';

import { Alert, Wizard, WizardFooter, WizardHeader, WizardStep, useWizardContext } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';

import { RESTApi } from '@API/REST.api';
import { HTTPError } from '@API/REST.interfaces';
import { ALERT_VISIBILITY_TIMEOUT } from '@config/config';

import HostnamesForm from './HostnamesForm';
import IncomingLinks from './IncomingLinks';
import InitialDeploymentForm from './InitialDeploymentForm';

const DeployBootstrap: FC<{
  sid: string;
  onClose: () => void;
}> = function ({ sid, onClose }) {
  const [code, setCode] = useState<string>(''); // [1
  const [validated, setValidated] = useState<string | undefined>();

  const handleSubmit = useCallback((newCode: string) => {
    setCode(newCode);
  }, []);

  const CustomWizardFooter = function () {
    const { activeStep, goToNextStep, goToPrevStep, close } = useWizardContext();
    const mutationCreate = useMutation({
      mutationFn: (data: string) => RESTApi.fetchIngress(sid, data),
      onError: (data: HTTPError) => {
        setValidated(data.descriptionMessage);
      },
      onSuccess: () => {
        setCode('');
        goToNextStep();
      }
    });

    const handleNext = useCallback(() => {
      mutationCreate.mutate(code);
    }, [mutationCreate]);

    return (
      <WizardFooter
        activeStep={activeStep}
        onNext={handleNext}
        onBack={() => {
          setCode('');
          goToPrevStep();
        }}
        onClose={close}
        isNextDisabled={!code}
        isBackDisabled={activeStep.index === 1}
      />
    );
  };

  return (
    <Wizard
      onClose={onClose}
      height={750}
      title="Header wizard"
      header={
        <WizardHeader
          isCloseHidden
          title="Deploy Bootstrap"
          description="Router bootstrapping is required when deploying a new backbone network which has no routers currently reachable from the management controller."
        />
      }
    >
      <WizardStep name="Step 1" id="header-first-step">
        <Alert
          variant="info"
          title={'Get  the initial deployment file and deploy it into the namespace'}
          isInline
          className="pf-v5-u-mb-sm"
        />

        <InitialDeploymentForm sid={sid} />
      </WizardStep>
      <WizardStep name="Step 2" id="header-second-step" footer={<CustomWizardFooter />}>
        <Alert
          variant="info"
          title={
            "Paste the site's ingress for management access from 'kubectl exec -it skupperx-site-xxxxxxxxx-xxxxx -c controller -- skxhosts'"
          }
          isInline
          className="pf-v5-u-mb-sm"
        />

        {validated && <Alert variant="danger" title={validated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />}

        <HostnamesForm onSubmit={handleSubmit} />
      </WizardStep>
      <WizardStep
        name="Review"
        id="header-review-step"
        footer={{ nextButtonText: 'Done', onNext: onClose, isCancelHidden: true }}
      >
        <Alert
          variant="info"
          title={'Get the final Yaml for site configuration and deploy it into the namespace'}
          isInline
          className="pf-v5-u-mb-sm"
        />

        <IncomingLinks sid={sid} />
      </WizardStep>
    </Wizard>
  );
};

export default DeployBootstrap;
