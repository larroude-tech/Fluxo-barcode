# 🔧 Configuração do PostgreSQL para Busca de SKU

Este app pode buscar informações do produto diretamente na mesma view do PostgreSQL que o gerador usa.

## 📋 View Usada

O app usa a view: `senda.vw_labels_variants_barcode`

Esta é a mesma view usada pelo gerador de etiquetas RFID.

## ⚙️ Como Configurar

### 1. Editar config.js

Abra o arquivo `config.js` e configure a seção `database`:

```javascript
database: {
  enabled: true,  // Habilitar busca no PostgreSQL
  host: 'localhost',
  port: 5432,
  database: 'nome_do_seu_banco',
  user: 'seu_usuario',
  password: 'sua_senha',
  ssl: false,  // true se usar SSL
  viewName: 'senda.vw_labels_variants_barcode'
}
```

### 2. Usar Variáveis de Ambiente (Alternativa)

Em vez de editar `config.js`, você pode usar variáveis de ambiente:

```bash
# Windows (CMD)
set DB_HOST=localhost
set DB_PORT=5432
set DB_DATABASE=seu_banco
set DB_USER=seu_usuario
set DB_PASSWORD=sua_senha
set DB_SSL=false

# Windows (PowerShell)
$env:DB_HOST="localhost"
$env:DB_PORT="5432"
$env:DB_DATABASE="seu_banco"
$env:DB_USER="seu_usuario"
$env:DB_PASSWORD="sua_senha"
$env:DB_SSL="false"

# Linux/Mac
export DB_HOST=localhost
export DB_PORT=5432
export DB_DATABASE=seu_banco
export DB_USER=seu_usuario
export DB_PASSWORD=sua_senha
export DB_SSL=false
```

**Mas ainda precisa habilitar no config.js:**
```javascript
database: {
  enabled: true,  // IMPORTANTE: habilitar aqui
  // Outras configs via variáveis de ambiente
}
```

## 🔍 Como Funciona a Decodificação

Quando o app lê um RFID, ele:

1. **Decodifica o EPC** para extrair:
   - **Barcode** (primeiros 12 dígitos)
   - **PO Number** (próximos 4 dígitos)

2. **Busca na view** usando:
   ```sql
   SELECT * FROM senda.vw_labels_variants_barcode
   WHERE barcode = '...' AND ordem_pedido = '...'
   ```

3. **Retorna informações completas**:
   - SKU/VPM completo
   - Variant (cor + tamanho)
   - Style Name
   - Referência
   - Etc.

## 📊 Formato do EPC RFID

O formato usado é o **ZebraDesigner**:
- **Barcode**: 12 dígitos (ex: `197416145132`)
- **PO Number**: 4 dígitos (ex: `0464`)
- **Sequencial**: variável
- **Zeros**: para completar até 24 dígitos

**Exemplo completo**: `197416145132046412345678`
- Barcode: `197416145132`
- PO: `0464`
- Resto: `12345678`

## ✅ Verificação

Para verificar se está funcionando:

1. Configure o banco em `config.js`
2. Execute o app: `npm start`
3. Conecte o leitor RFID
4. Leia uma tag
5. O app deve mostrar:
   - ✅ SKU/VPM completo
   - ✅ Variant (cor - tamanho)
   - ✅ Outras informações do produto

## ❌ Se Não Funcionar

### Banco não conecta:
- Verifique host, porta, usuário, senha
- Verifique se o PostgreSQL está rodando
- Verifique firewall/rede

### View não encontrada:
- Verifique se a view `senda.vw_labels_variants_barcode` existe
- Verifique permissões do usuário do banco

### Dados não encontrados:
- Verifique se o barcode e PO estão corretos no banco
- Verifique se a decodificação do EPC está correta

### App funciona sem banco:
- Se o banco não estiver configurado ou não conectar, o app continua funcionando
- Ele apenas mostra o que consegue extrair do EPC (barcode e PO)
- Não mostra SKU completo e variant

## 🔒 Segurança

- **Não commit o config.js** com senhas reais no git
- Use variáveis de ambiente para produção
- Use `.env` files se necessário (com dotenv)

## 📝 Exemplo de config.js Seguro

```javascript
database: {
  enabled: true,
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_DATABASE || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true',
  viewName: 'senda.vw_labels_variants_barcode'
}
```

Desta forma, você configura via variáveis de ambiente sem expor senhas no código.

