import React from 'react';
import { Menu } from 'lucide-react';
import './Header.css';

const Header = ({ sidebarOpen, setSidebarOpen, activeTab }) => {
  const getPageTitle = (tab) => {
    const titles = {
      labels: 'Geração de Etiquetas',
      config: 'Configuração da Impressora'
    };
    return titles[tab] || 'Sistema RFID Larroudé';
  };

  return (
    <header className="app-header">
      <div className="header-left">
        {/* Menu toggle para mobile */}
        <button
          className="menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu size={20} />
        </button>

        {/* Título da página */}
        <div className="page-title-section">
          <h1 className="page-title">{getPageTitle(activeTab)}</h1>
        </div>
      </div>
    </header>
  );
};

export default Header;
