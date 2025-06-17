import { useMutation, useQueryClient, MutationFunction, UseMutationOptions } from '@tanstack/react-query';

import { QueriesBackbones } from '../../pages/Backbones/Backbones.enum';
import { QueriesTopology } from '../../pages/Topology/Topology.enum';
import { QueriesVans } from '../../pages/Vans/Vans.enum';
import { QueriesApplications } from '../../pages/Applications/Applications.enum';
import { QueriesLibraries } from '../../pages/Libraries/Libraries.enum';

/**
 * Configuration for cache invalidation patterns
 */
export interface CacheInvalidationConfig {
  /** Specific query keys to invalidate */
  queryKeys?: string[][];
  /** Invalidate all backbone-related queries */
  invalidateBackbones?: boolean;
  /** Invalidate topology data */
  invalidateTopology?: boolean;
  /** Invalidate VANs data */
  invalidateVans?: boolean;
  /** Invalidate applications data */
  invalidateApplications?: boolean;
  /** Invalidate libraries data */
  invalidateLibraries?: boolean;
  /** Invalidate specific backbone sites by backbone ID */
  invalidateBackboneSites?: string[];
  /** Custom invalidation function */
  customInvalidation?: (queryClient: ReturnType<typeof useQueryClient>) => void;
}

/**
 * Hook that wraps useMutation with automatic cache invalidation
 *
 * @param mutationFn - The mutation function
 * @param invalidationConfig - Configuration for which caches to invalidate
 * @param options - Additional mutation options
 * @returns Enhanced mutation with automatic cache invalidation
 */
export const useMutationWithCacheInvalidation = <TData = unknown, TError = unknown, TVariables = void, TContext = unknown>(
  mutationFn: MutationFunction<TData, TVariables>,
  invalidationConfig: CacheInvalidationConfig,
  options?: UseMutationOptions<TData, TError, TVariables, TContext>
) => {
  const queryClient = useQueryClient();

  const invalidateQueries = async () => {
    const promises: Promise<void>[] = [];

    // Invalidate specific query keys
    if (invalidationConfig.queryKeys) {
      for (const queryKey of invalidationConfig.queryKeys) {
        promises.push(queryClient.invalidateQueries({ queryKey }));
      }
    }

    // Invalidate backbone-related queries
    if (invalidationConfig.invalidateBackbones) {
      promises.push(
        queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetBackbones] }),
        queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetLinks] }),
        queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetIncomingLinks] })
      );
    }

    // Invalidate specific backbone sites
    if (invalidationConfig.invalidateBackboneSites) {
      for (const backboneId of invalidationConfig.invalidateBackboneSites) {
        promises.push(
          queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetSites, backboneId] })
        );
      }
    }

    // Invalidate topology data
    if (invalidationConfig.invalidateTopology) {
      promises.push(
        queryClient.invalidateQueries({ queryKey: [QueriesTopology.GetTopologyData] }),
        queryClient.invalidateQueries({ queryKey: [QueriesTopology.GetBackbones] }),
        queryClient.invalidateQueries({ queryKey: [QueriesTopology.GetSites] })
      );
    }

    // Invalidate VANs data
    if (invalidationConfig.invalidateVans) {
      promises.push(
        queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVans] }),
        queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVanMembers] }),
        queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVanInvitations] })
      );
    }

    // Invalidate applications data
    if (invalidationConfig.invalidateApplications) {
      promises.push(
        queryClient.invalidateQueries({ queryKey: [QueriesApplications.GetApplications] })
      );
    }

    // Invalidate libraries data
    if (invalidationConfig.invalidateLibraries) {
      promises.push(
        queryClient.invalidateQueries({ queryKey: [QueriesLibraries.GetLibraries] }),
        queryClient.invalidateQueries({ queryKey: [QueriesLibraries.GetLibraryBlocks] })
      );
    }

    // Custom invalidation
    if (invalidationConfig.customInvalidation) {
      invalidationConfig.customInvalidation(queryClient);
    }

    await Promise.all(promises);
  };

  return useMutation({
    ...options,
    mutationFn,
    onSuccess: async (data, variables, context) => {
      // Execute cache invalidation
      await invalidateQueries();

      // Call original onSuccess if provided
      if (options?.onSuccess) {
        await options.onSuccess(data, variables, context);
      }
    },
  });
};

/**
 * Predefined invalidation configurations for common operations
 */
export const CacheInvalidationPresets = {
  // Backbone operations
  createBackbone: {
    invalidateBackbones: true,
    invalidateTopology: true,
  } as CacheInvalidationConfig,

  deleteBackbone: {
    invalidateBackbones: true,
    invalidateTopology: true,
  } as CacheInvalidationConfig,

  activateBackbone: {
    invalidateBackbones: true,
    invalidateTopology: true,
  } as CacheInvalidationConfig,

  // Site operations
  createSite: (backboneId: string) => ({
    invalidateBackboneSites: [backboneId],
    invalidateTopology: true,
  }) as CacheInvalidationConfig,

  deleteSite: (backboneId: string) => ({
    invalidateBackboneSites: [backboneId],
    invalidateTopology: true,
  }) as CacheInvalidationConfig,

  updateSite: (backboneId: string) => ({
    invalidateBackboneSites: [backboneId],
    invalidateTopology: true,
  }) as CacheInvalidationConfig,

  // Link operations
  createLink: (backboneId: string) => ({
    invalidateBackboneSites: [backboneId],
    invalidateTopology: true,
    queryKeys: [[QueriesBackbones.GetLinks]],
  }) as CacheInvalidationConfig,

  deleteLink: (backboneId: string) => ({
    invalidateBackboneSites: [backboneId],
    invalidateTopology: true,
    queryKeys: [[QueriesBackbones.GetLinks]],
  }) as CacheInvalidationConfig,

  // Access Point operations
  createAccessPoint: (backboneId: string) => ({
    invalidateBackboneSites: [backboneId],
    invalidateTopology: true,
  }) as CacheInvalidationConfig,

  deleteAccessPoint: (backboneId: string) => ({
    invalidateBackboneSites: [backboneId],
    invalidateTopology: true,
  }) as CacheInvalidationConfig,

  // VAN operations
  createVan: {
    invalidateVans: true,
  } as CacheInvalidationConfig,

  deleteVan: {
    invalidateVans: true,
  } as CacheInvalidationConfig,

  // Application operations
  createApplication: {
    invalidateApplications: true,
  } as CacheInvalidationConfig,

  deleteApplication: {
    invalidateApplications: true,
  } as CacheInvalidationConfig,

  buildApplication: {
    invalidateApplications: true,
  } as CacheInvalidationConfig,

  // Library operations
  createLibrary: {
    invalidateLibraries: true,
  } as CacheInvalidationConfig,

  deleteLibrary: {
    invalidateLibraries: true,
  } as CacheInvalidationConfig,
};
