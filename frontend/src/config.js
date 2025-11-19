// Configuração da API
// A URL da API pode ser definida via variável de ambiente REACT_APP_API_URL
// Se não estiver definida, usa localhost para desenvolvimento
// Para produção (Cloud Run), defina REACT_APP_API_URL com a URL do seu backend

const getApiBaseUrl = () => {
  // Em produção, usar variável de ambiente ou detectar automaticamente
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Se estiver rodando em produção (build), tentar detectar a URL do backend
  if (process.env.NODE_ENV === 'production') {
    // Se a aplicação está sendo servida do mesmo domínio do backend, usar caminho relativo
    // Caso contrário, você precisa definir REACT_APP_API_URL
    const hostname = window.location.hostname;
    
    // Se estiver no Cloud Run ou similar, o backend geralmente está no mesmo domínio
    // Ajuste conforme necessário
    if (hostname.includes('run.app') || hostname.includes('cloud.google.com')) {
      // Assumindo que o backend está em /api ou no mesmo domínio
      return window.location.origin;
    }
    
    // Fallback: tentar usar o mesmo hostname com porta padrão
    return `http://${hostname}:3005`;
  }
  
  // Desenvolvimento: usar localhost
  return 'http://localhost:3005';
};

export const API_BASE = getApiBaseUrl();
export const API_BASE_URL = `${API_BASE}/api`;

// Log da configuração (apenas em desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  console.log('[CONFIG] API Base URL:', API_BASE);
  console.log('[CONFIG] API Base URL (com /api):', API_BASE_URL);
}







