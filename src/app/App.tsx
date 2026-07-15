import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CareerShell } from '../ui/CareerShell';
import { CharacterCreate } from '../ui/CharacterCreate';
import { NewCareerProvider } from '../ui/NewCareerContext';
import { SaveDashboard } from '../ui/SaveDashboard';
import { SettingsOffers } from '../ui/SettingsOffers';
import './style.css';

export function App() {
  return (
    <BrowserRouter>
      <NewCareerProvider>
        <main className="appShell">
          <Routes>
            <Route path="/" element={<SaveDashboard />} />
            <Route path="/new/create" element={<CharacterCreate />} />
            <Route path="/new/settings" element={<SettingsOffers />} />
            <Route path="/career/:saveId/*" element={<CareerShell />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </NewCareerProvider>
    </BrowserRouter>
  );
}
