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

## Bateria Amaro de 18/11/2026

- 173 novos preços oficiais coletados no Solution Builder sem underwriting.
- 12 cenários padronizados: 50 anos, mulher, não fumante, vida de £20.000, £30.000, £50.000 e £100.000, até 65, 70 e 75 anos.
- Prêmio garantido, level, low-start permitido, sem waiver, TPD, fracture cover ou doença grave.
- Antes da calibração, o erro percentual absoluto médio nesses 12 cenários era 69,8%; apenas 2 de 12 ficavam dentro de ±20%.
- Após a incorporação, os 12 pontos oficiais são reproduzidos com erro de 0%; 12 de 12 ficam dentro de ±20%.
- Duas cotações históricas com waiver e uma com doença grave foram auditadas, mas excluídas do modelo de vida puro para evitar contaminação.

Os mínimos oficiais da bateria estão preservados em `data/solutionbuilder-amaro-minimos-2026-11-18.csv`.

## Extensão estratégica de 19/11/2026

- 90 novos preços oficiais coletados no Solution Builder, distribuídos por seis cenários com 15 provedores cada.
- Perfil-piloto preservado: 50 anos, mulher, não fumante, prêmio garantido, level, low-start permitido e sem coberturas adicionais.
- Novos capitais: £150.000 e £200.000, com cobertura até 65, 70 e 75 anos.
- Menores prêmios oficiais: £11,33 e £14,30 até 65; £12,06 e £15,51 até 70; £13,08 e £16,67 até 75.
- Os seis mínimos foram incorporados como âncoras exatas; a coleta não clicou em Apply e não submeteu proposta.

Os mínimos oficiais desta extensão estão preservados em `data/solutionbuilder-amaro-minimos-2026-11-19.csv`.

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

- 288 preços oficiais completos de Zurich, Legal & General e Aviva, distribuídos por 96 cenários comparáveis; quatro dos novos cenários são de fumante aos 35 anos.
- 12 cenários adicionais foram preservados como lacunas e excluídos da calibração completa porque a Legal & General não retornou preço.
- Em 8 lacunas de vida pura, a interface pode mostrar os valores oficiais exatos de Zurich e Aviva e identifica a Legal & General como indisponível; nenhum preço ausente é interpolado.
- Lacunas com doenças graves não reutilizam preços parciais, pois podem envolver TPD ou estruturas de cobertura diferentes.
- 37 illustrations recentes possuem validação explícita por SHA-256, com reconciliação entre prêmio-base, opcionais e total. A base inclui combinações de vida + doenças graves e âncoras de vida pura de Zurich, Legal & General e Aviva, agora com capital auditado de até £500k. O prazo aceita idade atual ou idade no próximo aniversário, conforme a convenção registrada pela seguradora.
- Todos os cenários incompletos permanecem fora do conjunto oficial de 288 preços e passam por validação contra duplicidade e prêmio inválido.

# Atualização de 19/11/2026 — bateria fumante

- Perfil de teste: mulher, 35 anos, fumante, prêmio garantido, capital nivelado e sem coberturas adicionais.
- 20 cenários oficiais adicionados, cobrindo idades finais 65, 70, 75 e 85 e capitais de £20.000 a £200.000.
- 294 preços de produtos/seguradoras revisados no Solution Builder.
- A base passou a ter 633 preços oficiais e 46 âncoras mínimas exatas.
- Nenhuma proposta foi aplicada ou submetida; os resultados continuam sendo estimativas não subscritas.
