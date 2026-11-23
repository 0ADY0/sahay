import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import PatientApp from './pages/patient/PatientApp';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/patient" element={<PatientApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
