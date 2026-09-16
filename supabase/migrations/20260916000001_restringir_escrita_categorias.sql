-- categorias e uma tabela de taxonomia/config (6 linhas fixas via seed),
-- nao conteudo — so admin deve poder criar/editar/apagar categoria.
-- criador_conteudo continua podendo vincular categorias EXISTENTES a um
-- artigo via artigo_categorias (policy own, nao mexida aqui), mas nao
-- deve conseguir apagar a categoria em si — combinado com o "on delete
-- cascade" de artigo_categorias.categoria_id, isso apagaria os vinculos
-- daquela categoria em todo artigo do sistema, sem nenhuma tela que
-- precise dessa capacidade.
drop policy "categorias_admin_write" on public.categorias;

create policy "categorias_admin_write" on public.categorias
  for all using (is_admin()) with check (is_admin());
