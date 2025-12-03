import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DesktopApp } from './DesktopApp';
import { MobileApp } from './MobileApp';
import { ComparisonPage } from './ComparisonPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DesktopApp />} />
        <Route path="/mobile" element={<MobileApp />} />
        <Route path="/comparison" element={<ComparisonPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
