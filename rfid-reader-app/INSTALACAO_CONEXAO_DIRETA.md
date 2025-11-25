# 🔌 Conexão Direta com Leitor RFID

O app agora suporta **conexão direta** com leitores RFID, mesmo quando o Windows não os reconhece como porta serial padrão.

## 🎯 Métodos de Conexão Suportados

O app detecta e conecta automaticamente usando:

1. **Serial Port** - Portas seriais tradicionais (COM1, COM2, etc.)
2. **HID (Human Interface Device)** - Leitores que aparecem como dispositivos HID
3. **USB Direto** - Conexão direta via USB sem driver serial

## 📦 Instalação de Dependências

Para suportar todos os métodos, instale as dependências opcionais:

```bash
npm install
```

Isso instalará automaticamente:
- `node-hid` - Para leitores HID
- `usb` - Para conexão USB direta
- `serialport` - Para portas seriais (já instalado)

## 🔍 Como Funciona a Detecção

O app tenta detectar leitores RFID de **3 formas diferentes**:

### 1. Detecção Serial
- Lista todas as portas seriais disponíveis
- Aparecem como: `COM1`, `COM3`, etc.

### 2. Detecção HID
- Procura dispositivos HID com Vendor IDs comuns de leitores RFID
- Funciona mesmo sem driver serial instalado
- Aparece como: `RFID Reader (0x0acd:0x1234)`

### 3. Detecção USB Direta
- Conecta diretamente via protocolo USB
- Não precisa de porta serial virtual
- Funciona com drivers genéricos

## 🚀 Como Usar

1. **Conecte o leitor RFID** ao computador via USB

2. **Execute o app**:
   ```bash
   npm start
   ```

3. **Clique em "🔄 Atualizar"** para detectar dispositivos

4. **O app mostrará TODOS os leitores encontrados**:
   - Portas seriais (se disponíveis)
   - Dispositivos HID
   - Dispositivos USB direto

5. **Selecione o leitor** na lista e clique em "Conectar"

## 🔧 Se o Leitor Não Aparecer

### Opção 1: Verificar Vendor ID

1. Abra o **Gerenciador de Dispositivos** (Windows)
2. Encontre o leitor RFID
3. Veja as **Propriedades** → **Detalhes** → **ID do Hardware**
4. Anote o Vendor ID (ex: `VID_0ACD`)

5. Edite `rfid-reader-direct.js` e adicione o Vendor ID:
   ```javascript
   const rfidVendors = [
     0x0acd, // Feig Electronic
     0x0483, // STMicroelectronics
     0x1a86, // QinHeng Electronics
     0x04b4, // Cypress Semiconductor
     0x1234, // ← ADICIONE SEU VENDOR ID AQUI
   ];
   ```

### Opção 2: Forçar Conexão Manual

Se você souber o Vendor ID e Product ID:

1. Abra o console do app (F12)
2. Execute:
   ```javascript
   // Exemplo: conectar via HID manualmente
   const deviceId = 'hid:0x0acd:0x1234'; // Substitua pelos IDs corretos
   await window.rfidAPI.connect(deviceId);
   ```

### Opção 3: Usar Serial como Fallback

Mesmo que não apareça no Windows, tente:

1. Instalar drivers genéricos de porta serial
2. O app tentará conectar via serial mesmo assim

## 🔍 Debugging

Para ver o que o app está detectando:

1. Abra o console (F12 ou DevTools)
2. Veja os logs de detecção
3. Procure por mensagens como:
   - `[RFID] Detectando leitores...`
   - `[RFID] Dispositivos encontrados: X`

## 📝 Logs Esperados

Ao conectar, você verá:

```
✅ Conectado ao leitor RFID (Serial): COM3
// OU
✅ Conectado ao leitor RFID (HID): hid:0x0acd:0x1234
// OU
✅ Conectado ao leitor RFID (USB): usb:0x0acd:0x1234
```

## ⚠️ Problemas Comuns

### "node-hid não instalado"

**Solução**: 
```bash
npm install node-hid --build-from-source
```

Nota: No Windows, pode precisar de Python e Visual Studio Build Tools instalados.

### "usb não instalado"

**Solução**:
```bash
npm install usb
```

### Leitor não aparece em nenhum método

**Possíveis causas**:
1. Driver não instalado corretamente
2. Vendor ID não está na lista
3. Dispositivo não suporta os protocolos padrão

**Solução**:
1. Verifique o fabricante do leitor
2. Consulte a documentação do leitor
3. Adicione o Vendor ID manualmente no código

## 🎯 Vendor IDs Comuns

Alguns Vendor IDs comuns de leitores RFID:

- `0x0ACD` - Feig Electronic
- `0x0483` - STMicroelectronics  
- `0x1A86` - QinHeng Electronics
- `0x04B4` - Cypress Semiconductor
- `0x10C4` - Silicon Labs (CP210x)
- `0x0403` - FTDI (FT232)

Se o seu leitor não estiver na lista, adicione o Vendor ID ao código!

## ✅ Verificação

Para testar se está funcionando:

1. Conecte o leitor
2. Execute o app
3. Clique em "Atualizar"
4. O leitor deve aparecer na lista
5. Selecione e conecte
6. Aproxime uma tag RFID
7. O app deve ler e exibir os dados!

## 📞 Suporte

Se ainda não funcionar:
1. Verifique os logs no console (F12)
2. Verifique o Vendor ID do seu leitor
3. Tente adicionar manualmente ao código
4. Verifique se o leitor funciona com outro software

