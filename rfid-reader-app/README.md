# Leitor RFID Desktop - SKU a Nível Variant

Aplicativo desktop para leitura de tags RFID e exibição de SKU a nível de variant (cor e tamanho).

## 📋 Funcionalidades

- ✅ **Conexão direta** com leitor RFID (Serial, HID, USB, **Bluetooth**)
- ✅ **Suporte completo para Bluetooth** (Serial SPP e BLE)
- ✅ Detecção automática de leitores mesmo sem driver serial
- ✅ Leitura contínua de tags RFID
- ✅ Decodificação do EPC para extrair barcode e PO
- ✅ **Integração com PostgreSQL** - Busca SKU completo na mesma view do gerador
- ✅ Exibição de SKU/VPM a nível de variant (cor + tamanho)
- ✅ Histórico de leituras
- ✅ Interface moderna e intuitiva

## 🚀 Instalação

1. **Instalar dependências:**

```bash
cd rfid-reader-app
npm install
```

2. **Executar o aplicativo:**

```bash
npm start
```

Para executar em modo desenvolvimento (com DevTools):

```bash
npm run dev
```

## 🔧 Configuração

### Conectar ao Leitor RFID

1. Conecte seu leitor RFID ao computador via USB
2. Abra o aplicativo
3. Clique em **"🔄 Detectar"** para encontrar leitores disponíveis
4. Selecione o leitor na lista (aparecerá em: Portas Seriais, HID ou USB Direto)
5. Configure a velocidade (Baud Rate) se for porta serial
6. Clique em "Conectar"

**O app detecta automaticamente leitores mesmo quando o Windows não os reconhece!**

📖 **Para leitores Bluetooth**: Veja `CONFIGURACAO_BLUETOOTH.md`  
📖 **Para conexão direta geral**: Veja `README_CONEXAO_DIRETA.md`

### Protocolo do Leitor

O aplicativo suporta leitores RFID que enviam dados via serial. O formato esperado é:

- **EPC hexadecimal**: `E20034120001140000000000`
- **Formato com prefixo**: `TAG: E20034120001140000000000` ou `EPC: E20034120001140000000000`
- **Formato decimal**: 24 dígitos numéricos (formato ZebraDesigner)

Se seu leitor usar um formato diferente, você pode ajustar o método `processRFIDData()` no arquivo `rfid-reader.js`.

### Decodificação do EPC

O aplicativo decodifica o EPC no formato **ZebraDesigner** (mesmo do gerador):
- **Barcode** (12 dígitos) - Primeiros 12 caracteres
- **PO Number** (4 dígitos) - Próximos 4 caracteres  
- **Sequencial** - Restante

**Exemplo**: `197416145132046412345678`
- Barcode: `197416145132`
- PO: `0464`

### Integração com PostgreSQL (Recomendado)

Para buscar o **SKU completo (VPM) a nível de variant** diretamente do banco:

1. **Configure o banco** em `config.js`:
   ```javascript
   database: {
     enabled: true,
     host: 'localhost',
     port: 5432,
     database: 'seu_banco',
     user: 'seu_usuario',
     password: 'sua_senha'
   }
   ```

2. O app buscará automaticamente na view `senda.vw_labels_variants_barcode` (mesma do gerador)

3. **Veja guia completo**: `README_INTEGRACAO.md` ou `CONFIGURACAO_BANCO.md`

**O app funciona sem banco também!** Apenas mostra barcode e PO se não configurar.

## 📦 Build para Distribuição

Para criar um executável Windows:

```bash
npm run build:win
```

O executável será gerado na pasta `dist/`.

## 🛠️ Personalização

### Ajustar Comandos do Leitor

Se seu leitor RFID precisar de comandos específicos para iniciar a leitura, edite o método `startReading()` em `rfid-reader.js`:

```javascript
async startReading() {
  // Enviar comando específico do seu leitor
  this.port.write('SEU_COMANDO_AQUI\r', (error) => {
    if (error) {
      console.error('Erro ao enviar comando:', error);
    }
  });
}
```

### Integrar com Banco de Dados

Para buscar o SKU completo do banco de dados:

1. Edite `renderer.js`
2. Descomente a função `lookupSKU()`
3. Configure a URL da sua API:

```javascript
async function lookupSKU(data) {
  try {
    const response = await fetch(`http://localhost:3002/api/rfid/lookup/${data.barcode}`);
    if (response.ok) {
      const skuData = await response.json();
      data.sku = skuData.vpm || skuData.sku;
      data.variant = `${skuData.color} - ${skuData.size}`;
      updateUI();
    }
  } catch (error) {
    console.error('Erro ao buscar SKU:', error);
  }
}
```

## 📝 Estrutura do Projeto

```
rfid-reader-app/
├── main.js           # Processo principal do Electron
├── preload.js        # Bridge entre main e renderer
├── rfid-reader.js    # Classe para comunicação com leitor RFID
├── index.html        # Interface HTML
├── styles.css        # Estilos CSS
├── renderer.js       # Lógica da interface
├── package.json      # Dependências e scripts
└── README.md         # Este arquivo
```

## 🔍 Troubleshooting

### Leitor não aparece na lista de portas

- Verifique se o leitor está conectado via USB
- Verifique se os drivers estão instalados
- Clique em "🔄 Atualizar" para recarregar a lista
- No Windows, verifique o Gerenciador de Dispositivos

### Não consegue conectar

- Verifique se a porta não está sendo usada por outro aplicativo
- Verifique se a velocidade (Baud Rate) está correta
- Teste outras velocidades comuns: 9600, 19200, 38400, 115200

### Não lê tags RFID

- Verifique se o leitor está ligado
- Verifique se as tags estão próximas ao leitor
- Verifique se o formato dos dados está correto
- Ajuste o método `processRFIDData()` se necessário

### SKU não aparece

- O EPC pode não estar no formato esperado
- Verifique se a decodificação está correta
- Configure a integração com banco de dados para buscar SKU completo

## 📄 Licença

MIT

## 🤝 Suporte

Para dúvidas ou problemas, verifique:
- O console do aplicativo (F12 ou DevTools)
- Os logs no terminal onde o app está rodando

