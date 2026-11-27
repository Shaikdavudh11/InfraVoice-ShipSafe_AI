/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppShell } from './components/layout/AppShell';
import { AppProvider, useApp } from './context/AppContext';
import { HistoryPage } from './pages/HistoryPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { InfraVoicePage } from './pages/InfraVoicePage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShipSafePage } from './pages/ShipSafePage';

function RouteView() {
  const { route } = useApp();

  switch (route) {
    case '/shipsafe':
      return <ShipSafePage />;
    case '/infravoice':
      return <InfraVoicePage />;
    case '/incidents':
      return <IncidentsPage />;
    case '/history':
      return <HistoryPage />;
    case '/settings':
      return <SettingsPage />;
    case '/':
    default:
      return <OverviewPage />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <AppShell>
        <RouteView />
      </AppShell>
    </AppProvider>
  );
}
