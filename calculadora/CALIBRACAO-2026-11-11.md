# Calibração de 11/11/2026

## Inventário

- 1.763 PDFs auditados no acervo local indexado.
- 918 arquivos candidatos pelo nome.
- 400 illustrations únicos após deduplicação SHA-256.
- 518 cópias exatas removidas.
- 13 duplicatas lógicas removidas.
- 211 documentos únicos encontrados fora da pasta histórica original.

## Controles de qualidade

- 202 registros completos e consistentes aprovados.
- 185 registros ambíguos encaminhados para revisão e excluídos do cálculo.
- Nomes, datas de nascimento e caminhos dos clientes não são publicados no modelo.

## Modelos publicados

| Família | Casos | Validação | Decisão |
|---|---:|---|---|
| Vida | 111 | Erro mediano de 11,1% em validação cruzada agrupada; 63,1% dentro de +/-20% | Recalibrado |
| Vida + CI Standard/Core | 43 | Erro mediano anterior de 10,2% | Modelo anterior preservado |
| Vida + CI Enhanced | 60 | Erro mediano anterior de 22,7% | Modelo anterior preservado |

Os modelos de doenças graves não foram substituídos porque a extração ampliada piorou a precisão fora da amostra. Os novos documentos continuam no inventário de revisão para classificação manual futura.

## Uso correto

A calculadora fornece uma estimativa indicativa, sem underwriting. Peso, altura, profissão e histórico médico podem alterar a cotação oficial. Sempre confirme o valor final no SolutionBuilder e na seguradora.
