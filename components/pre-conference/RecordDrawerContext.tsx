'use client';

import { createContext, useContext } from 'react';

export const RecordDrawerCtx = createContext<(type: 'attendee' | 'company', id: number) => void>(() => {});
export const useRecordDrawer = () => useContext(RecordDrawerCtx);
