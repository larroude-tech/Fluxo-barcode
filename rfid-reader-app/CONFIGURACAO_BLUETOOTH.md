# 📶 Configuração Bluetooth para Leitor RFID

Seu leitor RFID é Bluetooth! Este guia explica como conectar.

## 🎯 Tipos de Bluetooth Suportados

O app suporta **2 tipos** de conexão Bluetooth:

1. **Bluetooth Serial (SPP)** - Conexão como porta serial via Bluetooth
2. **Bluetooth BLE** - Bluetooth Low Energy

## 📦 Instalação de Dependências

Para suportar Bluetooth, instale as dependências:

```bash
npm install
```

Isso instalará:
- `bluetooth-serial-port` - Para Bluetooth Serial (SPP)
- `@abandonware/noble` - Para Bluetooth BLE

## 🔌 Como Conectar

### Método 1: Bluetooth Serial (Recomendado)

1. **Pareie o leitor** com o Windows primeiro:
   - Abra **Configurações** → **Dispositivos** → **Bluetooth**
   - Ligue o leitor RFID
   - Clique em "Adicionar Bluetooth ou outro dispositivo"
   - Selecione o leitor quando aparecer
   - Aguarde o pareamento

2. **No app**:
   - Clique em **"🔄 Detectar"**
   - O leitor aparecerá em **"📶 Bluetooth Serial (SPP)"**
   - Selecione e clique em **"Conectar"**

### Método 2: Bluetooth BLE

1. **Ligue o leitor RFID**
2. **No app**:
   - Clique em **"🔄 Detectar"**
   - Selecione **"📱 Buscar Bluetooth (BLE)..."**
   - Aguarde alguns segundos enquanto o app busca
   - Selecione o leitor encontrado
   - Clique em **"Conectar"**

## ⚙️ Configuração

### Habilitar Bluetooth no Windows

1. Verifique se o Bluetooth está **ligado**
2. Verifique se o leitor está **ligado** e **visível**
3. Certifique-se de que o leitor está **pareado** (para Serial)

### Permissões

No Windows, o app precisa de permissão para acessar Bluetooth. Se pedir, aceite.

## 🔍 Troubleshooting

### "Nenhum dispositivo Bluetooth encontrado"

**Solução:**
1. Verifique se o Bluetooth está ligado no Windows
2. Verifique se o leitor está ligado
3. Para Serial: verifique se está pareado
4. Tente buscar novamente

### "Erro ao conectar Bluetooth Serial"

**Solução:**
1. Despareie e pareie novamente o leitor
2. Reinicie o leitor
3. Verifique se outro app não está usando o leitor
4. Tente desconectar de outros dispositivos

### "Bluetooth não está habilitado"

**Solução:**
1. Ligue o Bluetooth no Windows
2. Aguarde alguns segundos
3. Tente novamente

### Leitor não aparece na lista

**Solução:**
1. Verifique se o nome do leitor contém "RFID", "reader" ou "scanner"
2. Se não, edite `rfid-reader-direct.js` para incluir seu leitor
3. Tente buscar manualmente via BLE

## 📋 Requisitos

- **Windows 10/11** com Bluetooth habilitado
- **Leitor RFID Bluetooth** ligado e visível
- **Dependências instaladas**: `npm install`

## ✅ Verificação

Para verificar se está funcionando:

1. Conecte via Bluetooth
2. Aproxime uma tag RFID
3. O app deve ler e exibir os dados!

## 🎯 Dicas

- **Bluetooth Serial** é mais confiável para leitores RFID
- Se o leitor já está pareado, use Bluetooth Serial
- Se o leitor é BLE puro, use a busca BLE
- Mantenha o leitor próximo durante a conexão inicial

## 📞 Suporte

Se ainda não funcionar:
1. Verifique os logs no console (F12)
2. Verifique se o leitor funciona com outro app
3. Teste o pareamento manual primeiro
4. Tente ambos os métodos (Serial e BLE)

