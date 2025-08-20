
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import DesktopView from './components/DesktopView';
import PhoneView from './components/PhoneView';

const App = () => {
  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen font-sans">
      <HashRouter>
        <Routes>
          <Route path="/" element={<DesktopView />} />
          <Route path="/phone/" element={<PhoneView />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </HashRouter>
    </div>
  );
};

export default App;
