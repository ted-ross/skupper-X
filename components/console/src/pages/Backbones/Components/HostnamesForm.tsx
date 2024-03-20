import { FC } from 'react';

import { CodeEditor, Language } from '@patternfly/react-code-editor';

const HostnamesForm: FC<{ onSubmit?: (code: string) => void }> = function ({ onSubmit }) {
  const onChange = (newCode: string) => {
    if (onSubmit) {
      onSubmit(newCode);
    }
  };

  return (
    <CodeEditor isLanguageLabelVisible height="400px" onCodeChange={onChange} language={Language.json} isDarkTheme />
  );
};

export default HostnamesForm;
