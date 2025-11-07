# Scripts do Sistema

Esta pasta contém scripts de inicialização e utilitários do sistema.

## Scripts Disponíveis

### iniciar_sistema.bat
Inicia o sistema completo (backend + frontend) em janelas separadas.

**Uso:**
- Duplo clique no arquivo ou execute: `scripts\iniciar_sistema.bat`
- O script navega automaticamente para a raiz do projeto antes de iniciar os serviços

### limpar_porta_3002.bat
Limpa a porta 3002 (backend) encerrando processos que estão usando ela.

**Uso:**
- Execute quando precisar liberar a porta 3002
- Útil quando o backend não inicia devido à porta ocupada

## Notas Importantes

- Todos os scripts usam caminhos relativos à raiz do projeto
- Os scripts funcionam independente de onde são executados (usando `%~dp0` para localizar o diretório do script)
- Certifique-se de que o Node.js está instalado e no PATH do sistema

## Estrutura de Caminhos

Os scripts assumem a seguinte estrutura:
```
Larroudé-RFID/
├── backend/          # Servidor Node.js
├── frontend/         # Aplicação React
└── scripts/          # Scripts de inicialização
```
