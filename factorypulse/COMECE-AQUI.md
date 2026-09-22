# FactoryPulse — Como colocar para rodar

Ferramenta interna de monitoramento de produção. Roda num computador da fábrica e é acessada pelos tablets/PCs pela rede local (Wi-Fi). Os dados ficam salvos de verdade, num arquivo no próprio computador.

São 3 passos, sem necessidade de conhecimento técnico.

---

## Passo 1 — Instalar o Node.js (só uma vez)

O Node.js é o programa que faz o sistema funcionar.

1. Acesse **nodejs.org**
2. Baixe a versão **LTS** (o botão da esquerda)
3. Instale clicando "avançar" em tudo (aceite o padrão)

Para conferir que instalou: abra o **Prompt de Comando** (aperte a tecla Windows, digite `cmd`, Enter) e digite:
```
node --version
```
Se aparecer um número (ex: `v22.x.x`), está pronto.

---

## Passo 2 — Preparar o sistema (só uma vez)

1. Copie a pasta **factorypulse** para o computador da fábrica que vai ficar ligado (ex: para a Área de Trabalho).
2. Abra o Prompt de Comando dentro dessa pasta. Jeito fácil: abra a pasta no Explorador de Arquivos, clique na barra de endereço lá em cima, apague o que estiver escrito, digite `cmd` e aperte Enter.
3. Digite este comando e aperte Enter:
```
npm install
```
Deve terminar em segundos, com uma mensagem tipo "up to date" ou "found 0 vulnerabilities". Este sistema **não depende de nada externo** — usa só o próprio Node.js — então esse passo é rápido e não costuma dar erro. (Se quiser, pode até pular direto para o Passo 3; o `npm start` funciona mesmo sem o `npm install`.)

---

## Passo 3 — Ligar o sistema

Ainda no Prompt de Comando, dentro da pasta, digite:
```
npm start
```

Vai aparecer uma mensagem assim:
```
========================================
  FactoryPulse está no ar!
========================================
  Neste computador:  http://localhost:3000
  Nos tablets/PCs:   http://192.168.0.15:3000
========================================
```

- **Neste computador:** abra `http://localhost:3000` no navegador deste PC.
- **Nos tablets e outros PCs da fábrica:** abra o endereço que aparecer em "Nos tablets/PCs" (o número muda em cada rede). Todos precisam estar no **mesmo Wi-Fi/rede** da fábrica.

Pronto — o sistema está rodando.

> **Para desligar:** feche a janela preta do Prompt de Comando (ou aperte `Ctrl + C` nela).
> **Para religar:** repita só o Passo 3 (`npm start`).

---

## Como usar

- **Dashboard** — todas as máquinas em cards, com status colorido, a **OF (ordem de fabricação)** atual e o **atingimento da meta** (produzido ÷ meta da OF).
- **Apontar produção** — botão no card. O operador digita, no fim do turno, quantas peças fez **naquele turno**; o sistema soma ao total da OF. Não é automático, é lançamento manual.
- **Encerrar OF** — botão no card. Fecha a OF atual (vai para o Histórico), zera a produção e abre uma OF nova (você informa o novo número, produto e meta). Use quando terminar uma ordem e começar outra.
- **Mudar status** — o menu suspenso em cada card muda a máquina entre Produzindo, Setup, Parada, Manutenção, Sem operador. Se houver uma parada em aberto, é preciso usar **Finalizar parada** primeiro.
- **Registrar parada** — botão no card. Escolha o motivo; o sistema cronometra até você clicar em **Finalizar parada**.
- **Timeline** — histórico de eventos de cada máquina no dia.
- **Pareto** — mostra quais motivos mais tomam tempo (calculado a partir das paradas reais).
- **Histórico OF** — todas as ordens de fabricação já encerradas, com quanto foi produzido e o atingimento da meta de cada uma.
- **Relatórios** — escolha um dia e veja **o que foi apontado naquele dia** por máquina, todas as paradas e o Pareto do dia. Botões **Baixar PDF** e **Baixar Excel** geram o arquivo na hora.
- **Modo TV** — tela cheia com cards grandes e números grandes, feita para um monitor/TV na fábrica. Atualiza sozinha a cada 5 segundos. Deixe essa aba aberta no telão. Para voltar ao normal, clique em "Sair do Modo TV".
- **Máquinas** — cadastre as máquinas de verdade da fábrica. **Desativar** tira a máquina do painel, mas mantém todo o histórico dela nos relatórios.

> **Observação sobre PDF e Excel:** o computador precisa estar com internet para gerar esses arquivos (eles usam uma biblioteca que carrega da web). O resto do sistema funciona sem internet.

---

## Onde ficam os dados

Tudo é salvo no arquivo **dados.json**, dentro da pasta. É todo o seu banco de dados.
- Para **backup**: copie esse arquivo para um pen drive ou nuvem de vez em quando.
- Se apagar esse arquivo, o sistema recomeça do zero (recria as máquinas de exemplo).
- Para uma **demonstração** com 7 dias de dados fictícios já preenchidos, rode `npm run demo` antes do `npm start`.

---

## Perguntas comuns

**Precisa de internet para funcionar?**
O sistema em si roda 100% na rede local, sem internet — dashboard, paradas, timeline, modo TV. A única parte que usa internet é gerar os relatórios em PDF/Excel (na aba Relatórios). Se o PC servidor não tiver internet, tudo funciona menos essa exportação.

**Qual versão do Node.js usar?**
Qualquer versão recente serve (16, 18, 20, 22, 24...). Este sistema não compila nada e não é sensível à versão, então não precisa se preocupar com isso.

**O computador precisa ficar ligado?**
Sim. Enquanto ele estiver ligado com o `npm start` rodando, os tablets acessam. Se desligar, ninguém acessa até religar.

**Dá para acessar de casa / fora da fábrica?**
Não nesta versão — é de propósito, por segurança (rede interna só). Acesso externo exigiria configuração de nuvem, que é outro projeto.

**Os tablets não acham o endereço.**
Confira que estão no mesmo Wi-Fi do computador servidor e que digitaram o endereço "Nos tablets/PCs" exatamente como apareceu (incluindo `:3000`).

---

## Aviso de proteção de dados (LGPD)

O sistema registra o nome de operadores associado a paradas de máquina. Isso é dado pessoal e pode ser lido como avaliação de desempenho. Para uso interno formal, vale:
- Avisar os operadores de que o registro existe e para quê serve (finalidade);
- Definir por quanto tempo os dados são guardados;
- Restringir quem acessa os relatórios.

Como o registro de operador é opcional no sistema, você pode inclusive rodá-lo só com status de máquina, sem nomes, se preferir.
