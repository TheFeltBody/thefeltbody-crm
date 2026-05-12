import AuthGate from './components/AuthGate.jsx';
import FeltBodyCRM from './FeltBodyCRM.jsx';

export default function App() {
  return (
    <AuthGate>
      <FeltBodyCRM />
    </AuthGate>
  );
}
