# 🔗 Integração com PostgreSQL - Guia Completo

O app RFID Reader agora pode buscar informações do produto diretamente na mesma view PostgreSQL que o gerador de etiquetas usa!

## 📋 View Utilizada

**`senda.vw_labels_variants_barcode`**

Esta é a mesma view usada pelo sistema de geração de etiquetas RFID.

## 🎯 Como Funciona

### 1. Leitura do RFID

Quando você lê uma tag RFID, o app:

1. **Decodifica o EPC** no formato ZebraDesigner:
   ```
   EPC: 197416145132046412345678
   ├─ Barcode: 197416145132 (12 dígitos)
   ├─ PO: 0464 (4 dígitos)
   └─ Sequencial: 12345678 (resto)
   ```

2. **Busca na view** usando barcode + PO:
   ```sql
   SELECT * FROM senda.vw_labels_variants_barcode
   WHERE barcode = '197416145132'
     AND ordem_pedido = '0464'
   ```

3. **Exibe informações completas**:
   - ✅ SKU/VPM completo (ex: `L458-JASM-11.0-SILV-1885`)
   - ✅ Variant (ex: `SILVER - 11.0`)
   - ✅ Style Name
   - ✅ Referência
   - ✅ Quantidade

## ⚙️ Configuração Passo a Passo

### Passo 1: Editar config.js

Abra `rfid-reader-app/config.js` e localize a seção `database`:

```javascript
database: {
  enabled: false,  // ← MUDAR PARA true
  host: 'localhost',
  port: 5432,
  database: 'nome_do_seu_banco',      // ← CONFIGURAR
  user: 'seu_usuario',                // ← CONFIGURAR
  password: 'sua_senha',              // ← CONFIGURAR
  ssl: false,
  viewName: 'senda.vw_labels_variants_barcode'
}
```

### Passo 2: Configurar Credenciais

Substitua os valores:
- `database`: Nome do seu banco PostgreSQL
- `user`: Usuário do banco
- `password`: Senha do banco
- `host`: Host do banco (geralmente `localhost`)
- `port`: Porta do banco (geralmente `5432`)

### Passo 3: Habilitar

Mude `enabled: false` para `enabled: true`

### Passo 4: Executar

```bash
npm start
```

O app tentará conectar ao banco automaticamente.

## 🔍 Verificar se Funcionou

1. **Conecte o leitor RFID**
2. **Leia uma tag**
3. **Verifique se aparece**:
   - ✅ SKU/VPM completo (não só barcode)
   - ✅ Variant (cor - tamanho)
   - ✅ Style Name

Se aparecer apenas barcode e PO, a conexão com o banco não está funcionando.

## 📊 Campos Retornados

A view retorna os seguintes campos que o app exibe:

| Campo na View | Campo no App | Descrição |
|--------------|--------------|-----------|
| `VPN` | `vpm` / `sku` | SKU completo com variant |
| `"STYLE NAME"` | `styleName` | Nome do produto |
| `"COLOR"` | `color` | Cor do produto |
| `"SIZE"` | `size` | Tamanho |
| `barcode` | `barcode` | Código de barras |
| `ordem_pedido` | `poNumber` | Número do pedido |
| `referencia` | `referencia` | Referência do produto |
| `qty` | `qty` | Quantidade |

## 🔒 Segurança (Variáveis de Ambiente)

Para não expor senhas no código, use variáveis de ambiente:

### config.js:
```javascript
database: {
  enabled: true,
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_DATABASE || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true'
}
```

### Windows (CMD):
```cmd
set DB_HOST=localhost
set DB_PORT=5432
set DB_DATABASE=meu_banco
set DB_USER=meu_usuario
set DB_PASSWORD=minha_senha
```

### Windows (PowerShell):
```powershell
$env:DB_HOST="localhost"
$env:DB_PORT="5432"
$env:DB_DATABASE="meu_banco"
$env:DB_USER="meu_usuario"
$env:DB_PASSWORD="minha_senha"
```

### Linux/Mac:
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_DATABASE=meu_banco
export DB_USER=meu_usuario
export DB_PASSWORD=minha_senha
```

## ❓ Problemas Comuns

### "Banco de dados não disponível"

**Causa**: Conexão não estabelecida

**Solução**:
- Verifique se o PostgreSQL está rodando
- Verifique host, porta, usuário, senha
- Teste conexão com `psql` ou pgAdmin

### "View não encontrada"

**Causa**: View não existe ou sem permissão

**Solução**:
```sql
-- Verificar se a view existe
SELECT * FROM pg_views 
WHERE schemaname = 'senda' 
  AND viewname = 'vw_labels_variants_barcode';

-- Verificar permissões
GRANT SELECT ON senda.vw_labels_variants_barcode TO seu_usuario;
```

### "Nenhum dado encontrado"

**Causa**: Barcode ou PO não correspondem

**Solução**:
- Verifique se o EPC foi decodificado corretamente
- Verifique se o barcode existe na view
- Verifique se a PO corresponde

### App funciona mas não mostra SKU

**Causa**: Banco não configurado ou não conectou

**Solução**:
- Verifique se `enabled: true` no config.js
- Veja logs no console (F12)
- Verifique conexão ao banco

## ✅ Teste Manual

Para testar se a view está acessível:

```sql
-- Conectar ao banco
psql -U seu_usuario -d seu_banco

-- Testar query
SELECT 
  barcode,
  ordem_pedido,
  "VPN",
  "STYLE NAME",
  "COLOR",
  "SIZE"
FROM senda.vw_labels_variants_barcode
WHERE barcode = '197416145132'
LIMIT 5;
```

Se retornar dados, a view está funcionando!

## 🎯 Formato do EPC RFID

O formato ZebraDesigner que o app espera:

```
[Barcode 12 dígitos][PO 4 dígitos][Sequencial][Zeros]
197416145132      0464          12345678    000000
```

**Decodificação automática:**
- Barcode: `197416145132` (posições 0-11)
- PO: `0464` (posições 12-15)
- Resto: sequencial/zeros (posições 16+)

## 📝 Notas Importantes

1. **App funciona sem banco**: Se não configurar o banco, o app continua funcionando, apenas mostra barcode e PO (não SKU completo)

2. **Mantém independência**: O app ainda é independente - o banco é opcional

3. **Mesma view do gerador**: Usa exatamente a mesma view que o gerador de etiquetas usa

4. **Cache**: O app mantém conexão aberta (pool) para melhor performance

## 🔄 Próximos Passos

Após configurar:
1. Execute `npm start`
2. Conecte o leitor RFID
3. Leia uma tag
4. Veja o SKU completo aparecer! 🎉

