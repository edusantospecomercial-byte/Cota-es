# Calculadora Seguro UK

Estimador indicativo, non-underwritten, calibrado com illustrations históricos anonimizados.

- 1.763 PDFs auditados em todo o acervo local indexado
- 918 arquivos candidatos a illustration/cotação
- 400 illustrations únicos após deduplicação por SHA-256
- 202 registros completos, consistentes e aprovados
- 185 documentos ambíguos isolados para revisão, sem participar dos preços
- 211 illustrations únicos adicionais encontrados fora da pasta histórica original
- Vida: 111 casos, erro mediano de 11,1% em validação cruzada agrupada; 63,1% das previsões dentro de ±20% (baixa confiança por variação entre seguradoras e 6 violações monotônicas locais)
- Vida + CI Standard/Core: 43 casos, erro mediano de 10,2%
- Vida + CI Enhanced: 60 casos, erro mediano de 22,7% (baixa confiança)

Atualização de 11/11/2026: o modelo de Vida foi recalibrado com todos os registros novos que passaram nos controles. Os modelos de CI anteriores foram preservados porque a inclusão automática dos novos documentos piorou a precisão fora da amostra; esses casos permanecem disponíveis para revisão e futura classificação manual.

A calculadora sempre retorna uma estimativa. Fora das faixas validadas ela usa extrapolação, amplia o intervalo e sinaliza baixa confiança. Os valores não constituem cotação ou garantia de aceitação. Confirme sempre o resultado final no SolutionBuilder e com a seguradora.

Os dados preenchidos não são enviados a servidor. As simulações salvas ficam no `localStorage` do navegador utilizado.
