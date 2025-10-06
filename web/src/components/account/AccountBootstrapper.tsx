'use client';

import { useEffect } from 'react';
import { useAccountStore } from '@/modules/account/store';

export function AccountBootstrapper() {
  useEffect(() => {
    if (bootstrapTriggered) {
      return;
    }
    bootstrapTriggered = true;
    void useAccountStore.getState().actions.initialize();
  }, []);

  return null;
}

let bootstrapTriggered = false;

export function __dangerous__resetAccountBootstrapper() {
  bootstrapTriggered = false;
}
