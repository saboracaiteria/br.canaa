# Pasta de Modelos 3D

Esta pasta é para armazenar modelos 3D baixados do **poly.pizza** ou outras fontes.

## Como Usar

### 1. Baixar Modelos do Poly.pizza

1. Acesse [poly.pizza](https://poly.pizza)
2. Procure por modelos (ex: "building", "fps map", "house", "car")
3. Clique em **Download**
4. Escolha formato **GLB** (recomendado) ou **GLTF**
5. Salve na pasta `models/`

### 2. Carregar no Jogo

Abra `singleplayer.html` e encontre a função `loadExternalModels()`.

Descomente e ajuste o código:

```javascript
loader.load(
    'models/seu-modelo.glb', // Nome do arquivo
    function (gltf) {
        const model = gltf.scene;
        
        // Posicionar
        model.position.set(x, y, z);
        
        // Escalar (ajuste conforme necessário)
        model.scale.set(10, 10, 10);
        
        // Adicionar à cena
        scene.add(model);
        
        // Colisões automáticas
        model.traverse((child) => {
            if (child.isMesh) {
                child.userData.isWall = true;
                obstacles.push(child);
            }
        });
        
        updateCollisionBoxes();
    }
);
```

### 3. Exemplos de Modelos Recomendados

**FPS/TPS Maps:**
- `fps-map.glb` - Mapa tático
- `urban-environment.glb` - Ambiente urbano

**Construções:**
- `building.glb` - Prédios
- `skyscraper.glb` - Arranha-céus
- `house.glb` - Casas

**Props:**
- `car.glb` - Carros
- `crate.glb` - Caixas
- `barrel.glb` - Barris

## Dicas

### Ajustar Escala
Modelos vêm em escalas diferentes. Teste valores:
```javascript
model.scale.set(1, 1, 1);   // Pequeno
model.scale.set(5, 5, 5);   // Médio
model.scale.set(10, 10, 10); // Grande
```

### Rotacionar
```javascript
model.rotation.y = Math.PI / 2; // 90 graus
model.rotation.y = Math.PI;     // 180 graus
```

### Desabilitar Colisões em Props
Para objetos decorativos que não devem bloquear:
```javascript
model.traverse((child) => {
    if (child.isMesh) {
        child.userData.isSolid = false; // Sem colisão
    }
});
```

### Performance
- Prefira modelos **low-poly** (< 10k polígonos)
- Use **GLB** em vez de GLTF (mais rápido)
- Evite muitos modelos grandes (máx 5-10)

## Estrutura Recomendada

```
models/
├── maps/
│   ├── fps-arena.glb
│   └── urban-city.glb
├── buildings/
│   ├── house-1.glb
│   ├── house-2.glb
│   └── skyscraper.glb
├── props/
│   ├── car.glb
│   ├── crate.glb
│   └── tree.glb
└── README.md (este arquivo)
```

## Links Úteis

- [poly.pizza](https://poly.pizza) - Biblioteca de modelos 3D gratuitos
- [Sketchfab](https://sketchfab.com/search?features=downloadable&type=models) - Modelos baixáveis
- [Three.js GLTF Docs](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
