declare module '@clerk/nextjs' {
  export function __setMockClerkState(state: {
    isLoaded?: boolean;
    isSignedIn?: boolean;
    userId?: string | null;
    user?: any;
  }): void;
}

declare module '@clerk/nextjs/server' {
  export function __setMockServerAuthState(payload: { userId: string | null; user?: any }): void;
}

