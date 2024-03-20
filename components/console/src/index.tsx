import { createRoot } from 'react-dom/client';

import { Wrapper } from '@core/components/Wrapper';
import App from 'App';

const rootElement = document.getElementById('app') as HTMLDivElement;
const root = createRoot(rootElement);

root.render(
  <Wrapper>
    <App />
  </Wrapper>
);
