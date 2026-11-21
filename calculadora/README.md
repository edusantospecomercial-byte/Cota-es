# Calculadora Seguro UK

Estimador indicativo, non-underwritten, calibrado com illustrations históricos anonimizados.

Privacidade: nomes usados durante a coleta local não são publicados. Os CSVs públicos usam apenas `Archive Quote` ou `Calibration Profile`, e um validador bloqueia qualquer publicação que reintroduza nomes nos campos de perfil/origem.

- 1.763 PDFs auditados em todo o acervo local indexado
- 918 arquivos candidatos a illustration/cotação
- 400 illustrations únicos após deduplicação por SHA-256
- 207 registros completos, consistentes e aprovados
- 187 documentos ambíguos isolados para revisão, sem participar dos preços
- 211 illustrations únicos adicionais encontrados fora da pasta histórica original
- Vida: 116 casos, erro mediano de 10,7% em validação cruzada agrupada; 62,1% das previsões dentro de ±20% (baixa confiança por variação entre seguradoras e 6 violações monotônicas locais)
- Vida + CI Standard/Core: 43 casos, erro mediano de 10,2%
- Vida + CI Enhanced: 60 casos, erro mediano de 22,7% (baixa confiança)

Atualização de 11/11/2026: o modelo de Vida foi recalibrado com todos os registros novos que passaram nos controles. Os modelos de CI anteriores foram preservados porque a inclusão automática dos novos documentos piorou a precisão fora da amostra; esses casos permanecem disponíveis para revisão e futura classificação manual.

Atualização de 16/11/2026: incorporado o caso Zurich de 63 anos, não fumante, £30.000 de vida até os 85 anos por £29,03/mês. Esse perfil agora retorna o valor histórico exato.

## Prioridade de provedores a partir de 20/11/2026

As próximas coletas no Solution Builder devem priorizar **Zurich, Legal & General e Aviva**. O resultado mais barato do mercado deixa de ser o critério principal: os preços dessas três seguradoras devem ser registrados mesmo quando forem superiores ao `Quick Quote Solution` ou ao preço de outro provedor.

Para cada cenário, registrar separadamente o preço disponível de cada uma das três seguradoras, o nome do produto e as coberturas relevantes. Não substituir um preço ausente por produto de outra seguradora. Resultados de outros provedores podem ser guardados apenas para auditoria, mas não devem orientar as novas âncoras prioritárias.

A base histórica existente permanece publicada até que haja volume suficiente dessas três seguradoras para uma recalibração validada. Não remover ou reinterpretar retroativamente os registros antigos como se fossem preços de Zurich, Legal & General ou Aviva.

A calculadora retorna estimativa para vida e vida + CI Standard/Core quando existe uma família compatível. Fora das faixas validadas ela usa extrapolação, amplia o intervalo e sinaliza baixa confiança. CI isolada não reutiliza o modelo combinado e exige cotação oficial até existir uma família própria calibrada. Os valores não constituem cotação ou garantia de aceitação. Confirme sempre o resultado final no SolutionBuilder e com a seguradora.

Quando a combinação possui lookup histórico direto, a faixa provável usa a margem percentual da família do modelo, em vez de reutilizar um resíduo absoluto maior que o próprio prêmio. Isso evita intervalos artificiais começando em £0 sem reduzir a margem ampliada aplicada a interpolações e extrapolações.

Quando não existe uma malha interpolável com Zurich, Legal & General e Aviva para a combinação solicitada, a calculadora continua entregando a estimativa pedida, mas identifica explicitamente o resultado como “modelo histórico agregado”. Esse fallback não é apresentado como validação específica das três seguradoras prioritárias.

Os testes de publicação também exigem margem mínima de 35% para o modelo histórico agregado e para extrapolações. Quando o resíduo histórico da família é maior, ele prevalece: no cenário sentinela atual, a extrapolação recebeu margem de 68,54%. O aviso de extrapolação com margem ampliada é obrigatório na interface.

A coerência das curvas prioritárias é monitorada nas dimensões de capital, prazo, doenças graves e idade. Atualmente, 429 pares de capital, 204 de prazo e 162 de doenças graves não apresentam reversões materiais; aumentar qualquer uma dessas coberturas não pode reduzir o prêmio. Como os relatórios de idades diferentes podem vir de datas e ocupações distintas, pequenas reversões por idade são auditadas estatisticamente: atualmente são 21 em 627 pares adjacentes (3,35%), com queda máxima de 5,39%. A publicação falha se a taxa superar 5% ou se uma queda individual ultrapassar 6%.

A recência da malha também é bloqueante. Em relação à geração do catálogo, 78,26% dos 1.173 preços prioritários têm até 180 dias e 99,23% têm até 365 dias; o preço mais recente tem um dia e o mais antigo, 456 dias. A publicação exige pelo menos 98% dentro de um ano, alguma evidência dos sete dias anteriores e nenhuma evidência com mais de dezoito meses.

A dispersão entre as três seguradoras é validada em 339 âncoras demográficas únicas e completas. A diferença relativa entre o menor e o maior prêmio tem mediana de 12,37%, P90 de 23,13%, P95 de 26,83% e máximo de 52,56%; em libras, a mediana é £2,09, o P95 £8,97 e o máximo £46,48. O maior caso foi confirmado dentro de um único relatório oficial comparável. A publicação falha se o P95 ultrapassar 35% ou o máximo, 60%, limites destinados a detectar mistura de produto ou preço incompatível.

Situação em 21/11/2026: a base prioritária contém 1.173 preços oficiais completos em 391 execuções comparáveis, com Zurich, Legal & General e Aviva. Desses, 879 preços foram recuperados de 293 relatórios oficiais de comparação e mantêm referência e SHA-256 do PDF de origem. A seleção por âncora sempre prioriza a cotação mais recente, evitando que um relatório antigo substitua a bateria atual. Outros 75 cenários incompletos permanecem separados da interpolação; 63 vieram do arquivo de relatórios e acrescentam 126 preços oficiais parciais de Zurich e Aviva. Em 33 combinações únicas de vida pura, a interface pode mostrar esses valores exatos e marcar a Legal & General como indisponível, sem inventar o preço ausente. A base de validação histórica contém 487 registros reconciliados provenientes de 387 PDFs oficiais únicos. O arquivo cobre vida pura e vida + doenças graves Standard/Core, capitais de até £1m, idades de 20 a 65 anos e prazos até 85; produtos Enhanced permanecem separados para não contaminar o preço Standard.

A extração reconhece as duas formulações oficiais usadas nos relatórios para vida + CI (`critical illness cover` e `life or earlier critical illness cover` após um capital de vida separado), além de capitais formatados com separadores de milhar. A correção recuperou três trios oficiais completos e um cenário parcial; os demais relatórios de income protection, CI acelerada/isolada ou produto Enhanced continuam deliberadamente fora desta malha.

Cada preço prioritário completo também passa por uma barreira de procedência antes da publicação: referência numérica, data ISO, perfil permitido, sexo/fumante válidos, idade e prazo coerentes, capitais positivos, produto compatível com seguradora e tipo de cobertura, e exatamente um preço de cada seguradora por execução. Linhas recuperadas de PDF exigem referência do relatório e SHA-256; capturas diretas exigem uma nota de origem. A validação rejeita ainda a reutilização da mesma referência com parâmetros diferentes.

Todos os 325 registros históricos comparáveis de vida pura e os 136 registros de vida + CI Standard/Core agora possuem uma chave direta no motor. O controle de publicação exige 100% dessa cobertura de combinações conhecidas. O valor da chave pode refletir o mínimo calibrado entre várias cotações comparáveis, portanto essa métrica não significa reprodução literal de cada PDF nem validação fora da amostra.

Um segundo controle compara o lookup direto com o menor prêmio-base não descontado encontrado no arquivo. Nenhuma das 219 combinações únicas de vida ou 77 de vida + CI Standard/Core pode ficar mais de 20% acima dessa referência histórica. Valores inferiores são permitidos quando existe uma âncora oficial mais competitiva do SolutionBuilder.

Validação de interpolação em 21/11/2026: ao retirar uma âncora oficial por vez e tentar reconstruí-la apenas pelas âncoras vizinhas, 615 preços puderam ser testados. A interpolação linear por capital e logarítmica por idade/prazo obteve erro percentual absoluto médio de 2,99%, com 100% dentro de ±20%. O erro mediano foi 2,20%, 90% dos testes ficaram até 6,75%, 95% até 8,76% e o máximo observado foi 19,35%. O viés médio assinado foi -0,16%: 52,85% das reconstruções ficaram abaixo e 46,50% acima do preço retirado, sem tendência material de inflar ou reduzir a estimativa. A amostra inclui 378 preços de vida para não fumantes (3,35% MAPE), 195 de não fumante + CI Standard/Core (2,29%), 21 de vida para fumantes (3,34%) e 21 de fumante + CI (2,70%). Em 205 testes por seguradora, o erro médio/P95 foi 3,32%/9,17% na Legal & General, 2,49%/6,87% na Zurich e 3,15%/9,36% na Aviva; os vieses foram -0,12%, -0,10% e -0,26%. É uma validação interna da malha observada, não uma promessa de precisão para underwriting, perfis médicos ou extrapolações fora dessa malha.

Um holdout temporal mais conservador treina somente com âncoras anteriores a 01/10/2026 e tenta prever cotações posteriores, sempre removendo a combinação exata do treino. Das 456 âncoras posteriores, 141 puderam ser reconstruídas (cobertura de 30,92%): MAPE de 3,94%, mediana de 3,11%, P90 de 8,24%, P95 de 10,30%, 99,29% dentro de ±20% e erro máximo de 20,89%. O erro mede somente a parcela interpolável; a cobertura separada impede interpretá-lo como precisão universal. O viés assinado foi +1,48%: 32,62% ficaram abaixo e 67,38% acima do preço posterior, uma inclinação conservadora pequena. Foram 47 testes por seguradora: MAPE/P95/viés de 4,31%/10,74%/+2,56% na Legal & General, 3,38%/6,85%/+1,43% na Zurich e 4,12%/10,24%/+0,46% na Aviva. A publicação falha se o conjunto cair abaixo de 100 preços ou 25% de cobertura, exceder 8% de MAPE, 15% no P95, 25% no máximo, 5% de viés absoluto ou 98% dentro de ±20%; cada seguradora precisa manter ao menos 30 testes, MAPE até 10%, P95 até 20%, máximo até 30%, viés absoluto até 8% e 95% dentro de ±20%.

Por segmento, o holdout futuro contém 96 previsões de vida para não fumantes (4,27% MAPE), 42 de não fumante + CI Standard/Core (3,44%), somente 3 de vida para fumantes e nenhuma de fumante + CI. A interface usa o resultado futuro do próprio segmento quando existem pelo menos 30 testes; abaixo disso, informa explicitamente que a amostra temporal ainda é limitada. Portanto, a validação cruzada de fumantes é promissora, mas ainda não equivale a eficácia futura comprovada.

Para reduzir o risco de um único corte cronológico favorável, o mesmo teste também roda automaticamente com cortes em 01/07, 01/08, 01/09 e 01/10/2026. Os quatro MAPEs foram 3,53%, 4,01%, 3,55% e 3,94%; os P95 ficaram entre 8,93% e 10,30%, e todos mantiveram pelo menos 98,99% das previsões dentro de ±20%. A cobertura evoluiu de 15,35%–19,47% nos cortes mais antigos para 30,92% em outubro. Cada corte precisa preservar ao menos 90 previsões, 15% de cobertura, MAPE até 8%, P95 até 15%, 98% dentro de ±20%, máximo até 25% e viés absoluto até 5%.

Estabilidade temporal: 147 âncoras oficiais foram cotadas mais de uma vez em datas diferentes com o mesmo sexo, idade, tabagismo, prazo e capitais. Entre a primeira e a última execução, a variação absoluta média foi 1,74%; 97,28% ficaram dentro de ±10% e 100% dentro de ±20%. Em 49 repetições por seguradora, a mudança média foi 2,18% na Legal & General, 1,44% na Zurich e 1,60% na Aviva; todas ficaram dentro de ±20%. Além do limite conjunto, cada seguradora precisa manter ao menos 30 repetições, média até 6%, pelo menos 85% dentro de 10% e 95% dentro de 20%. O motor sempre utiliza a execução mais recente.

Sensibilidade ao sexo não informado: a interface mantém o formulário curto e não solicita sexo. Em 69 pares oficiais com os demais parâmetros iguais, a diferença simétrica média entre masculino e feminino foi 2,70%, o máximo observado foi 9,36% e todos ficaram dentro de 10%. Isso sustenta o uso como estimativa inicial, mas não transforma o resultado em cotação individual; um validador monitora esse limite.

Os dados preenchidos não são enviados a servidor. As simulações salvas ficam no `localStorage` do navegador utilizado.

Regra operacional de Eduardo: a tela abre com **MetLife MultiProtect · 1 Cota + Luxações — £13/mês**, discriminado como £11 Essencial + £2 Luxações. O usuário ainda pode alterar a quantidade de cotas, remover o complemento ou acrescentar Crianças; os valores MetLife nunca são interpolados.

Antes de publicar qualquer alteração na calculadora, execute `node calculadora/scripts/validate-all.mjs`. O comando verifica a sintaxe do aplicativo, a estrutura dos CSVs, as âncoras, os cenários prioritários, as lacunas conhecidas, as interpolações e a validação cruzada leave-one-anchor-out.
