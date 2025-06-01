import { DefaultOptions } from '@tanstack/react-query';

interface QueryClientConfig {
  defaultOptions: {
    queries: Partial<DefaultOptions['queries']>;
    suspense?: boolean;
  };
}

/** React query library config: contains configuration options for the React query library, used for fetching and caching data in the UI */
export const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchIntervalInBackground: false,
      throwOnError: true,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000 // 10 minutes - prevents memory buildup
    },
    // If you need suspense, add it at the root level
    suspense: false
  }
};
