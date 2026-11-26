# Fontes hospedadas

Arquivos do subconjunto `latin` das fontes variáveis, baixados do Google Fonts em 2026-11-25
(Sora v17, Inter v20). Usados por `web/lib/fontes.js` nas páginas `/comparativo` e `/comece`.

| Arquivo | Fonte | Direitos autorais | Licença |
| --- | --- | --- | --- |
| `sora-latin.woff2` | Sora (eixo de peso 400–800) | Copyright 2019 The Sora Project Authors (https://github.com/sora-xor/sora-font) | SIL Open Font License 1.1 — https://openfontlicense.org |
| `inter-latin.woff2` | Inter (eixo de peso 100–900) | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) | SIL Open Font License 1.1 — https://openfontlicense.org |

Fora desta pasta, `web/public/fontes/Sora-Bold.ttf` (Sora v17, peso 700, baixado do Google Fonts em
2026-11-26, mesma licença e mesmos direitos autorais da tabela acima) é usada só para desenhar os
cartões de compartilhamento (`web/lib/cartao-og.js`): o gerador de imagens do Next não lê `woff2`, e
`public/` é a pasta que o Dockerfile copia inteira para a imagem final.

A licença permite usar, copiar e redistribuir as fontes, inclusive em produtos comerciais, desde que
os avisos de direitos autorais acima acompanhem os arquivos e que as fontes não sejam vendidas
isoladamente.
