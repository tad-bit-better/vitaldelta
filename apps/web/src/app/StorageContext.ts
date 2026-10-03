import { createContext, useContext } from 'react';
import type { Storage } from '../storage/types';

export const StorageContext = createContext<Storage | null>(null);

/** The active storage backend. Only available inside the app shell, after the user chose a mode. */
export function useStorage(): Storage {
  const storage = useContext(StorageContext);
  if (!storage) throw new Error('useStorage must be used inside StorageContext');
  return storage;
}
