# Estrutura de Pastas - QR Codes Personalizados

## 📁 Estrutura

```
backend/image_qrcode/
├── Generator/              # Arquivos usados para gerar QR codes
│   ├── L_logo.png          # Logo usado nos QR codes
│   ├── generateQRWithLogo.js  # Módulo de geração
│   ├── example.js          # Exemplos de uso
│   └── README.md           # Documentação
│
└── Generated/              # QR codes gerados (cache)
    └── {referencia}/       # Pasta por referência (ex: VPN)
        ├── qrcode_200.png  # QR code tamanho 200
        ├── qrcode_225.png  # QR code tamanho 225
        └── ...
```

## 🔄 Sistema de Cache

O sistema funciona da seguinte forma:

1. **Primeira geração**: Quando um QR code é solicitado para uma referência (ex: VPN), ele é gerado e salvo em `Generated/{referencia}/qrcode_{tamanho}.png`

2. **Próximas gerações**: Se o QR code já existe para aquela referência e tamanho, ele é carregado do cache (não precisa gerar novamente)

3. **Organização**: Cada referência tem sua própria pasta, facilitando a organização e consulta

## 📝 Exemplo de Uso

```javascript
// Gerar QR code com cache por referência
const qrBuffer = await generateQRCodeWithLogo(
  'L106-LEER-9.5-BLAC-1556',  // Dados do QR code
  200,                          // Tamanho
  null,                         // Logo path (usa padrão)
  true,                         // Salvar arquivo
  'L106-LEER-9.5-BLAC-1556'    // Referência (VPN) - usado para cache
);

// Na próxima vez que chamar com a mesma referência e tamanho,
// o QR code será carregado do cache automaticamente
```

## 🎯 Benefícios

- ✅ **Performance**: QR codes não precisam ser gerados toda vez
- ✅ **Organização**: QR codes organizados por referência
- ✅ **Eficiência**: Reduz processamento e tempo de resposta
- ✅ **Manutenção**: Fácil localizar e gerenciar QR codes gerados

