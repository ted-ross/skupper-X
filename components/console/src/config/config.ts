import Logo from '../assets/skupper-logo.svg';

/**  URL config: contains configuration options and constants related to backend URLs and routing */
export const BASE_URL_COLLECTOR = process.env.COLLECTOR_URL || `${window.location.protocol}//${window.location.host}`;
const API_VERSION = '/api/v1alpha1';
const PROMETHEUS_SUFFIX = '/internal/prom';

// Base URL for the collector backend. Defaults to current host if not set in environment variables.
// In development, webpack proxy handles API routing, so we use relative paths
const isDevelopment = typeof window !== 'undefined' && window.location.hostname === 'localhost';
export const COLLECTOR_URL = isDevelopment ? API_VERSION : `${BASE_URL_COLLECTOR}${API_VERSION}`;
export const PROMETHEUS_URL = `${COLLECTOR_URL}${PROMETHEUS_SUFFIX}`;

// Default page size for tables. Set in environment variables, but can be overridden.
export const DEFAULT_PAGINATION_SIZE = 10;

// Brand
export const brandLogo = process.env.BRAND_APP_LOGO ? require(process.env.BRAND_APP_LOGO) : Logo;

/** General config: contains various global settings and constants */
export const MSG_TIMEOUT_ERROR = 'The request to fetch the data has timed out.'; // Error message to display when request times out
export const ALERT_VISIBILITY_TIMEOUT = 5000; // Time in milliseconds to display toast messages

/** Platform config: contains platform-related constants */
export const DEFAULT_PLATFORM = 'kube'; // Default target platform for new sites
