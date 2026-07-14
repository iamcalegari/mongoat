---
status: complete
phase: 05-estabiliza-o-de-api-e-release-v1-0
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md]
started: 2026-07-14T14:35:00-03:00
updated: 2026-07-14T14:45:00-03:00
---

## Current Test

[testing complete]

## Tests

### 1. Barrel congelado sem APIs deprecated
expected: Database.defineModel e Model.create removidos do barrel público; new Model(...) é a única via de registro/gating
result: pass
source: automated
coverage_id: 05-01/D1

### 2. Diff alpha→1.1.0 documentado e versões reconciliadas
expected: Entrada BREAKING no CHANGELOG, seção 5 em MIGRATION.md/docs/migration.md, strings 1.1.0 reconciliadas em CHANGELOG/MIGRATION/docs/ROADMAP
result: pass
source: automated
coverage_id: 05-01/D2

### 3. Dry-run do bump 1.0.34-alpha → 1.1.0
expected: changeset version confirma o bump minor e é revertido; changeset consolidado criado
result: pass
source: automated
coverage_id: 05-03/D1

### 4. Pre-mode rc com bump via changesets
expected: package.json em 1.1.0-rc.0 via changeset version (não manual)
result: pass
source: automated
coverage_id: 05-03/D2

### 5. RC publicado no dist-tag rc com provenance
expected: npm view dist-tags → rc=1.1.0-rc.0; publish via release.yml gated (run 29141092073)
result: pass
source: automated
coverage_id: 05-03/D3

### 6. Smoke CJS+ESM contra o tarball do RC
expected: scripts/smoke-rc.mjs instala @rc e importa Database/Model nos dois formatos → PASS
result: pass
source: automated
coverage_id: 05-03/D4

### 7. Empacotamento validado (attw + publint)
expected: check:package verde na 1.1.0 (node10/node16-CJS/node16-ESM/bundler)
result: pass
source: automated
coverage_id: 05-03/D5

### 8. package.json em 1.1.0 estável
expected: pre-mode encerrado via changeset pre exit + version; version === 1.1.0
result: pass
source: automated
coverage_id: 05-04/D1

### 9. Página de política semver publicada
expected: docs/explanation/versioning.md no nav/sidebar, linkada pelo README, docs:build verde
result: pass
source: automated
coverage_id: 05-04/D2

### 10. Script de deprecação por versão exata
expected: DRY_RUN=1 imprime exatamente 34 comandos npm deprecate (nenhum range)
result: pass
source: automated
coverage_id: 05-05/D1

### 11. 1.1.0 em latest com provenance e aprovação humana
expected: dist-tags latest=1.1.0; atestação SLSA v1 no packument; tag git v1.1.0
result: pass
source: automated
coverage_id: 05-05/D2

### 12. 34 alphas deprecadas, estáveis intocadas
expected: Varredura completa do packument: 34/34 alphas com deprecated; 1.1.0 e 1.1.0-rc.0 sem deprecated
result: pass
source: automated
coverage_id: 05-05/D3

### 13. Pipeline changesets habilitado para releases futuras
expected: release.yml exercitado ponta-a-ponta nos publishes reais (RC + estável)
result: pass
source: automated
coverage_id: 05-05/D4

### 14. Cold Start Smoke Test
expected: Instalar @iamcalegari/mongoat@latest num diretório limpo; import CJS e ESM resolvem Database/Model sem erros
result: pass
source: automated
note: Executado nesta sessão de UAT (2026-07-14) em tmpdir limpo — installed 1.1.0, CJS OK, ESM OK. Subpath ./package.json não exportado (encapsulamento deliberado de exports, não é defeito).

### 15. Pipeline de release ponta-a-ponta (experiência do autor)
expected: Nos 2 publishes reais (RC e estável), o fluxo push:main → gate do Environment npm-publish → aprovação de 1 clique → publish com provenance funcionou sem passos manuais extras e sem publish não-aprovado
result: pass

## Summary

total: 15
passed: 15
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
