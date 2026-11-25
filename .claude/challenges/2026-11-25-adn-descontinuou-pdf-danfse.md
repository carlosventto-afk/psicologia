# PDF da NFS-e: o ADN deixou de entregar o DANFSe (e o layout foi "adivinhado")

**Achado em:** 2026-11-25, ao investigar o erro "documento ainda não está disponível no portal nacional" no download da nota 34.

**Sintoma:** `GET https://adn.nfse.gov.br/danfse/{chave}` respondia 503 em todas as tentativas. Tratei como oscilação do governo e montei uma busca automática do PDF (PR #14) em cima disso.

**Causa real:** desde 03/08/2026 (Nota Técnica 008/2026) o governo descontinuou o serviço público que entregava o PDF. O emissor recebe só o XML e precisa desenhar o DANFSe. Quem descobriu foi o usuário, que trouxe o texto oficial; o código antigo (`fetch_danfse_pdf`) escondia a falha (4 tentativas, sem log de status).

**O que foi feito:** `nfse-service/nfse_core/danfse.py` gera o PDF a partir do XML (PR #15) e, depois, replica o layout oficial v2.0 com as medidas **lidas do PDF oficial** (ver abaixo).

**Lições (evitar repetir):**
- Antes de construir retentativa/automação sobre uma API externa que "oscila", confirmar na documentação oficial que ela ainda existe. Falha constante (nunca um 200) não é oscilação.
- Para igualar um layout oficial, **medir o PDF de referência** em vez de comparar a olho: `pymupdf` + o content stream (PDFsharp escreve cada texto, linha e retângulo em coordenadas absolutas). A primeira versão "parecida" tinha margens, linhas e fontes diferentes; a segunda, com as medidas, bate em 152 de 153 textos. Decodificar o QR do PDF oficial (`cv2.QRCodeDetector`) revelou o link real de consulta (sem a barra que eu tinha suposto).
- `NotaFiscal.pdf_base64` é **cache** de algo derivável do XML. Ao mudar o layout ele ficava velho (a nota 34 continuou com o layout antigo até eu regerar na mão). Solução permanente: o download desenha o PDF na hora (`/danfse` no `nfse-service`) e o guardado virou só reserva. Regra geral: não guardar como fonte da verdade o que se deriva de outro dado e muda com o código.

**Ferramentas úteis (fora do repositório):** `pymupdf` para render/geometria e `opencv-python-headless` para ler QR — instalados só no `.venv` do `nfse-service`, não em `requirements.txt`.
