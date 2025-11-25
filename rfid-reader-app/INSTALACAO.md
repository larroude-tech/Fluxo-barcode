# 📦 Instalação e Configuração - RFID Reader App

Este aplicativo é **completamente independente** e pode ser movido entre projetos sem problemas.

## 🚀 Instalação Rápida

1. **Navegue até a pasta do app:**
```bash
cd rfid-reader-app
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Execute o aplicativo:**
```bash
npm start
```

Pronto! O app está funcionando de forma independente.

## 📁 Estrutura do Projeto

```
rfid-reader-app/
├── main.js              # Processo principal Electron
├── preload.js           # Bridge de segurança
├── rfid-reader.js       # Classe de comunicação RFID
├── config.js            # Configurações (EDITÁVEL)
├── index.html           # Interface HTML
├── styles.css           # Estilos CSS
├── renderer.js          # Lógica da interface
├── package.json         # Dependências (NÃO DEPENDE DE OUTRAS PASTAS)
└── README.md            # Documentação completa
```

## ⚙️ Configuração (Opcional)

Edite o arquivo `config.js` para personalizar:

- **Velocidade padrão** do leitor (Baud Rate)
- **Comandos do leitor** RFID
- **URL da API** para buscar SKU (opcional)
- **Intervalos de leitura**
- **Tema e idioma**

### Exemplo de Configuração

```javascript
// config.js
module.exports = {
  defaultBaudRate: 9600,
  readInterval: 100,
  duplicateTimeout: 500,
  
  // OPÇÃO 1: Busca de SKU desabilitada (padrão)
  apiUrl: null,
  
  // OPÇÃO 2: Buscar SKU de uma API externa
  // apiUrl: 'http://localhost:3002/api/rfid/lookup',
  
  readerCommands: {
    start: 'R\r',  // Ajustar conforme seu leitor
    stop: 'S\r'
  }
};
```

## 🔌 Conectar ao Leitor RFID

1. Conecte o leitor RFID via USB
2. No app, selecione a porta serial
3. Configure a velocidade (Baud Rate)
4. Clique em "Conectar"

## 📦 Build para Distribuição

Para criar um executável Windows:

```bash
npm run build:win
```

O executável será gerado em `dist/` e **pode ser copiado para qualquer lugar**.

## ✅ Dependências

O app usa apenas:
- **Electron** - Framework desktop
- **serialport** - Comunicação serial com leitor RFID
- **@serialport/parser-readline** - Parser de dados serial

**Nenhuma dependência de outras pastas do projeto!**

## 🔄 Mover Entre Projetos

Para mover este app para outro projeto ou computador:

1. Copie a pasta inteira `rfid-reader-app/`
2. Execute `npm install` na nova localização
3. Pronto! Funciona imediatamente

## 💡 Integração Opcional com Backend

Se você quiser buscar SKU completo de um backend:

1. **Configure a URL da API** em `config.js`:
```javascript
apiUrl: 'http://localhost:3002/api/rfid/lookup'
```

2. **Crie um endpoint no seu backend** que retorne:
```json
{
  "sku": "L458-JASM-11.0-SILV-1885",
  "vpm": "L458-JASM-11.0-SILV-1885",
  "color": "SILVER",
  "size": "11.0",
  "variant": "SILVER - 11.0"
}
```

3. **Descomente o código** em `renderer.js` na função `lookupSKU()`

**Mas isso é opcional!** O app funciona perfeitamente sem integração.

## 🆘 Troubleshooting

### Erro: "Cannot find module"
- Execute `npm install` novamente

### Leitor não aparece na lista
- Verifique se está conectado via USB
- Clique em "🔄 Atualizar"
- Verifique o Gerenciador de Dispositivos (Windows)

### Não lê tags
- Verifique se o leitor está ligado
- Ajuste os comandos em `config.js`
- Verifique o formato dos dados recebidos

## 📝 Notas Importantes

- ✅ **Totalmente independente** - Não depende de outras pastas
- ✅ **Configurável** - Ajuste via `config.js`
- ✅ **Portável** - Pode ser movido facilmente
- ✅ **Opcional** - Busca de SKU é opcional, não obrigatória

