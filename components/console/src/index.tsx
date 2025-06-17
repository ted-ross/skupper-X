import { createRoot } from 'react-dom/client';

import App from './App';
import { Wrapper } from './core/components/Wrapper';

const rootElement = document.getElementById('app') as HTMLDivElement;
const root = createRoot(rootElement);

root.render(
  <Wrapper>
    <App />
  </Wrapper>
);
