# Runbook de coleta — ConcertHub / Solution Builder

Objetivo: preencher `data/next-priority-collection-2026-11-21.csv` com preços oficiais indicativos de **Legal & General, Zurich e Aviva**, sem aplicar, recomendar ou submeter proposta.

Registrar cada resultado em `data/next-priority-results-2026-11-21.csv`. O arquivo já contém as 111 linhas esperadas, em ordem de cenário e seguradora, para impedir troca de preço entre perfis.

## Caminho de acesso

1. Entrar no Portal Openwork e abrir o aplicativo **ConcertHub** pelo atalho oficial.
2. Abrir o perfil de calibração autorizado já existente. Não usar cliente real novo.
3. No registro, revisar as abas **Client**, **KYC**, **Protection** e **Property** somente quando necessário para atualizar idade/fumante.
4. Abrir a aba **Quotes**.
5. Clicar em **Source Quotes**. Esse é o caminho correto para o Solution Builder; não usar atalhos externos ou uma aba independente do Unipass.

## Perfil e parâmetros padronizados

- Sexo: manter o perfil de calibração feminino usado pela malha atual.
- Idade e fumante: usar exatamente os valores da fila. Ajustar a data de nascimento no ConcertHub e confirmar a idade exibida no Solution Builder antes de cotar.
- Premium type: **Guaranteed**.
- Exclude low start plans: **No**.
- Term/To age: usar **To age** da fila.
- Life cover amount: usar o capital da fila.
- Critical illness cover amount: usar o valor da fila; `0` significa não selecionar CI.
- Life or earlier CI: não selecionar.
- Total permanent disability: **None**, salvo quando o produto retornar TPD obrigatório; nesse caso registrar a composição nas notas.
- Waiver of premium: **No**, salvo quando obrigatório/embutido; registrar nas notas.
- Fracture cover: **No**.
- Indexation: **Level**.

## Captura dos três provedores

1. Salvar o benefício e abrir a lista completa de resultados.
2. Procurar separadamente **Legal & General**, **Zurich** e **Aviva**, mesmo quando não forem os três menores preços.
3. Para cada um, registrar:
   - `model_id` do cenário;
   - idade, fumante, idade final, vida e CI;
   - nome exato do provedor e produto;
   - prêmio mensal exibido;
   - opcionais ou estrutura obrigatória que afete o prêmio;
   - indisponibilidade e motivo, quando houver.
4. Não substituir um provedor ausente por outra seguradora e não inventar preço.
5. Não misturar Standard/Core com Enhanced, Enhanced Plus, Upgraded ou Child CI.
6. No arquivo de resultados:
   - disponível: preencher `product`, `monthly_premium`, `source_model_id`, `available=true` e `status=captured`;
   - indisponível: preencher `available=false`, `status=unavailable` e explicar em `notes`; não preencher prêmio.

## Limites de segurança

- Nunca clicar em **Apply**.
- Nunca criar recomendação, suitability, submissão ou proposta.
- Nunca aceitar produto em nome de cliente.
- Não alterar dados de cliente real; trabalhar apenas no perfil de calibração autorizado.
- Não publicar nome, data de nascimento, endereço, caminho local ou referência pessoal nos CSVs públicos.

## Ordem da bateria

Executar em ordem crescente de `priority` no arquivo `data/next-priority-collection-2026-11-21.csv`.

- 1–12: vida para fumantes; abre malha de idade, prazo e capital.
- 13–20: fumante + CI; cria a primeira malha Core CI para fumantes.
- 21–24: apoios da malha fumante + CI aos 45 anos; fecham os extremos de prazo necessários para validar os centros.
- 25–26: centros da malha fumante + CI; criam os primeiros holdouts desse segmento.
- 27–33: pontos intermediários de CI não fumante; escolhidos para produzir os primeiros holdouts de validação.
- 34–37: extensão de CI não fumante até 60 anos.

Os 37 cenários podem produzir até 111 preços oficiais.

A ordem também é parte do controle de qualidade: os quatro primeiros cenários já devem elevar a cobertura de vida fumante; até o cenário 24, as duas faixas de CI fumante devem abrir 63 combinações cada; os cenários 25–26 criam os primeiros holdouts desse segmento; e até o cenário 33 devem existir 21 holdouts de CI não fumante. O validador rejeita uma reordenação que perca esses marcos.

## Validação antes de publicar

1. Preservar os dados novos em CSV com uma linha por provedor e cenário.
2. Manter cenários incompletos em arquivo de lacunas, fora da malha completa.
3. Executar:

```bash
node calculadora/scripts/validate-collection-capture-template.mjs
node calculadora/scripts/validate-collection-queue.mjs
node calculadora/scripts/prepare-captured-priority-import.mjs
node calculadora/scripts/validate-all.mjs
```

`prepare-captured-priority-import.mjs` é somente-leitura. Ele informa quantos cenários estão completos. Com `--csv`, imprime apenas cenários com Legal & General, Zurich e Aviva capturadas, produtos e prêmios válidos e o mesmo `model_id`; não altera nenhum arquivo.

4. Conferir a nova validação cruzada por segmento. Não atribuir MAPE de vida a CI.
5. Só publicar se todos os validadores passarem e nenhuma âncora histórica deixar de ter lookup direto.
