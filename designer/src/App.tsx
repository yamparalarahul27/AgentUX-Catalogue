import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { Auth } from './components/Auth';
import { ProjectList } from './components/ProjectList';
import { FlowList } from './components/FlowList';
import { Canvas } from './components/Canvas';
import { Catalogue } from './components/Catalogue';

const STORAGE_KEY = 'agentux-designer-email';

function createMockUser(email: string): User {
  const hash = Array.from(email).reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const id = `${hex}-0000-0000-0000-000000000000`;

  return {
    id,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as User;
}

export function App() {
  const [email, setEmail] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  function handleLogin(newEmail: string) {
    localStorage.setItem(STORAGE_KEY, newEmail);
    setEmail(newEmail);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setEmail(null);
  }

  if (!email) {
    return <Auth onLogin={handleLogin} />;
  }

  const user = createMockUser(email);

  return (
    <Routes>
      <Route path="/" element={<ProjectList user={user} onLogout={handleLogout} />} />
      <Route path="/project/:projectId" element={<FlowList user={user} />} />
      <Route path="/project/:projectId/flow/:flowId" element={<Canvas user={user} />} />
      <Route path="/catalogue" element={<Catalogue user={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
