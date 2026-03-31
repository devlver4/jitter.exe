# WIGGLE 🔴

Ferramenta de desenho pixel com line boil animado (estilo WigglyPaint).

## Como rodar

```bash
# 1. Instalar dependências
pip install flask

# 2. Rodar o servidor
python app.py

# 3. Abrir no navegador
http://localhost:5000
```

## Funcionalidades

- **Gallery**: tela inicial com todos os desenhos salvos
- **Editor**: ferramenta de desenho com:
  - Motor de pixel stamp (sem anti-aliasing, igual ao WigglyPaint original)
  - 3 buffers ciclando a 12fps → line boil automático
  - 15 cores + cor personalizada
  - 6 tamanhos de pincel
  - Borracha
  - Fundo customizável
  - Tamanho do canvas ajustável (até 2000×2000)
  - Export de GIF animado
  - Salvar/carregar desenhos
  - Ctrl+Z para desfazer, Ctrl+S para salvar

## Estrutura

```
wiggly/
├── app.py               # Flask backend
├── requirements.txt
├── drawings/            # criado automaticamente
│   └── meta.json        # metadados + dados dos desenhos
└── templates/
    ├── gallery.html     # tela inicial
    └── editor.html      # ferramenta de desenho
```

## Atalhos

| Tecla    | Ação          |
|----------|---------------|
| Ctrl+Z   | Desfazer      |
| Ctrl+S   | Salvar        |
| E        | Borracha      |
| P        | Caneta        |
