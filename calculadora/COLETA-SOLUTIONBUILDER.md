# Runbook de coleta — ConcertHub / Solution Builder

Objetivo: preencher `data/next-priority-collection-2026-11-21.csv` com preços oficiais indicativos de **Legal & General, Zurich e Aviva**, sem aplicar, recomendar ou submeter proposta.

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
- 21–27: pontos intermediários de CI não fumante; escolhidos para produzir os primeiros holdouts de validação.
- 28–31: extensão de CI não fumante até 60 anos.

Os 31 cenários podem produzir até 93 preços oficiais.

## Validação antes de publicar

1. Preservar os dados novos em CSV com uma linha por provedor e cenário.
2. Manter cenários incompletos em arquivo de lacunas, fora da malha completa.
3. Executar:

```bash
node calculadora/scripts/validate-all.mjs
```

4. Conferir a nova validação cruzada por segmento. Não atribuir MAPE de vida a CI.
5. Só publicar se todos os validadores passarem e nenhuma âncora histórica deixar de ter lookup direto.
