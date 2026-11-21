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

Situação em 21/11/2026: a base prioritária contém 1.161 preços oficiais completos em 387 execuções comparáveis, com Zurich, Legal & General e Aviva. Desses, 867 preços foram recuperados de 289 relatórios oficiais de comparação e mantêm referência e SHA-256 do PDF de origem. A seleção por âncora sempre prioriza a cotação mais recente, evitando que um relatório antigo substitua a bateria atual. Outros 74 cenários incompletos permanecem separados da interpolação; 62 vieram do arquivo de relatórios e acrescentam 124 preços oficiais parciais de Zurich e Aviva. Em 33 combinações únicas de vida pura, a interface pode mostrar esses valores exatos e marcar a Legal & General como indisponível, sem inventar o preço ausente. A base de validação histórica contém 487 registros reconciliados provenientes de 387 PDFs oficiais únicos. O arquivo cobre vida pura e vida + doenças graves Standard/Core, capitais de até £1m, idades de 20 a 65 anos e prazos até 85; produtos Enhanced permanecem separados para não contaminar o preço Standard.

Todos os 325 registros históricos comparáveis de vida pura e os 136 registros de vida + CI Standard/Core agora possuem uma chave direta no motor. O controle de publicação exige 100% dessa cobertura de combinações conhecidas. O valor da chave pode refletir o mínimo calibrado entre várias cotações comparáveis, portanto essa métrica não significa reprodução literal de cada PDF nem validação fora da amostra.

Um segundo controle compara o lookup direto com o menor prêmio-base não descontado encontrado no arquivo. Nenhuma das 219 combinações únicas de vida ou 77 de vida + CI Standard/Core pode ficar mais de 20% acima dessa referência histórica. Valores inferiores são permitidos quando existe uma âncora oficial mais competitiva do SolutionBuilder.

Validação de interpolação em 21/11/2026: ao retirar uma âncora oficial por vez e tentar reconstruí-la apenas pelas âncoras vizinhas, 609 preços puderam ser testados. A interpolação linear por capital e logarítmica por idade/prazo obteve erro percentual absoluto médio de 3,01%, com 100% dentro de ±20%. A amostra inclui 378 preços de vida para não fumantes (3,35% MAPE), 189 de não fumante + CI Standard/Core (2,33%), 21 de vida para fumantes (3,34%) e 21 de fumante + CI (2,70%). Por seguradora, o erro médio foi 3,34% na Legal & General, 2,52% na Zurich e 3,17% na Aviva. É uma validação interna da malha observada, não uma promessa de precisão para underwriting, perfis médicos ou extrapolações fora dessa malha.

Os dados preenchidos não são enviados a servidor. As simulações salvas ficam no `localStorage` do navegador utilizado.

Regra operacional de Eduardo: a tela abre com **MetLife MultiProtect · 1 Cota + Luxações — £13/mês**, discriminado como £11 Essencial + £2 Luxações. O usuário ainda pode alterar a quantidade de cotas, remover o complemento ou acrescentar Crianças; os valores MetLife nunca são interpolados.

Antes de publicar qualquer alteração na calculadora, execute `node calculadora/scripts/validate-all.mjs`. O comando verifica a sintaxe do aplicativo, a estrutura dos CSVs, as âncoras, os cenários prioritários, as lacunas conhecidas, as interpolações e a validação cruzada leave-one-anchor-out.
