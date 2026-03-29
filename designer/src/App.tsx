// import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
// import { supabase } from './lib/supabase';
// import { Auth } from './components/Auth';
import { ProjectList } from './components/ProjectList';
import { Canvas } from './components/Canvas';

// Auth disabled for now — using a mock user
// Re-enable Auth component and supabase imports when Supabase is set up
const MOCK_USER: User = {
  id: 'local-user',
  email: 'designer@agentux.dev',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as User;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList user={MOCK_USER} />} />
      <Route path="/project/:projectId" element={<Canvas user={MOCK_USER} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
