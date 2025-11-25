# 📡 RFID Reader App - Leitor de RFID Desktop

## ⚠️ IMPORTANTE: App Completamente Independente

Este aplicativo é **100% independente** e não depende de nenhuma outra pasta do projeto. Você pode:

- ✅ Copiar para qualquer lugar
- ✅ Mover entre projetos
- ✅ Usar em outro computador
- ✅ Funcionar sem conexão com backend

## 🚀 Como Usar

1. **Instalar dependências:**
```bash
npm install
```

2. **Executar:**
```bash
npm start
```

3. **Conectar ao leitor RFID:**
   - Conecte o leitor via USB
   - Selecione a porta na lista
   - Clique em "Conectar"
   - Clique em "Iniciar Leitura"

## 📋 O Que Este App Faz

- ✅ Lê tags RFID via porta serial/USB
- ✅ Decodifica o EPC para extrair barcode e PO
- ✅ Exibe informações na tela
- ✅ Mantém histórico de leituras
- ✅ Interface moderna e fácil de usar

## 🔧 Configuração Opcional

Edite `config.js` para:
- Ajustar velocidade do leitor
- Configurar comandos específicos
- Habilitar busca de SKU via API (opcional)

## 📦 Build

Para criar executável Windows:
```bash
npm run build:win
```

## 📁 Estrutura

```
rfid-reader-app/
├── main.js          # Electron main process
├── preload.js       # Bridge
├── rfid-reader.js   # Comunicação RFID
├── config.js        # Configurações
├── index.html       # Interface
├── styles.css       # Estilos
├── renderer.js      # Lógica UI
└── package.json     # Dependências
```

**Tudo em uma pasta! Nada depende de fora!**

## ❓ Dúvidas?

Veja `README.md` para documentação completa ou `INSTALACAO.md` para instruções detalhadas.

