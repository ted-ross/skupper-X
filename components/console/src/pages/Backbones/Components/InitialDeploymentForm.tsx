import { FC } from 'react';

import { CodeEditor, Language } from '@patternfly/react-code-editor';
import { useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { QueriesBackbones } from '../Backbones.enum';

const InitialDeploymentForm: FC<{
  sid: string;
}> = function ({ sid }) {
  const { data: code } = useQuery({
    queryKey: [QueriesBackbones.GetKubeInfo, sid],
    queryFn: () => RESTApi.fetchSiteDeployment(sid, 'kube')
  });

  return (
    <CodeEditor
      isDownloadEnabled
      isCopyEnabled
      isLanguageLabelVisible
      height="400px"
      code={code}
      language={Language.yaml}
      isDarkTheme
      isLineNumbersVisible
      isReadOnly
      downloadFileName="initial-deployment"
    />
  );
};

export default InitialDeploymentForm;
