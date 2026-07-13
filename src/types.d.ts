/* eslint-disable @typescript-eslint/no-explicit-any */

export {};

declare global {
  interface CrispRuntimeConfig {
    auth?: string | null;
    brand?: string;
    websiteId?: string;
    injectedByMiddleware?: boolean;
    privateKeyEnvName?: string;
    hasPrivateKeyBlob?: boolean;
    privateKeyBlob?: string;
  }

  interface Window {
    /** Injected by Vercel Edge Middleware from the Authorization header */
    __CRISP_AUTH?: string;
    __CRISP_CONFIG?: CrispRuntimeConfig;

    // Crisp globals
    $crisp: any;
    CRISP_WEBSITE_ID: string;
    CRISP_RUNTIME_CONFIG: Record<string, any>;
    $__CRISP_INSTANCE: any;
    $__CRISP_INCLUDED: boolean;
  }
}
