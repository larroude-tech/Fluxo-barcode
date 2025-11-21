# Módulo de Geração de QR Code Personalizado

Este módulo permite gerar QR Codes personalizados com logo no centro, seguindo o estilo de referência: **QR com "buraco" no meio e logo centralizada**.

## 📋 Funcionalidades

- ✅ Gera QR Code em PNG com alto nível de correção de erro
- ✅ Cria automaticamente espaço em branco no centro do QR Code
- ✅ Insere logo centralizado (configurável, padrão: 20% do QR Code)
- ✅ Mantém legibilidade do QR Code mesmo com logo
- ✅ Código modularizado e bem comentado

## 📦 Dependências

```bash
npm install qrcode sharp
```

## 🚀 Uso Básico

### Exemplo 1: Uso Simples

```javascript
const { generateQRWithLogoDefault } = require('./generateQRWithLogo');

// Gerar QR Code com logo usando caminhos padrão
await generateQRWithLogoDefault('https://www.example.com', null, {
  size: 500,
  logoSizePercent: 20,
  errorCorrectionLevel: 'H'
});
// Salva em: backend/image_qrcode/qr_final.png
```

### Exemplo 2: Uso Customizado

```javascript
const { generateQRWithLogo } = require('./generateQRWithLogo');
const path = require('path');

await generateQRWithLogo(
  'L106-LEER-9.5-BLAC-1556',  // Dados do QR Code
  path.join(__dirname, 'qr_final.png'),  // Caminho de saída
  path.join(__dirname, 'L_logo.png'),  // Caminho do logo
  {
    size: 500,              // Tamanho do QR Code em pixels
    logoSizePercent: 20,    // Tamanho do logo (20% do QR Code)
    margin: 4,              // Margem do QR Code
    errorCorrectionLevel: 'H'  // Alto nível de correção
  }
);
```

## ⚙️ Opções de Configuração

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `size` | number | 500 | Tamanho do QR Code em pixels |
| `logoSizePercent` | number | 20 | Tamanho do logo em % do QR Code |
| `margin` | number | 4 | Margem do QR Code em módulos |
| `errorCorrectionLevel` | string | 'H' | Nível de correção: 'L', 'M', 'Q', 'H' |

## 📝 Funções Disponíveis

### `generateQRWithLogo(data, outputPath, logoPath, options)`

Gera QR Code personalizado com logo.

**Parâmetros:**
- `data` (string): Dados a serem codificados (texto ou URL)
- `outputPath` (string): Caminho onde salvar o arquivo final
- `logoPath` (string): Caminho para o arquivo de logo
- `options` (object): Opções de configuração

**Retorna:** Promise<string> - Caminho do arquivo gerado

### `generateQRWithLogoDefault(data, outputPath, options)`

Versão simplificada que usa caminhos padrão.

**Parâmetros:**
- `data` (string): Dados a serem codificados
- `outputPath` (string, opcional): Caminho de saída (padrão: `qr_final.png`)
- `options` (object, opcional): Opções de configuração

**Retorna:** Promise<string> - Caminho do arquivo gerado

## 🎯 Características

### Alto Nível de Correção de Erro

O módulo usa nível de correção **'H'** (High), que permite até **30% de dano/corrupção** no QR Code. Isso garante que o QR Code continue legível mesmo com o logo no centro.

### Espaço em Branco Automático

O módulo cria automaticamente um espaço em branco no centro do QR Code antes de inserir o logo. Isso garante que o logo apareça claramente.

### Logo Proporcional

O logo é redimensionado para 20% do tamanho do QR Code (configurável), mantendo a proporção original.

## 📁 Estrutura de Arquivos

```
backend/image_qrcode/
├── generateQRWithLogo.js  # Módulo principal
├── example.js              # Exemplos de uso
├── README.md               # Esta documentação
├── L_logo.png             # Logo padrão
└── qr_final.png           # QR Code gerado (após execução)
```

## 🔧 Executar Teste

```bash
# Executar o módulo diretamente (faz um teste)
node backend/image_qrcode/generateQRWithLogo.js

# Executar exemplos
node backend/image_qrcode/example.js
```

## 📌 Notas Importantes

1. **Biblioteca utilizada:** `qrcode` (recomendada e amplamente usada)
2. **Processamento de imagem:** `sharp` (alta performance)
3. **Formato de saída:** PNG
4. **Nível de correção:** H (High) - permite até 30% de dano
5. **Tamanho do logo:** 20% do QR Code (configurável)

## 🎨 Estilo de Referência

O módulo gera QR Codes no estilo:
- ✅ QR Code com "buraco" (espaço branco) no meio
- ✅ Logo centralizada no espaço branco
- ✅ QR Code mantém legibilidade
- ✅ Visual limpo e profissional

