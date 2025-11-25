# Correções Aplicadas - Frontend "Page not found"

## Problema Identificado

Ao acessar `https://fluxo-barcode-z55lw2s5iq-uc.a.run.app`, o erro "Page not found" ocorria porque:

1. A rota `/` retornava JSON ao invés de servir o `index.html` do frontend React
2. Não havia rota catch-all para suportar React Router (SPA routing)
3. Os arquivos estáticos do React não estavam sendo servidos corretamente

## Alterações Aplicadas

### 1. Rota Raiz Modificada (`backend/server.js` - linha ~851)

**Antes:**
```javascript
app.get('/', (req, res) => {
  res.json({ message: 'Servidor Larroudé RFID funcionando!' });
});
```

**Depois:**
```javascript
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'app', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('[ROUTE] Erro ao servir index.html:', err);
      res.json({ 
        message: 'Servidor Larroudé RFID funcionando!',
        error: 'Frontend não encontrado. Verifique se o build foi feito corretamente.'
      });
    }
  });
});
```

### 2. Rota Catch-All Adicionada (`backend/server.js` - linha ~5221)

Adicionada rota catch-all para suportar React Router (SPA routing):

```javascript
app.get('*', (req, res, next) => {
  // Se for uma rota de API ou health check, não servir index.html
  if (req.path.startsWith('/api') || req.path === '/health' || req.path.startsWith('/zpl-tester')) {
    return next(); // Passa para o próximo middleware (retorna 404 para APIs inexistentes)
  }
  
  // Para todas as outras rotas, servir o index.html do React
  const indexPath = path.join(__dirname, 'public', 'app', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('[ROUTE] Erro ao servir index.html para rota:', req.path, err);
      res.status(404).json({ 
        error: 'Página não encontrada',
        path: req.path 
      });
    }
  });
});
```

**Localização:** Antes do tratamento de erros (após todas as rotas de API)

### 3. Arquivos Estáticos (`backend/server.js` - linha ~847)

Configuração de arquivos estáticos ajustada:

```javascript
// Servir todos os arquivos estáticos da pasta public (incluindo app/static/)
app.use(express.static(path.join(__dirname, 'public')));
```

## Como Funciona Agora

1. **Arquivos estáticos** (JS, CSS, imagens):
   - Servidos automaticamente pelo `express.static('public')`
   - Exemplo: `/static/js/main.abc123.js` → servido de `public/app/static/js/main.abc123.js`

2. **Rotas de API** (`/api/*`, `/health`, `/zpl-tester`):
   - Processadas normalmente pelas rotas definidas
   - Se não existirem, retornam 404

3. **Rota raiz** (`/`):
   - Serve o `index.html` do React

4. **Outras rotas** (qualquer outra coisa):
   - A rota catch-all serve o `index.html`
   - O React Router no cliente processa a rota no frontend (SPA routing)

## Estrutura Esperada no Container

Após o build do Docker, a estrutura deve ser:

```
/app/backend/
  ├── public/
  │   └── app/              (cópia do build do React)
  │       ├── index.html
  │       └── static/
  │           ├── js/
  │           └── css/
  └── server.js
```

## Próximos Passos

1. **Fazer deploy das alterações:**
   ```bash
   # As alterações serão aplicadas no próximo build/deploy automático via GitHub Actions
   # Ou faça commit e push para a branch main
   ```

2. **Verificar após deploy:**
   ```bash
   # Testar a rota raiz
   curl https://fluxo-barcode-z55lw2s5iq-uc.a.run.app/
   
   # Deve retornar o HTML do frontend (não mais JSON)
   ```

3. **Verificar logs se ainda houver problemas:**
   ```bash
   gcloud run services logs read fluxo-barcode \
     --project=larroude-data-prod \
     --region=us-central1 \
     --limit=50
   ```

## Observações

- A rota catch-all **não interfere** com rotas de API existentes
- Rotas de API inexistentes retornam 404 corretamente
- O React Router no frontend pode agora processar rotas como `/labels`, `/config`, etc.
- O fallback garante que se o `index.html` não existir, ainda retorna uma resposta útil

## Data

Alterações aplicadas em: 2025-01-25

