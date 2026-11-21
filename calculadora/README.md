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

A calculadora sempre retorna uma estimativa. Fora das faixas validadas ela usa extrapolação, amplia o intervalo e sinaliza baixa confiança. Os valores não constituem cotação ou garantia de aceitação. Confirme sempre o resultado final no SolutionBuilder e com a seguradora.

Quando a combinação possui lookup histórico direto, a faixa provável usa a margem percentual da família do modelo, em vez de reutilizar um resíduo absoluto maior que o próprio prêmio. Isso evita intervalos artificiais começando em £0 sem reduzir a margem ampliada aplicada a interpolações e extrapolações.

Situação em 21/11/2026: a base prioritária contém 288 preços oficiais completos em 96 cenários, incluindo os primeiros quatro cenários completos de fumante com Zurich, Legal & General e Aviva. Doze cenários incompletos são mantidos em um arquivo separado; oito lacunas de vida pura permitem exibir apenas os preços oficiais disponíveis de Zurich e Aviva, com a Legal & General marcada como indisponível. A base de validação histórica contém 478 registros reconciliados provenientes de 379 PDFs oficiais únicos. O arquivo cobre vida pura e vida + doenças graves Standard/Core, capitais de até £571k, idades de 20 a 64 anos e prazos até 84/85; produtos Enhanced permanecem separados para não contaminar o preço Standard.

Todos os 317 registros históricos comparáveis de vida pura e os 135 registros de vida + CI Standard/Core agora possuem uma chave direta no motor. O controle de publicação exige 100% dessa cobertura de combinações conhecidas. O valor da chave pode refletir o mínimo calibrado entre várias cotações comparáveis, portanto essa métrica não significa reprodução literal de cada PDF nem validação fora da amostra.

Um segundo controle compara o lookup direto com o menor prêmio-base não descontado encontrado no arquivo. Nenhuma das 215 combinações únicas de vida ou 77 de vida + CI Standard/Core pode ficar mais de 20% acima dessa referência histórica. Valores inferiores são permitidos quando existe uma âncora oficial mais competitiva do SolutionBuilder.

Validação de interpolação em 21/11/2026: ao retirar uma âncora oficial por vez e tentar reconstruí-la apenas pelas âncoras vizinhas, 177 preços prioritários puderam ser testados. A interpolação logarítmica por idade e prazo reduziu o erro percentual absoluto médio de 3,32% para 3,08%, e 100% ficaram dentro de ±20%. Por seguradora, o erro médio foi 3,77% na Legal & General, 1,74% na Zurich e 3,72% na Aviva. É uma validação interna da malha observada, não uma promessa de precisão para underwriting, perfis médicos ou extrapolações fora dessa malha.

Os dados preenchidos não são enviados a servidor. As simulações salvas ficam no `localStorage` do navegador utilizado.

Regra operacional de Eduardo: a tela abre com **MetLife MultiProtect · 1 Cota + Luxações — £13/mês**, discriminado como £11 Essencial + £2 Luxações. O usuário ainda pode alterar a quantidade de cotas, remover o complemento ou acrescentar Crianças; os valores MetLife nunca são interpolados.

Antes de publicar qualquer alteração na calculadora, execute `node calculadora/scripts/validate-all.mjs`. O comando verifica a sintaxe do aplicativo, a estrutura dos CSVs, as âncoras, os cenários prioritários, as lacunas conhecidas, as interpolações e a validação cruzada leave-one-anchor-out.
