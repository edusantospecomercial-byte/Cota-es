# Relatório da madrugada — 21/11/2026

## Estado publicado

- Site: `https://edusantospecomercial-byte.github.io/Cota-es/calculadora/`
- Preços oficiais prioritários completos: 1.173
- Preços oficiais prioritários parciais: 126
- Registros calibrados: 1.393
- Cenários oficiais completos: 391
- Seguradoras prioritárias: Legal & General, Zurich e Aviva
- MetLife: 1 cota com luxações permanece o padrão da interface

## Precisão verificada

- Leave-one-anchor-out: 615 testes, 2,99% MAPE, P95 de 8,76% e 100% dentro de ±20%.
- Holdout futuro de 01/10: 141 previsões, 3,94% MAPE, P95 de 10,30%, 99,29% dentro de ±20% e cobertura de 30,92% das âncoras posteriores.
- Quatro cortes futuros, de julho a outubro: MAPE entre 3,53% e 4,01%.
- Não fumante, vida: 96 testes futuros, 4,27% MAPE.
- Não fumante, vida + CI Standard/Core: 42 testes futuros, 3,44% MAPE.
- Fumante, vida: somente 3 testes futuros; a interface exibe amostra limitada.
- Fumante, vida + CI: nenhum teste futuro; a interface exibe amostra limitada.

## Controles adicionados

- Validação futura por seguradora e por segmento.
- Cobertura do holdout publicada separadamente do erro.
- Quatro holdouts cronológicos móveis para evitar seleção de um único período favorável.
- Validação por faixa de mensalidade e por faixa etária.
- Auditoria de origem, referência, data e hash dos reports oficiais.
- Bloqueio contra dados pessoais nos arquivos públicos.
- Hash de versão nos assets para impedir JavaScript antigo em cache.
- Verificação automática de que a documentação acompanha as métricas publicadas.

## Varredura da máquina

A auditoria integral encontrou 436 PDFs e 413 referências únicas. Nenhuma referência completa ou parcial elegível ficou fora dos CSVs publicados. O comando abaixo repete a verificação sem alterar dados:

```bash
node calculadora/scripts/audit-new-comparison-reports.mjs
```

O comando `node calculadora/scripts/audit-comparison-report-hashes.mjs` recalcula o inventário e confirma que cada referência e SHA-256 publicado ainda corresponde ao PDF de origem presente na máquina.

## Portal e próxima coleta

O ConcertHub chegou à etapa física de autenticação por Face ID, impressão digital, PIN ou chave de segurança. A aba foi preservada nessa tela. Sem a intervenção física não foi possível gerar novos reports oficiais durante este trecho.

A fila pronta contém 37 cenários, até 111 preços, começando pelos segmentos que mais aumentam a utilidade da calculadora: vida para fumantes e fumante + CI. Nenhuma proposta, recomendação ou aplicação foi criada ou enviada.

## Saúde operacional

O monitor consulta continuamente o GitHub Pages, a contagem publicada e a chegada de novos PDFs. Até o último registro deste relatório, o site permanecia HTTP 200, com 1.173 preços e nenhum PDF novo desde a meia-noite.

Uma bateria adicional de 20 requisições consecutivas ao GitHub Pages retornou HTTP 200 em todas elas, com média de 0,632 segundo e máximo de 0,674 segundo no momento do teste.

O comando `node calculadora/scripts/audit-live-calculator.mjs` compara a versão pública com a release local e falha se a versão do JavaScript, a quantidade de registros, os preços prioritários ou a amostra temporal divergirem. Ele também compara o SHA-256 de sete assets críticos — motor, calibração, catálogo e quatro CSVs oficiais — para detectar qualquer publicação parcial mesmo quando as contagens coincidem.

Os 26 validadores e as 35 verificações sintáticas continuam sendo executados localmente antes de cada publicação. A instalação de um workflow no GitHub exigiria um token com permissão `workflow`, que não foi ampliada durante esta execução.
