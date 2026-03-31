import { Routes, Route, Navigate } from 'react-router-dom';
import { Agentation } from 'agentation';
import { useAuth } from './lib/useAuth';
import { Auth } from './components/Auth';
import { ProjectList } from './components/ProjectList';
import { FlowList } from './components/FlowList';
import { Canvas } from './components/Canvas';

export function App() {
  const { user, login, logout } = useAuth();

  if (!user) {
    return <Auth onLogin={login} />;
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<ProjectList user={user} onLogout={logout} />} />
        <Route path="/project/:projectId" element={<FlowList user={user} />} />
        <Route path="/project/:projectId/flow/:flowId" element={<Canvas user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {import.meta.env.DEV && <Agentation />}
    </>
  );
}
