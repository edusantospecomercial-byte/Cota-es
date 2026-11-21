# Calibração de 11/11/2026

## Inventário

- 1.763 PDFs auditados no acervo local indexado.
- 918 arquivos candidatos pelo nome.
- 400 illustrations únicos após deduplicação SHA-256.
- 518 cópias exatas removidas.
- 13 duplicatas lógicas removidas.
- 211 documentos únicos encontrados fora da pasta histórica original.

## Controles de qualidade

- 207 registros completos e consistentes aprovados até 16/11/2026.
- 187 registros ambíguos encaminhados para revisão e excluídos do cálculo.
- Nomes, datas de nascimento e caminhos dos clientes não são publicados no modelo.

## Modelos publicados

| Família | Casos | Validação | Decisão |
|---|---:|---|---|
| Vida | 116 | Erro mediano de 10,7% em validação cruzada agrupada; 62,1% dentro de +/-20% | Recalibrado em 16/11/2026 |
| Vida + CI Standard/Core | 43 | Erro mediano anterior de 10,2% | Modelo anterior preservado |
| Vida + CI Enhanced | 60 | Erro mediano anterior de 22,7% | Modelo anterior preservado |

Os modelos de doenças graves não foram substituídos porque a extração ampliada piorou a precisão fora da amostra. Os novos documentos continuam no inventário de revisão para classificação manual futura.

Em 16/11/2026, foi incorporado um illustration Zurich de vida com idade 63, prazo de 22 anos, capital de £30.000 e prêmio mensal de £29,03. O valor anterior estimado era £25,46, uma diferença de £3,57 ou aproximadamente 12,3%.

## Calibração oficial de 18/11/2026

- 76 preços de provedores coletados diretamente no Solution Builder.
- Perfil-piloto: mulher de 35 anos, cobertura até 65 anos, prêmio garantido e level.
- Oito combinações: fumante e não fumante, com £20.000, £30.000, £50.000 e £100.000 de vida.
- O motor usa o menor prêmio oficial disponível como âncora exata somente nessas oito combinações.
- Antes da incorporação, nenhuma das oito estimativas ficava dentro de ±20% do preço oficial e o erro percentual absoluto médio era 216,4%.
- Depois da incorporação, as oito âncoras reproduzem o preço oficial com erro de 0%.

Isso mede ajuste nos próprios pontos de calibração, não precisão para outras idades, prazos ou capitais. A validação fora da amostra continua dependente da bateria planejada de 25 a 63 anos.

## Bateria do perfil A de 18/11/2026

- 173 novos preços oficiais coletados no Solution Builder sem underwriting.
- 12 cenários padronizados: 50 anos, mulher, não fumante, vida de £20.000, £30.000, £50.000 e £100.000, até 65, 70 e 75 anos.
- Prêmio garantido, level, low-start permitido, sem waiver, TPD, fracture cover ou doença grave.
- Antes da calibração, o erro percentual absoluto médio nesses 12 cenários era 69,8%; apenas 2 de 12 ficavam dentro de ±20%.
- Após a incorporação, os 12 pontos oficiais são reproduzidos com erro de 0%; 12 de 12 ficam dentro de ±20%.
- Duas cotações históricas com waiver e uma com doença grave foram auditadas, mas excluídas do modelo de vida puro para evitar contaminação.

Os mínimos oficiais da bateria estão preservados em `data/solutionbuilder-profile-a-minimos-2026-11-18.csv`.

## Extensão estratégica de 19/11/2026

- 90 novos preços oficiais coletados no Solution Builder, distribuídos por seis cenários com 15 provedores cada.
- Perfil-piloto preservado: 50 anos, mulher, não fumante, prêmio garantido, level, low-start permitido e sem coberturas adicionais.
- Novos capitais: £150.000 e £200.000, com cobertura até 65, 70 e 75 anos.
- Menores prêmios oficiais: £11,33 e £14,30 até 65; £12,06 e £15,51 até 70; £13,08 e £16,67 até 75.
- Os seis mínimos foram incorporados como âncoras exatas; a coleta não clicou em Apply e não submeteu proposta.

Os mínimos oficiais desta extensão estão preservados em `data/solutionbuilder-profile-a-minimos-2026-11-19.csv`.

## Política de coleta vigente — 20/11/2026

- Provedores prioritários: **Zurich, Legal & General e Aviva**.
- A prioridade é determinada pelo provedor, não pelo menor prêmio do mercado.
- Em cada execução, abrir a lista completa de resultados e registrar separadamente o preço de cada provedor prioritário disponível.
- Guardar também o produto, capital, prazo, condição de fumante, estrutura de cobertura e opcionais que afetem o prêmio.
- Não usar automaticamente o `Quick Quote Solution` quando ele pertencer a outro provedor.
- Não clicar em `Apply`, não criar recomendação e não submeter proposta durante a coleta.
- Resultados de outros provedores podem permanecer como evidência histórica, mas não entram nas próximas âncoras prioritárias.
- A migração do modelo publicado será feita somente depois de uma validação comparativa, evitando reduzir a precisão atual antes de existir cobertura suficiente das três seguradoras.

## Uso correto

A calculadora fornece uma estimativa indicativa, sem underwriting. Peso, altura, profissão e histórico médico podem alterar a cotação oficial. Sempre confirme o valor final no SolutionBuilder e na seguradora.

## Consolidação prioritária de 20/11/2026

- 1.164 preços oficiais completos de Zurich, Legal & General e Aviva, distribuídos por 388 execuções comparáveis. A consolidação inclui 870 preços recuperados de 290 relatórios oficiais de comparação, cada um com referência e SHA-256 do PDF de origem; a cotação mais recente prevalece quando duas execuções ocupam a mesma âncora.
- 74 cenários adicionais foram preservados como lacunas e excluídos da calibração completa porque a Legal & General não retornou preço; 62 deles foram recuperados do arquivo de relatórios e acrescentam 124 preços oficiais parciais de Zurich e Aviva.
- Em 33 combinações únicas de vida pura, a interface pode mostrar os valores oficiais exatos de Zurich e Aviva e identifica a Legal & General como indisponível; nenhum preço ausente é interpolado. Quando existe também uma execução completa, prevalece a evidência mais recente.
- Lacunas com doenças graves não reutilizam preços parciais, pois podem envolver TPD ou estruturas de cobertura diferentes.
- 43 illustrations recentes possuem validação explícita por SHA-256, com reconciliação entre prêmio-base, opcionais e total. A base inclui combinações de vida + doenças graves e âncoras de vida pura de Zurich, Legal & General e Aviva, com capital auditado de até £500k e prazo até 85 anos. O prazo aceita idade atual ou idade no próximo aniversário, conforme a convenção registrada pela seguradora.
- Todos os cenários incompletos permanecem fora do conjunto oficial de 1.164 preços e passam por validação contra duplicidade e prêmio inválido.

## Expansão do arquivo local — 21/11/2026

- 487 registros de validação histórica foram reconciliados a partir de 387 PDFs oficiais únicos.
- A varredura recuperou illustrations de Zurich, Legal & General e Aviva tanto das pastas de downloads quanto de pastas genéricas de clientes.
- Novas âncoras exatas foram incorporadas apenas quando produto, fumante, idade, capital e prazo eram comparáveis ao modelo publicado.
- Uma nova auditoria local por SHA-256 identificou seis illustrations Zurich de vida pura ainda não catalogados. Três chaves inéditas foram adicionadas para 65 anos até 80 (£20k por £18,16; £25k por £22,06; £50k por £40,60). Um cenário de 43 anos até 70 com £150k foi preservado como evidência por £19,04, sem substituir a âncora competitiva já existente de £18,40. Dois documentos logicamente equivalentes de £50k por £41,34 foram mantidos como evidência documental, sem duplicar a decisão de preço.
- A mesma auditoria recuperou um illustration Aviva com duas proteções aos 54 anos até 70: vida £20k por £7,17 (£7,10 base + waiver) e vida + Core CI £10k por £14,33 (£14,07 base + TPD/waiver). As evidências foram incorporadas sem elevar os lookups competitivos já existentes de £7,10 e £14,00.
- O último candidato comparável recuperado foi um Zurich de 65 anos, não fumante, vida £120k por 20 anos até 85, com prêmio garantido de £121,60 e sem opcionais. A reconciliação de £29.184 em 240 meses confirmou o valor, que entrou como chave exata inédita.
- A varredura final comparou 977 caminhos de PDF por SHA-256. Depois da incorporação, nenhum illustration comparável de Zurich, Legal & General ou Aviva para vida/CI Standard permaneceu fora do catálogo. Os 75 hashes restantes foram mantidos separados por produto: 61 Enhanced/Child, 12 Income Protection, 1 Royal London e 1 documento de outra família.
- Uma nova verificação incremental dos 53 PDFs modificados nos dois dias seguintes encontrou 39 hashes únicos, dos quais 29 ainda não estavam no catálogo. Eles eram relatórios comparativos, resumos de apólice, documentos médicos ou materiais de produto, não novos illustrations comparáveis. Os relatórios Standard/Core confirmaram os preços já recuperados do histórico aos 34 e 38 anos; os relatórios de vida aos 46 anos já correspondiam a chaves exatas existentes. Cenários com opcionais incompatíveis foram deliberadamente excluídos para não contaminar a malha padrão.
- A extração dos 436 relatórios comparativos encontrados em Desktop, Downloads e Documents classificou 37 documentos como incompatíveis com a malha principal: 23 eram CI isolada, 10 eram Income Protection e 3 usavam prazo/produto incompatível; um arquivo adicional não tinha referência utilizável. Três relatórios com cenário legível continham somente Royal London Enhanced e nenhum preço de Zurich, Legal & General ou Aviva. Esses documentos permanecem auditados, mas não entram na calibração de vida + CI Standard/Core. Entre os arquivos, 23 eram cópias de 17 referências já presentes; três referências possuíam hashes diferentes, porém a mesma data, cenário e preços. O extrator agora resolve essas cópias de forma determinística por qualidade, data e hash, impedindo variação conforme a ordem das pastas.
- Valores de vida pura foram separados dos opcionais; descontos multiproduto foram identificados quando o prêmio total era inferior ao prêmio bruto mostrado no detalhamento.
- Doenças graves Enhanced, Enhanced Plus, Upgraded e Child não foram misturadas com Standard/Core.
- A cobertura por chave chegou a 100% dos 325 registros históricos comparáveis de vida pura e dos 136 registros de vida + CI Standard/Core. O validador agora impede publicação se uma combinação conhecida deixar de ter lookup direto. Como uma chave pode refletir o mínimo calibrado entre várias cotações comparáveis, isso mede retenção de cenários, não reprodução literal de cada PDF, precisão fora da amostra ou garantia de underwriting.
- O alinhamento de preço foi auditado em 219 chaves únicas de vida e 77 de vida + CI Standard/Core, excluindo produtos multipolicy/discounted. Nenhum lookup pode superar em mais de 20% o menor prêmio-base histórico comparável; valores menores continuam válidos quando sustentados por uma âncora oficial mais competitiva do SolutionBuilder.
- Uma validação cruzada leave-one-anchor-out conseguiu reconstruir 612 preços da malha prioritária usando somente os pontos vizinhos. A interpolação linear por capital e logarítmica por idade e prazo produziu MAPE de 2,99% e 100% dos pontos dentro de ±20%. O erro mediano foi 2,19%, o percentil 90 foi 6,76%, o percentil 95 foi 8,77% e o máximo foi 19,35%. O viés médio assinado foi -0,16%, com 52,45% de subestimativas e 46,90% de superestimativas, portanto sem desvio direcional material. Agora existem holdouts para vida e CI Standard/Core, fumantes e não fumantes. O MAPE final por seguradora foi 3,32% para Legal & General, 2,49% para Zurich e 3,15% para Aviva.
- Em 147 âncoras oficiais repetidas em datas diferentes, mantendo sexo, idade, tabagismo, prazo e capitais, a variação absoluta média entre a primeira e a última execução foi 1,74%; 97,28% ficaram dentro de ±10% e todas dentro de ±20%. A seleção da cotação mais recente e o validador de estabilidade temporal reduzem o risco de uma tarifa antiga prevalecer sobre uma nova.
- Como o formulário não pergunta sexo, foi medida a sensibilidade dessa simplificação em 69 pares oficiais com os demais parâmetros iguais. A diferença simétrica média foi 2,70%, o máximo observado 9,36% e 100% ficaram dentro de 10%. Em 23 pares por seguradora, a diferença média foi 3,90% na Legal & General, 2,03% na Zurich e 2,17% na Aviva; os máximos foram 9,36%, 6,46% e 7,69%, respectivamente. Além dos limites conjuntos, cada seguradora precisa manter ao menos 15 pares, média até 6%, máximo até 15% e pelo menos 90% dos casos dentro de 10%. Esse controle reforça que o resultado é estimativa inicial, não preço individual garantido.
- Por segmento, vida para não fumantes possui 378 pontos testáveis (3,35% MAPE; P95 9,41%), vida para fumantes 21 (3,34%; P95 8,21%), não fumante + CI Standard/Core 192 (2,27%; P95 6,63%) e fumante + CI 21 (2,70%; P95 5,64%); todos ficaram dentro de ±20%. Os dois segmentos de fumantes continuam identificados como amostra limitada enquanto tiverem menos de 30 pontos testáveis.
- O controle automatizado reprova a publicação se essa bateria cair abaixo de 90 pontos testáveis, ultrapassar 13% de MAPE ou tiver menos de 80% dos pontos dentro de ±20%.
- Esses números medem interpolação dentro da malha oficial disponível; não medem underwriting médico, ocupacional ou extrapolação fora das combinações observadas.
- Na grade estratégica de idades 25–63, capitais de £20k–£200k e idades finais 65/70/75/85, a malha completa das três seguradoras cobre por interpolação 42,74% dos cenários de vida para não fumantes, 18,70% de não fumante + CI £10k, 4,70% de não fumante + CI £20k, 6,84% de vida para fumantes, 4,27% de fumante + CI £10k e 0,11% de fumante + CI £20k. Por isso, as próximas coletas continuam concentradas em fumantes e CI, especialmente CI £20k, sem repetir a região já densa de vida não fumante.
- O relatório pode ser reproduzido com `node calculadora/scripts/report-priority-coverage.mjs`.
- A próxima fila operacional contém 37 cenários de alto ganho em `data/next-priority-collection-2026-11-21.csv`: 12 de vida para fumantes, 14 de fumante + CI e 11 de não fumante + CI. Quatro apoios e dois centros de fumante + CI, além de sete pontos intermediários de CI não fumante, foram escolhidos para criar os primeiros holdouts testáveis; os quatro cenários de extensão até 60 anos permanecem depois deles. Cada cenário deve registrar Legal & General, Zurich e Aviva, totalizando até 111 preços novos sem clicar em `Apply`.
- Se os 111 preços forem obtidos, a cobertura interpolável projetada da grade estratégica sobe de 6,84% para 11,22% em vida fumante; de 4,27% para 9,83% em fumante + CI £10k; de 0,11% para 6,84% em fumante + CI £20k; de 18,70% para 21,26% em CI £10k não fumante; e de 4,70% para 7,26% em CI £20k não fumante. O validador da fila preserva esses ganhos e exige 63/297/60 holdouts testáveis nos segmentos vida fumante, CI não fumante e CI fumante.
- A calculadora não reutiliza o modelo combinado para publicar CI isolada. Enquanto não existir uma família própria calibrada, essa combinação exige cotação oficial no SolutionBuilder.

# Atualização de 19/11/2026 — bateria fumante

- Perfil de teste: mulher, 35 anos, fumante, prêmio garantido, capital nivelado e sem coberturas adicionais.
- 20 cenários oficiais adicionados, cobrindo idades finais 65, 70, 75 e 85 e capitais de £20.000 a £200.000.
- 1.164 preços prioritários oficiais revisados, incluindo 870 recuperados diretamente dos relatórios comparativos do Solution Builder.
- O catálogo consolidado passou a ter 2.049 preços oficiais e 217 âncoras mínimas exatas, mantendo separadas as 1.164 observações prioritárias completas das três seguradoras.
- Nenhuma proposta foi aplicada ou submetida; os resultados continuam sendo estimativas não subscritas.
