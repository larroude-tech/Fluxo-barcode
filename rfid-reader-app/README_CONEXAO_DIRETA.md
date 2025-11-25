# 🔌 Conexão Direta com Leitor RFID - Guia Rápido

O app agora se conecta **diretamente** ao leitor RFID, mesmo quando o Windows não o reconhece como porta serial.

## ✅ O Que Foi Implementado

1. **Detecção Automática** de leitores RFID via:
   - 📡 Portas Seriais (COM1, COM2, etc.)
   - 🖱️ Dispositivos HID (sem driver serial necessário)
   - 🔌 USB Direto (conexão nativa)

2. **Conexão Inteligente**: O app tenta todos os métodos automaticamente

3. **Interface Atualizada**: Mostra todos os leitores encontrados agrupados por tipo

## 🚀 Como Usar

1. **Conecte o leitor RFID** via USB

2. **Abra o app** e clique em **"🔄 Detectar"**

3. **Selecione o leitor** na lista (aparecerá em uma das categorias):
   - 📡 Portas Seriais
   - 🖱️ Dispositivos HID  
   - 🔌 USB Direto

4. **Clique em "Conectar"**

Pronto! O app conecta diretamente ao leitor.

## 🔧 Se Não Aparecer

### Opção 1: Instalar Dependências

```bash
npm install
```

Isso instalará `node-hid` e `usb` que são necessários para conexão direta.

### Opção 2: Adicionar Vendor ID Manualmente

Se seu leitor não aparece:

1. Abra o **Gerenciador de Dispositivos**
2. Encontre o leitor → **Propriedades** → **Detalhes** → **ID do Hardware**
3. Anote o Vendor ID (ex: `VID_0ACD`)
4. Edite `rfid-reader-direct.js` e adicione na lista `rfidVendors`

### Opção 3: Usar como Serial

Mesmo que não apareça, tente selecionar uma porta serial COM e conectar. Pode funcionar!

## 📋 Vantagens

✅ **Funciona sem driver serial** instalado  
✅ **Detecção automática** de múltiplos tipos  
✅ **Mais confiável** que apenas serial  
✅ **Suporta leitores modernos** que usam HID/USB nativo  

## 🎯 Resumo

O app agora é muito mais robusto e deve detectar seu leitor RFID mesmo quando o Windows não o reconhece. Basta clicar em "🔄 Detectar" e o app encontrará todos os leitores disponíveis!

