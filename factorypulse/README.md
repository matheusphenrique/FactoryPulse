# FactoryPulse

Sistema de monitoramento de produção para chão de fábrica (MES simplificado), executado em rede local. Operadores registram produção por turno, paradas de máquina e mudanças de status; o sistema processa esses registros e gera indicadores, Pareto de perdas, histórico de ordens de fabricação e relatórios diários exportáveis em PDF e Excel.

> Projeto Integrador — sistema que **recebe** informações do chão de fábrica, **trata** essas informações segundo regras de negócio e **entrega** resultados para a tomada de decisão.

## Visão rápida

| Entrada (recebe) | Tratamento (processa) | Saída (entrega) |
|---|---|---|
| Apontamento de peças por turno | Soma ao total da OF; agrupa por dia no fuso local | Atingimento da meta por máquina e por OF |
| Registro de parada com motivo | Cronometra início/fim; impede paradas sobrepostas | Tempo parado por dia; Pareto de motivos |
| Mudança de status | Registra evento com data/hora | Linha do tempo do dia |
| Encerramento de OF | Arquiva a OF e abre a próxima | Histórico de OFs |
| Escolha de um dia | Filtra os registros daquele dia | Relatório em tela, PDF e Excel |

## Tecnologias

- **Back-end:** Node.js puro (módulos `http`, `fs`), sem dependências externas.
- **Front-end:** HTML, CSS e JavaScript em página única (SPA), consumindo a API REST.
- **Persistência:** arquivo JSON local com gravação atômica.
- **Exportação:** jsPDF, jsPDF-AutoTable e SheetJS (carregados via CDN no navegador).
- **Testes:** executor nativo do Node (`node:test`).

## Como executar

Requisito: Node.js 18 ou superior.

```bash
npm start            # inicia em http://localhost:3000
npm run demo         # (opcional) gera 7 dias de dados fictícios para demonstração
npm test             # executa os testes automatizados
```

Variáveis de ambiente opcionais: `PORT` (padrão 3000), `FP_DB` (caminho do arquivo de dados), `FP_TZ` (fuso horário, padrão `America/Sao_Paulo`).

O manual para o usuário final está em [COMECE-AQUI.md](COMECE-AQUI.md).

## Estrutura

```
factorypulse/
├── server.js              # camada HTTP: rotas e respostas JSON
├── src/
│   ├── regras.js          # regras de negócio (funções puras, testáveis)
│   ├── banco.js           # persistência em JSON (gravação atômica)
│   └── datas.js           # datas no fuso horário da fábrica
├── public/index.html      # interface (SPA)
├── scripts/dados-demo.js  # gerador de dados fictícios
├── test/                  # testes unitários e de integração
└── docs/                  # documentação técnica
```

## Documentação

A documentação técnica completa (requisitos, regras de negócio, arquitetura, API, modelo de dados, fluxo e testes) está em [docs/DOCUMENTACAO-TECNICA.md](docs/DOCUMENTACAO-TECNICA.md).

## Dados e privacidade

O arquivo `dados.json` não é versionado (ver `.gitignore`). Todos os dados de exemplo e de demonstração são fictícios.
