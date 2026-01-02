# 🎮 Residencial Canaã - Multiplayer

## 📖 Como Rodar o Servidor Localmente

### 1. Instalar Node.js
Se ainda não tem, baixe em: https://nodejs.org/ (versão LTS recomendada)

### 2. Instalar Dependências
```bash
cd br.canaa
npm install
```

### 3. Iniciar o Servidor
```bash
npm start
```

O servidor iniciará em `http://localhost:3000`

### 4. Jogar
- Abra o navegador em `http://localhost:3000/multiplayer.html`
- Crie uma sala ou entre em uma sala existente
- Compartilhe o código da sala com amigos
- Aguarde pelo menos 2 jogadores e clique em "INICIAR JOGO"

---

## 🌐 Como Fazer Deploy (Servidor Online)

### Opção 1: Render.com (GRATUITO + RECOMENDADO)

1. Crie conta em https://render.com
2. Clique em "New +" → "Web Service"
3. Conecte seu repositório GitHub
4. Configure:
   - **Name:** residencial-canaa
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Clique em "Create Web Service"
6. Aguarde deploy (5-10 minutos)
7. Use a URL fornecida: `https://residencial-canaa.onrender.com`

⚠️ **IMPORTANTE:** No plano gratuito, o servidor "hiberna" após 15 min de inatividade. Pode levar ~30s para "acordar".

### Opção 2: Railway.app (GRATUITO)

1. Crie conta em https://railway.app
2. Clique em "New Project" → "Deploy from GitHub repo"
3. Selecione o repositório
4. Railway detecta automaticamente Node.js
5. Deploy automático!

### Opção 3: Cyclic.sh (GRATUITO)

1. Acesse https://cyclic.sh
2. Conecte com GitHub
3. Selecione o repositório
4. Deploy automático!

---

## 🎯 Modos de Jogo

### Single-Player (Original)
- Arquivo: `index.html`
- Você vs Bots
- Offline

### Multiplayer (Novo)
- Arquivo: `multiplayer.html`
- Requer servidor rodando
- Jogadores reais online

---

## ⚙️ Configurações Avançadas

### Portas
Por padrão usa porta `3000`. Para mudar:
```bash
PORT=8080 npm start
```

### Máximo de Jogadores
Edite `server.js`, linha 22:
```javascript
const maxPlayers = 50; // Altere para o valor desejado
```

---

## 🐛 Troubleshooting

**"Não consigo conectar no servidor"**
- Verifique se o servidor está rodando (`npm start`)
- Certifique-se que não há firewall bloqueando a porta 3000
- Se for jogar em rede local, use o IP da máquina: `http://192.168.x.x:3000`

**"Sala não encontrada"**
- O código da sala expira quando todos os jogadores saem
- Crie uma nova sala

**"Lag/Delay nos movimentos"**
- Normal se ping > 200ms
- Tente servidor mais próximo geograficamente
- Verifique sua conexão de internet

---

## 📝 Créditos

**Developer:** _nildoxz  
**Instagram:** https://www.instagram.com/_nildoxz/  
**Local:** Canaã dos Carajás - 2026
