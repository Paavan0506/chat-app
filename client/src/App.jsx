import { AuthProvider, useAuth } from './context/AuthContext';
import Auth from './pages/Auth';
import Chat from './pages/Chat';

function AppContent() {
  const { user } = useAuth();
  return user ? <Chat /> : <Auth />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
