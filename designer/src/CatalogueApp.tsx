import { Agentation } from 'agentation';
import { useAuth } from './lib/useAuth';
import { Auth } from './components/Auth';
import { Catalogue } from './components/Catalogue';

export function CatalogueApp() {
  const { user, login } = useAuth();

  if (!user) {
    return <Auth onLogin={login} />;
  }

  return (
    <>
      <Catalogue user={user} />
      {import.meta.env.DEV && <Agentation />}
    </>
  );
}
