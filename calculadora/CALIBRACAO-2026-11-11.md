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

## Uso correto

A calculadora fornece uma estimativa indicativa, sem underwriting. Peso, altura, profissão e histórico médico podem alterar a cotação oficial. Sempre confirme o valor final no SolutionBuilder e na seguradora.
